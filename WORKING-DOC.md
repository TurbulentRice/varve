# Retirement Tracker — Discovery & Architecture

**Status:** discovery complete; calculation core built and reconciled against the legacy data.
**Date:** 2026-08-10
**Scope:** understand the two legacy assets, extract everything portable, and set foundational direction for a cross-platform port.

**Decisions taken:** TypeScript core (§4.2) · observations + flows (§4.1) · local-first with a sync seam (§4.3) · monorepo, module-shaped (§4.4) · platform framing, retirement first · multi-tenancy modelled from the start.

---

## 1. What we're working from

| Asset | Format | Grain | Span | Role |
|---|---|---|---|---|
| `Retirement Saving Sample.accdb` | Access ACE14 (2010+), 2.7 MB | **Quarterly** | 2006–2025 | The real system. Normalized, multi-account. |
| `Retirement Progress Tracker.xlsx` | Excel 2007+, 3 sheets | **Annual** | 2020–2062 | The "condensed" version. Two people, fixed layout, projects forward. |
| `~$Retirement Progress Tracker.xlsx` | Excel lock file | — | — | Stale or currently-open marker. Ignore / delete. |

They are **not** two tools. They are two fidelity levels of one model: the `.accdb` is the ledger, the `.xlsx` is the dashboard-plus-projection. The port should target the `.accdb` model and *generate* the spreadsheet's views from it.

Authorship note: the workbook was authored by the household owner, created 2026-03-09. The Access file's catalog dates back to 2012-01-14. So the DB is the ~14-year-old original and the spreadsheet is a recent distillation.

### Reading them on macOS

Solved and reproducible — see [`legacy/extracted/extract.sh`](legacy/extracted/extract.sh):

```bash
brew install mdbtools && ./legacy/extracted/extract.sh
```

Outputs `legacy/extracted/retirement.sqlite` (whole DB, queryable), `access-schema.sql`, `access-queries.sql`, `access-objects.csv`, and `csv/*.csv`.

**What we could get:** full schema, all 187 data rows, the saved query SQL, and the complete object catalog (20 forms, 4 reports, 15 user queries, 1 module).

**What we could not get:** form/report *layouts* and VBA *source*. Both live in `MSysAccessStorage` as compressed blobs fragmented across Access pages; `olevba` rejects `.accdb`, and naive carving of the one embedded OLE header fails on incomplete sectors. No VBA keywords (`Private Sub`, `Option Compare`, `Attribute VB_Name`) appear in the file as readable text.

This turns out not to matter much. There is exactly **one** standard module, named `abjMouseWheel` — the naming convention of a third-party mouse-wheel scrolling utility for Access forms, not business logic. **Effectively all logic lives in the saved queries and form/report bindings, not in code.** The queries we have. The layouts we can re-derive from the form names, which are self-describing.

> If the layouts do turn out to matter, the cheap path is asking your dad for screenshots, or a one-hour Windows VM / borrowed PC session to export them.

---

## 2. The model as he built it

### Access schema (5 tables)

```
tblAccountOwner (4)      AccountOwnerID, AccountOwner
                         → two real owners, plus JOINT and zBench pseudo-owners

tblPortfolioType (4)     PortfolioTypeID, PortfolioType
                         → 1 Retirement, 2 College Savings, 5 Savings, 6 Benchmark

tblPortfolio (22)        PortfolioID, AccountOwnerFK, PortfolioTypeFK, PortfolioName, Active

tblYear (20)             YearID (PK, the year itself), Notes (memo)

tblPerformance (187)     PerformanceID, YearFK, PortfolioFK,
                         Q0, Q1, Q2, Q3, Q4              -- balances
                         Q1Cont … Q4Cont                 -- contributions / withdrawals
                         Q1Fees … Q4Fees                 -- fees
```

Relationships are clean and enforced: `AccountOwnerPortfolio`, `PortfolioTypePortfolio`, `YearPerformance`, `PortfolioPerformance`.

`tblPerformance` is one row per **(portfolio, year)** with the four quarters pivoted into columns — the classic Access-era wide table. `Q0` is the opening balance.

**Two design decisions of his worth keeping:**

1. **Benchmark-as-portfolio.** The S&P 500 is stored as a portfolio (`S&P Benchmark`) owned by a synthetic account owner `zBench`, with index *levels* in the `Q0…Q4` columns and zero contributions. Every return calculation therefore runs one code path for both the benchmark and real accounts, and the benchmark automatically shares the same time axis. That's genuinely elegant — carry it forward.
2. **Coalesce-down for the in-progress year.** `qryYearEndTotals` computes the year's value as `Q4 ?? Q3 ?? Q2 ?? Q1` — nested `IIf(… Is Null …)`. So the current, partial year reports its latest known quarter rather than blank. This is real business logic and must survive the port.

### The spreadsheet's model

Rows 3–131 of `Progress Summary`, in **3-row blocks per year** (Person 1, Person 2, spare) — 43 years, 2020 → 2062. Column groups, per the `Instructions` sheet (which is a written spec — read it, it's the requirements doc):

- **Inputs (manual):** `E` end-of-year value, `F` contributions/withdrawals, `G` fees, `AB` S&P return for the year
- **Totals:** `I` total retirement value, `J` total contributions, `K` total fees
- **Per account:** `M` total $ gain, `N` organic $ gain, `O` total % gain, `P` organic % gain
- **Combined:** `R`–`U`, same four measures across accounts
- **Averages:** `W` overall total, `X` overall organic, `Y` 5-yr rolling organic, `Z` 10-yr rolling organic
- **Config:** `AC2` anticipated return = **7%**, `AD2` anticipated annual contribution = **$10,000**, `AF2` mean S&P over the tracked years
- **Milestones:** column `A` flags age **62 → "Early SS"** and **65 → "Medicare"**

Two vocabulary terms to preserve verbatim, because they're his and they're good:

- **Total gain** — balance change *including* contributions. A progress measure, not a return.
- **Organic gain** — balance change *excluding* contributions. "The rate at which your savings actually changed." This is the one he compares to the S&P, correctly.

**Projection rule.** Where there's no actual data, `I` and `J` self-populate forward: `next_value = prior_value × (1 + AC2) + AD2`. Straight-line compounding at a fixed rate with a fixed annual contribution. Simple, and honestly fine as a baseline — but see §3.6.

---

## 3. Findings

Six things surfaced during extraction. #1 and #2 are the ones that should shape the architecture.

### 3.1 The return math is systematically wrong when you contribute — and the fix is already paid for

The spreadsheet's organic % gain is:

```
organic_return = (end − start − contributions) / start
```

The denominator is *starting capital only*. Money contributed in March is credited with a full year of growth. This **amplifies** the number in both directions — overstates gains, overstates losses.

The `.accdb` has quarterly balances *and* quarterly contributions, which is exactly the input for a proper chain-linked time-weighted return (Modified Dietz per quarter, mid-quarter flow assumption). Running both over the real data:

| Year | Owner | Account | Naive annual | Quarterly TWR | Gap |
|---|---|---|---|---|---|
| 2020 | Owner B | Individual 401(k) (Vanguard 8) | 29.03% | 20.39% | **−864 bps** |
| 2021 | Owner A | Traditional IRA (Vanguard) | 24.12% | 17.39% | **−673 bps** |
| 2023 | Owner B | Roth IRA (Vanguard 6) | 30.93% | 25.72% | −521 bps |
| 2021 | JOINT | Brokerage (Vanguard) | 22.52% | 18.13% | −439 bps |
| 2022 | Owner B | Traditional IRA (Vanguard) | −30.03% | −29.32% | +71 bps |

Across 144 comparable account-years: mean absolute gap **133 bps**, max **3,747 bps**, and **34 rows exceed 100 bps**.

The median gap is **exactly 0** — which is the sanity check that the implementation is right. With no cash flows, chain-linking telescopes (`Q1/Q0 × Q2/Q1 × Q3/Q2 × Q4/Q3 = Q4/Q0`) and the two formulas agree identically. **100% of the error comes from contribution timing** — meaning it appears in precisely the years you were actually saving, which are the years that matter.

This is the single biggest functional upgrade available, and it costs nothing: the data has been sitting in the `.accdb` since 2006. It also makes the S&P comparison honest for the first time, since a benchmark with no flows has no timing distortion to cancel against.

### 3.2 Transfers are invisible, and `Q0` is being used as a silent plug

161 of 165 comparable year-boundaries have `Q0` exactly equal to the prior year's `Q4`. The four exceptions are not data entry errors — they're **account rollovers**, and two of them reconcile to the cent:

| Year | Money left | Money arrived | Match |
|---|---|---|---|
| 2012 | `Corporate Savings` (closed, final Q4 2011) | `Rollover IRA (44444)` opening jump | exact, to four decimal places |
| 2022 | `Individual 401(k) (Vanguard 8)` (closed, final Q4 2021) | `Traditional IRA (Vanguard)` opening jump | exact, to four decimal places |

And a third, larger event the continuity check *can't* see, because it happened across entirely different portfolio rows — a **wholesale custodian consolidation in 2020**. Ten accounts closed at the end of 2019; six opened in their place, and the two totals agree to within a rounding error of about **0.006%**. Every legacy account stops at 2019; every `(Vanguard)` account starts at 2020. Value is preserved; identity is not.

**The model has no way to say "this money moved" as distinct from "this money was earned or contributed."** So `Q0` gets overwritten as a plug. The consequences:

- Per-account returns are **wrong across any rollover boundary** — the receiving account books a transfer as growth.
- Household-level returns still work in 2020 (the total is continuous), which is why this has gone unnoticed.
- The 2012 and 2022 events *do* corrupt per-account numbers today.

**A first-class transfer event is a hard requirement for the port.** This is the finding that most constrains the data model.

### 3.3 `Q0` is redundant state that can drift

Given #2, note the structural point separately: `Q0` duplicates the prior row's `Q4` in 98% of cases. Denormalized state with no constraint enforcing it. In the target model, opening balance should be *derived* — prior closing by construction — and any discrepancy must be an explicit, typed event rather than a silent overwrite.

### 3.4 Fees are captured but abandoned downstream

Fee columns are populated on 127 of 187 rows, non-zero on 76. But the live `qryYearEndTotals` **drops fees entirely** — the superseded `qryYearEndTotals OLD` still sums them. Somewhere along the way fee reporting was cut.

The spreadsheet keeps a `K` "TOTAL Fees Paid" column, so the intent is clearly still there. This is low-hanging and compelling: **lifetime fee drag**, expressed as "what this cost you, compounded" rather than a raw sum. Fees compound against you exactly the way returns compound for you, and almost nobody sees that number.

### 3.5 The S&P benchmark is a price index, not total return

The stored values are S&P 500 index *levels* (2006 close 1418.30 → 2025 Q1 6005.00). That excludes dividends — historically ~1.8–2.0% annually. Comparing a dividend-reinvesting portfolio's organic return against a price index **flatters the portfolio by roughly two points a year**, which over 20 years is not a rounding error.

Not a bug in his work — it's the number that's easy to get. But the port should either store total-return series or label the comparison honestly. Worth confirming which he'd prefer.

### 3.6 The projection is deterministic

`value × 1.07 + $10,000`, forever. It answers "what if every year is average?" — but no year is average, and sequence-of-returns risk is the single largest threat to a real retirement plan. The 2022 rows in this very dataset (−29% to −30%) are the argument.

Not a criticism of the spreadsheet — a fixed rate is the right *default*, and he explicitly documents changing `AC2` to explore scenarios. But a Monte Carlo or historical-sequence mode is a natural, high-value addition once the return math is trustworthy, and the 20 years of real quarterly data here is a decent seed.

---

## 4. Where this is going

Your stated end state: web-first, desktop/mobile later, institution APIs eventually, and room to absorb `financetools` + `RepayMint`. That reframes the project.

**This is not a capital-gains calculator. It's a personal finance platform whose first module is retirement tracking and whose second is loan repayment.** Naming the thing that way now changes the foundational decisions below; discovering it in six months means a rewrite.

Adjacent code, for reference:
- **`financetools`** — pure Python, **zero dependencies**, `Loan` / `LoanQueue` / `LoanQueueCompare`, unittest suite. Genuinely well-factored: a pure domain library with no I/O and no framework.
- **`RepayMint`** — Flask + MySQL + JWT + a Preact client, consuming `financetools` from git.

The instinct behind `financetools` — *pure calculation core, no I/O, consumed by a thin app* — is exactly right, and it's the pattern to repeat here. The decisions below mostly follow from taking it seriously.

### Decision 1 — Model the domain as observations + flows, not period snapshots ✅ *strong recommendation*

Replace the `(portfolio, year) → Q0…Q4` wide row with two append-only streams:

```
BalanceObservation   account_id, as_of (date), amount, source{manual|statement|api}
Flow                 account_id, occurred_on (date), amount, kind, counterparty_account_id?
                     kind ∈ {contribution, withdrawal, fee, dividend, transfer_in, transfer_out}
```

Everything else — quarterly returns, annual organic gain, rolling averages, household totals — becomes a **derivation**, not stored state.

Why this specific shape:

- **Transfers become representable** (§3.2). A rollover is one `transfer_out` + one `transfer_in` sharing a `counterparty_account_id`. Returns stop counting moved money as growth, and the 2020 consolidation becomes a describable event instead of a discontinuity.
- **`Q0` redundancy disappears** (§3.3). Opening balance is "the last observation at or before the period start." No plug, no drift.
- **Granularity stops being schema.** Quarterly is just *how often he happens to observe*. Annual entry, quarterly entry, and daily API sync are the same shape at different densities — which means the API-linking future needs **no migration**. The `Q1…Q4` columns would hard-block it.
- **TWR falls out naturally** (§3.1) — chain-link between consecutive observations, however spaced.

Cost: more rows, and simple queries get less simple. Both are irrelevant at this scale — the entire 20-year history is 187 rows. Correctness and headroom win easily.

Keep from his design: benchmark-as-portfolio (§2), coalesce-to-latest-observation (§2), owner as a first-class dimension with a `JOINT` concept, the account-type taxonomy, and the per-year `Notes` field (which holds real narrative — quarterly commentary going back to 2007 — and is worth preserving as journal entries).

### Decision 2 — Language for the calculation core ⚠️ *the real fork*

The core is pure functions over plain data: TWR, Modified Dietz, rolling averages, projections, fee drag. Small — a few hundred lines. But its language determines the shape of everything else.

**TypeScript** — Runs in the browser, so recalculation is instant and offline with no server round-trip (the entire dataset is a few hundred rows; there is no reason to ask a server what your 2014 return was). One language across web, desktop (Tauri/Electron), and mobile (React Native). Local-first becomes nearly free. Cost: `financetools` has to be ported to join it — mechanical, well-tested, but real work.

**Python** — Reuses `financetools` immediately, matches RepayMint's Flask backend, better long-term numerics story (numpy/pandas/scipy) if Monte Carlo (§3.6) gets serious. Cost: every calculation becomes a network round-trip, or you take on Pyodide; desktop and mobile targets get substantially more expensive.

**Recommendation: TypeScript core.** The dataset is tiny and the UX win from instant local recalculation is large; the desktop/mobile targets you want are dramatically cheaper from a TS codebase; and local-first is the property that makes this a real successor to a file on your dad's hard drive. Port `financetools`' algorithms incrementally when the loans module lands — or keep Python server-side purely for heavy simulation, which is the one place it genuinely wins.

This is the decision I'd most want you to push back on, since it's the one that spends existing work. **If keeping `financetools` running as-is matters more than local-first, say so and the rest of the design still holds** — Decision 1 is independent of language.

### Decision 3 — Local-first storage, with a seam for sync ✅ *recommend*

Start with a local store behind a narrow repository interface. No server, no Postgres, no auth in v1 — that's the classic over-build, and it's especially wrong for single-household data measured in kilobytes.

Ship **import/export to a plain open format** (SQLite file or JSON) in v1. That's the property that makes this a genuine successor to the `.accdb`: his data stays his, in a file he can hold. It's also the migration path and the backup story for free.

Leave the seam, though: institution linking (Decision 5) requires a server, because API tokens cannot live in a browser.

### Decision 4 — Monorepo, module-shaped from day one ✅ *recommend*

```
packages/
  core/          domain types + pure calculations (no I/O)
  retirement/    accounts, balances, flows, returns, projections
  loans/         financetools' successor
  store/         repository interface + local adapter
  ui/            shared components
apps/
  web/           first target
  desktop/       later (Tauri)
```

The point isn't the folders — it's that `retirement` and `loans` are peers over a shared `core` from the start, so absorbing RepayMint is an addition rather than a merge.

### Decision 5 — Institution APIs: set expectations now ⚠️

Worth being blunt early, because it affects what v1 must do well. Aggregators (Plaid and similar) give you **current** holdings and a limited window of recent transactions — commonly around two years. **Nobody will hand you 2006.** Exact limits vary by provider and by institution and should be verified before committing, but the shape of the constraint is reliable.

So: **API linking augments manual entry; it never replaces it.** The 20-year manual ledger remains the system of record for the back-years, and the importer (§5) is permanent infrastructure, not a one-shot migration. Manual entry needs to stay excellent — it's the primary interface for a decade of history and the fallback for every institution that won't connect.

This also argues for Decision 1 from a second direction: when daily API data does arrive, it lands in the same `BalanceObservation` / `Flow` tables as the hand-typed quarterly rows, just denser.

---

## 5. Migration path

Mostly built already. `legacy/extracted/extract.sh` handles Access → SQLite; what remains is the semantic layer:

1. **Transform** `(portfolio, year, Q0…Q4)` → observations + flows. Each row yields up to 5 `BalanceObservation`s (quarter-end dates) and up to 12 `Flow`s (contributions and fees per quarter).
2. **Reconcile the four `Q0` discontinuities** into explicit `transfer` pairs. Two are already identified to the cent (§3.2); the other two need a look, and possibly a question to your dad.
3. **Model the 2020 consolidation** as transfers linking each legacy account to its Vanguard successor — the per-account mapping needs his input, since only the totals reconcile automatically.
4. **Preserve `tblYear.Notes`** as dated journal entries.
5. **Validate**: recompute annual totals from the new model and diff against `qryYearEndTotals` output row by row. Zero drift on totals is the acceptance bar; return figures are *expected* to differ, and §3.1 explains why.
6. **Spreadsheet** — treat as a view to reproduce, not data to import. Its numbers all derive from the same underlying ledger.

---

## 6. Open questions

**Resolved.**

1. ~~TypeScript or Python core?~~ **TypeScript.** In-browser / server / native from one type-safe codebase; `financetools`' algorithms get ported into `packages/loans` when that module lands. Monetary precision was the stated concern and is handled — see §8.
2. ~~Port, or platform?~~ **Platform, retirement first**, built on his data and his thinking, but standing on its own.
3. ~~Multi-user?~~ **Modelled from the start.** `Household` is a first-class entity and every record hangs off it; nothing is built on it yet, but the tenant boundary exists so it never has to be retrofitted.
4. ~~Which legacy account rolled into which Vanguard account in 2020?~~ **Recovered from the data** — see §8.2. No need to ask.

**Still for your dad:**

5. Were fees deliberately dropped from the year-end totals (§3.4), or did that get lost in a revision?
6. Is the S&P series meant to be price-only, or would he want total return (§3.5)?
7. Three accounts are typed "Savings" but named like brokerages (`Brokerage (88888)`, `Etrade`, `Brokerage (Vanguard)`). The importer flags these; which classification did he intend?
8. `Individual Cash Reserves (11111)` sat at ~$35 from 2012 and stopped reporting after 2019 without being rolled anywhere. It is the only unexplained amount in twenty years (§8.2). Closed? Forgotten?
9. Do the form layouts matter enough to be worth a Windows session, or is a clean redesign welcome?
10. What does he actually *look at* most? 20 forms and 4 reports were built; typically two or three carry all the value, and those should anchor v1's UI.

---

## 7. Where the code is

```
packages/core/           pure domain + calculations, zero dependencies
  money.ts               exact decimal money on bigint
  time.ts                calendar dates, quarters, ranges
  types.ts               households, owners, accounts, observations, flows, notes
  returns.ts             Modified Dietz, chain-linked TWR, fee drag
  aggregate.ts           period summaries, household rollups, rolling averages
  projection.ts          forward projection, milestones
packages/store/          storage
  snapshot.ts            the JSON document: schemaVersion, revision, money as strings
  repository.ts          async, query-shaped interface
  memory.ts              in-memory adapter
  file.ts                atomic read/write (Node only, separate entry point)
packages/retirement/     the view layer a UI talks to
  ledger.ts              the working set; loadLedger is the only I/O here
  household.ts           collapsing accounts into one series, netting transfers
  history.ts             the year-by-year derivation
packages/legacy-import/  one-way migration from Access
  csv.ts                 RFC 4180 reader (keeps money as exact text)
  import.ts              wide rows -> observations + flows, transfer recovery
  fixtures/synthetic.ts  the committed stand-in for the real database
  cli.ts                 builds snapshot documents
apps/web/                throwaway view
legacy/extracted/        schema and extraction tooling (data is gitignored)
```

```bash
pnpm install && pnpm test
```

144 tests. `pnpm reconcile` prints the year-by-year comparison against Access.

---

## 8. What the core turned up

### 8.1 Money is exact, and the legacy scale was a gift

Every one of the 1,691 monetary values in the source carries exactly four decimal places — Access's `Currency` type is a 64-bit integer scaled by 10,000. `Money` is therefore a `bigint` at scale 4: a *lossless* representation of the entire twenty-year history, with room for sub-cent intermediates, and no dependency.

Rates are deliberately plain `number`s. Returns are chain-linked products and fractional powers — exactness there is neither achievable nor meaningful. `Money.ratio()` is the one crossing point between the two worlds.

Rounding is half-even throughout, because these operations compound and half-up would drift upward over a forty-year projection.

### 8.2 The 2020 consolidation is fully recoverable — no need to ask

Open question #4 turned out to be answerable from the data. Matching transfer amounts across accounts resolved **eight** moves, four of them exactly:

| Year | From | To |
|---|---|---|
| 2012 | Corporate Savings | Rollover IRA (44444) |
| 2014 | Employer 401K | Rollover IRA (55555) |
| 2018 | Ascensus | Rollover IRA (55555) |
| 2020 | Roth IRA (77777) | Roth IRA (Vanguard 6) |
| 2020 | Brokerage (88888) | Brokerage (Vanguard) |
| 2020 | Self Employed 401(k) (22222) | Individual 401(k) (Vanguard 9) |
| 2020 | Self Employed 401k (15458) | Individual 401(k) (Vanguard 8) |
| 2022 | Individual 401(k) (V8) | Traditional IRA (Vanguard) |

Every one matched to four decimal places, and account *types* corroborate each pairing independently — Roth to Roth, brokerage to brokerage, 401(k) to 401(k) — so these are not coincidences of arithmetic.

The remaining four IRAs merged many-to-one, which no pairwise match can see. Summing per owner resolves it: Owner A's two legacy IRAs sum to their single new Vanguard IRA, and Owner B's two do likewise — **each to within one cent**, which is rounding, not ambiguity.

**One warning survives the whole import**, and it names itself: `Individual Cash Reserves (11111)`, a dormant account holding a two-figure balance since 2012. It stopped reporting after 2019 and was never rolled anywhere. It accounts for the entire discrepancy between the 2019 close and the 2020 open noted in §3.2 — the single unexplained amount in twenty years of records.

> Specific balances are omitted throughout this document by design; see §9.3. The mechanics are demonstrated on invented numbers in `packages/legacy-import/test/fixtures/synthetic.ts`, which reproduces each of these structural cases.

### 8.3 Reconciliation: zero drift

Year-end totals recomputed from the migrated model match Access's `qryYearEndTotals` **exactly, every year from 2006 to 2025** — twenty consecutive `$0.00` deltas. The acceptance bar from §5 is met.

Returns move, as predicted. 34 account-years shift by more than a percentage point:

| Year | Account | Legacy | Corrected | |
|---|---|---|---|---|
| 2008 | Employer 401K | −50.95% | −13.47% | +3,747 bp |
| 2012 | Rollover IRA (44444) | 33.93% | 11.29% | −2,264 bp |
| 2009 | Employer 401K | 51.11% | 33.65% | −1,746 bp |
| 2010 | Etrade | 42.32% | 32.73% | −959 bp |

The 2008 case shows the pathology at its worst: a small account whose contributions dwarfed its starting balance, so dividing by starting capital alone reported a 51% loss where the money actually lost 13%.

And the control holds — on real data, every account-year with **no** external flows produces an identical number under both methods, because chain-linking telescopes. The correction only ever touches years where money actually moved.

### 8.4 Two smaller corrections worth knowing

- **Rolling averages should be geometric.** The legacy `AVERAGE` columns take the arithmetic mean of annual returns, which always overstates what was earned: +50% then −50% averages to zero but leaves you down 25%. Both are implemented; the legacy one is retained only for reproducing the old view.
- **Closed accounts need a zero.** Without an explicit closing observation, a dead account's last balance answers "what was this worth?" forever, and every household total after it double-counts. The importer writes one, paired with a transfer out.

---

## 9. Initializing the real project

The layout above is already the target shape from Decision 4, so promoting this spike is mostly moving and renaming.

**1. Name it.** `retirement-tracker` no longer describes it, and the package scope `@varve/*` throughout is a deliberate placeholder — it names the layer, not the product. Worth choosing before `git init`, since it touches the directory name, the scope, and eventually the domain. (`RepayMint` suggests a family, but Mint is a retired Intuit product and the association may be more liability than asset.)

**2. Split the repo from the archive.** ✅ Done — the `.accdb`, the `.xlsx`, and `extracted/` now live under `legacy/`.

**3. Keep the real data out of git.** ⚠️ *This supersedes an earlier draft of this section, which suggested committing `extracted/csv/` so the reconciliation test would travel with the repo. That was wrong.*

The account numbers in the source were already masked, but the balances are real, the owner names are real, and `tblYear.Notes` records quarterly net worth by initial. Git history is effectively permanent, and this repository is meant to become public. Committing it once is a decision that cannot be taken back without rewriting history everywhere it has been cloned.

The split that is committed:

| Committed | Ignored |
|---|---|
| `extract.sh`, `access-schema.sql`, `access-queries.sql`, `README.md` | `*.accdb`, `*.xlsx`, `csv/`, `*.sqlite`, `access-objects.csv` |
| Pure structure — documents what the migration migrates *from* | Every real balance |

The reconciliation suite detects whether the data is present: it runs locally, and skips loudly on a fresh clone rather than failing. Regenerate with `legacy/extracted/extract.sh`.

**3a. Then replace it with a synthetic fixture.** Skipping is a stopgap, not an answer — a flagship test that silently does nothing on every clone and in every CI run will rot. The fix is a small hand-authored dataset in the Access shape that reproduces each structural quirk the real data taught us: a rollover matching a closure, a many-to-one consolidation, a partial current year, a dormant account that never reconciles, fees, and a benchmark. Obviously-fake round numbers, committed, always runs. The real data then becomes an *additional* local pass that must agree with it.

**4. Then build outward, in this order:**

- `packages/store` — repository interface + a local adapter, plus import/export of a plain open file. This is what makes the thing a real successor to the `.accdb`: his data, in a file he holds.
- `apps/web` — the first UI. Anchored on whichever two or three views actually get used (open question #10), not on all 20 forms.
- `packages/loans` — `financetools` ported. Peer to `retirement` over the same core, which is what makes RepayMint an addition rather than a merge.

**5. Deferred deliberately, with the seam left open:** the server (needed only when institution linking arrives, since API tokens cannot live in a browser), auth, and sync. Building any of them now would be building for a user who does not exist yet.

✅ Done. `packages/store`, `packages/retirement`, and a throwaway view all exist, and the model survived contact with a UI — see §10 for what comes next.

---

## 10. Roadmap

Decided: **React on Vite** for the UI. Not Next.js — this is local-first with no server, no SSR requirement, and a desktop/mobile target that a server framework actively complicates.

**On "shared components across platforms."** Mostly a myth worth naming. Desktop is solved by any framework (Tauri wraps a web app). Mobile is either React Native — genuinely native, but *not* sharing components with web — or a webview shell. What actually ports untouched is `core`, `store`, and `retirement`: the money, the ledger, the derivations. The plan is to **share the packages, not the components**, and design mobile as its own surface over the same core. UI components are the layer least likely to survive a platform jump anyway, because a good phone UI here is not a shrunken desktop one.

**On charts.** No charting library. `d3-scale` / `d3-shape` / `d3-array` for the math, SVG written by hand (or `visx`, which is thin React wrappers over exactly those). Chart libraries are built for standard charts and fight back the moment you want something distinctive — which is the whole point here. The first chart is real work because it establishes the patterns; each one after is hours. Charts and CSS must read the **same** theme tokens, or the visualizations drift out of sync the first time anything is rethemed.

### Order

**1. Monte Carlo and better projections** — `packages/retirement`, in progress

Framework-free, and the feature named as central to the product: check readiness, run a simulation without needing the terminology. Addresses §3.6 directly — a single assumed rate answers "what if every year is average?", and no year is. There are twenty years of real quarterly returns here to seed and validate against, which is a rare thing to have. Accumulation with a target first; drawdown and depletion follow.

**2. Framework and the first real UI** — ✅ done

React + Vite. Tokens in `theme/tokens.css`, read by CSS *and* by the chart, so a
visualization cannot drift out of sync with the interface or need a parallel set
of hex in JavaScript.

The chart is hand-written SVG over `d3-scale` and `d3-shape`: history running
into the simulated fan, one axis, one hue, with the boundary marked. Nested
bands are the magnitude of uncertainty, which is a sequential job, so they are
washes of the line's own hue rather than separate colours.

Colour that carries meaning was validated rather than eyeballed. That caught two
things. A muted green fell below the chroma floor and read as grey. And gain
against loss separates by roughly ΔE 4 under deuteranopia — a failure inherent
to red/green, not a bad pick, since purpose-built status colours fail it too. The
sign therefore carries the meaning everywhere and colour only reinforces it.

Each chart has a table twin behind a disclosure, which serves the readers who
want numbers and the rule that no value be reachable only by hovering.

**3. Editing**

`store` already has the write path; nothing calls it yet. Manual entry needs to feel good — it is the primary interaction, even if it is not the focus. Once a year, a handful of numbers per account, and it should feel like taking ownership rather than filing a return.

**4. Per-account views**

Deliberately after a UI exists. Designing that API with nothing consuming it would repeat the mistake that made graduating `history.ts` necessary in the first place.

**5. `packages/loans`**

`financetools` ported to TypeScript. Peer to `retirement` over the same core, which is what makes absorbing RepayMint an addition rather than a merge.

**Deferred, with the seam left open:** server, auth, sync, institution APIs. A household's ledger as one `jsonb` document per row, fetched at load and written back on change, with `revision` for optimistic concurrency — and the option to encrypt it client-side so the server holds what it cannot read. None of it is worth building for a user who does not exist yet.
