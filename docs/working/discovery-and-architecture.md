# Varve — Discovery & Architecture

The working document for phases 0–5: reading the two legacy assets, the findings
that came out of them, the architectural decisions with their trade-offs, and
every phase built so far. It is long because the reasoning is the point.

**Started:** 2026-08-10 · **Covers:** discovery through the loans port (§11).
For where things stand right now, see [`docs/STATUS.md`](../STATUS.md).

**Scope:** understand the two legacy assets, extract everything portable, and set foundational direction for a cross-platform port.

**Decisions taken:** TypeScript core (§4.2) · observations + flows (§4.1) · local-first with a sync seam (§4.3) · monorepo, module-shaped (§4.4) · platform framing, retirement first · multi-tenancy modelled from the start · loans as a peer over the same core (§11).

> **The section numbering here is load-bearing.** Code comments cite it directly
> — `§8.1` for the money conventions, `§11.2` for the loans rounding argument,
> `Decision 4` for the monorepo shape. Extend it; do not renumber it.
>
> This document accumulates. Where a conclusion in it turned out to be wrong, the
> correction is marked in place rather than edited away — see the warning boxes in
> §9.3 and §11.2. That record is the valuable part: twice, a correction written
> this way survived a later session about to repeat the mistake.

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

Solved and reproducible — see [`legacy/extracted/extract.sh`](../../legacy/extracted/extract.sh):

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
7. What does he actually *look at* most? 20 forms and 4 reports were built; typically two or three carry all the value, and those should anchor v1's UI.

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

> Specific balances are omitted throughout this document by design; see §9.3. The mechanics are demonstrated on invented numbers in `packages/legacy-import/src/fixtures/synthetic.ts`, which reproduces each of these structural cases.

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

**3. Editing** — ✅ done

Persistence first, because an edit that dies on refresh is not an edit.
`SnapshotStore` is a two-method port — read the document, write the document —
which is the whole surface `localStorage`, a file, and an HTTP endpoint holding
a `jsonb` column have in common. `PersistingRepository` decorates any repository
and writes after every mutation, so a save nobody remembers to call cannot lose
anything.

`planYearEntry` holds the translation from what a statement says to what the
ledger stores. A closing balance is dated 31 December; an annual contribution
total has no date of its own and is recorded mid-year, since that is what
"accumulated through the year" weights to. Ids are derived from account and
period, so saving a year twice corrects it instead of duplicating it — the only
forgiving behaviour for a form someone meets once a year.

Imported years are shown but locked: they hold quarterly detail an annual form
cannot express, and one December box overwriting four quarters would destroy
information silently.

Editing immediately exposed a latent bug the imported data never could, because
it has no gaps. A year with no balance of its own was reported as a flat 0%
year rather than a gap, and counted toward the average return. `YearRow` now
carries `recorded`, gaps are excluded from every average and from the returns
that seed a simulation, and the table says *no record* rather than 0.0%.

**4. Per-account views** — ✅ done

The payoff for the discovery work: the legacy formula was only mildly wrong at
household level, where contributions are small against the balance, and badly
wrong per account, where an account funded from a low base is the pathological
case.

`summarizeSeries` is shared between the two levels, because they want the same
table. What differs is what goes in, and one thing inverts: a transfer between
tracked accounts is netted away for the household — the money never left — but
counts in full for an account, where it genuinely arrived or departed. Treating
a rollover as growth is the exact error the ledger was reshaped to prevent.

Building it surfaced a second gap-shaped bug. A year with only a closing balance
and nothing before it was reporting its whole balance as growth — a first manual
entry of $100,000 came back as "earned $100,000". `YearRow` now carries
`measurable`: whether the account was seen at least twice across the year. Two
observations is the right test rather than "was there one before the year",
since an account opened on 1 January and funded through it *is* measurable. It
also correctly refuses to credit the year after a multi-year gap with all the
growth that accumulated during it.

**5. `packages/loans`** — ✅ done

`financetools` ported to TypeScript. Peer to `retirement` over the same core,
which is what makes absorbing RepayMint an addition rather than a merge. The
decisions taken before writing any of it are in §11; what building it turned up
is in §11.7.

All five strategies plus the comparison, reconciled against the Python line for
line — 2,948 installments, generated by running the original and committed as a
fixture, so the port is provably faithful rather than plausibly so.

The one that mattered: a rounding measurement that was correct and whose
conclusion was wrong. Randomly generated rates never terminate when divided by
twelve, so the probe could not see the case where half-up and half-even disagree
— and real loans are quoted at exactly the round rates that do. Re-measured
properly, half-even is never worse and half-up drifts upward in 87 of 288 loans.
The convention held; the write-up that said parity was unconditional did not.

Loans stay standalone. Wiring them into the ledger and the UI is its own phase,
so the API gets designed against a real consumer — the `history.ts` lesson.

**Deferred, with the seam left open:** server, auth, sync, institution APIs. A household's ledger as one `jsonb` document per row, fetched at load and written back on change, with `revision` for optimistic concurrency — and the option to encrypt it client-side so the server holds what it cannot read. None of it is worth building for a user who does not exist yet.

---

## 11. Porting `financetools`

`financetools` is ~650 lines of dependency-free Python that models loan
amortization and compares repayment strategies. It is consumed today by
RepayMint, and its instinct — a pure domain library with no I/O and no framework
— is the one §4 said to repeat. Porting it is what turns Decision 4's folder
layout into an actual claim: `retirement` and `loans` as peers over one `core`.

The decisions below were taken before any code was written, and three of them
were settled by measurement rather than argument.

### 11.1 Shape: functions over plain data, not objects that accumulate

The Python is mutable and object-oriented. A `Loan` owns a `Payment_History`
dict that `pay_month()` appends to; `LoanQueue.debt_solve()` branches the queue,
mutates the copies until every loan is paid, and hands back the wreckage. It
works, and the branching discipline keeps the mutation contained, but it is not
what this codebase looks like. Ground rule 4 says domain packages are pure, and
`retirement` obeys it: `summarizeSeries` is a function from plain data to plain
data, and `loadLedger` is the only thing in the package that touches the world.

So the port inverts the shape. `amortize(terms, plan)` returns a `Schedule` —
a frozen list of installments — instead of a `Loan` that has become its own
history. `repay(loans, plan)` returns a `Repayment`. Nothing mutates, `branch()`
disappears because there is no state to protect, and `solve()` disappears
because every function was already non-destructive.

The cost is that a caller wanting to advance a loan month by month has to thread
the balance itself rather than calling `pay_month()` five times. That is the
right trade here: the consumers are a UI drawing a whole schedule and a
comparison running five strategies to completion, and both want the finished
series, not an object to poke.

Names carry over verbatim where they are the author's: **avalanche**,
**blizzard**, **snowball**, **cascade**, **ice slide**. They are good names, they
are what RepayMint's interface says, and the same argument that preserved
"organic gain" in §2 applies. `debt_solve` becomes `repay`, since it is the one
name that describes the implementation rather than the domain.

### 11.2 Rounding: measured, then measured again

The stated fork was that `financetools` quantizes to cents with `ROUND_HALF_UP`
while Varve rounds half-even (§8.1) — so matching Python exactly would break the
house convention, and keeping the convention would put the port a cent away from
the original.

The way to settle it was to run it. Patching `Loan.Dec` to round half-even and
re-running the real algorithm gives **identical output** on the five documented
strategies, on 200 randomly generated four-loan queues, and across a further 375
runs covering all three minimum-payment modes. Not one cent, anywhere.

> ⚠️ **That measurement was right and the conclusion drawn from it was wrong.**
> The first draft of this section concluded "parity is exact, no exception to
> record". Building the port disproved it within the hour: the very first
> fixture with a round rate diverged, and it diverged for a reason the probe had
> been blind to.
>
> Half-up and half-even differ only on an exact tie, and the quantity rounded is
> `balance × rate ÷ 12`. At a *quoted* rate — 4.41%, 22.99%, 6.10% — that
> division does not terminate, so the product never lands on a half-cent and the
> two modes genuinely cannot disagree. The probe drew its rates at random to two
> decimal places and therefore drew non-terminating ones every time.
>
> Round rates terminate. 6% is exactly 0.005 a month, so any balance ending in an
> odd dime puts the interest precisely on a half-cent — about one balance in two
> hundred. 18% is exactly 0.015. Real loans are quoted at round rates constantly.
> The tie is not contrived; the probe simply never sampled the case.

Re-measured on round rates, across 288 loans spanning 3% to 24%: half-even is
**never** higher than half-up. Half-up is higher in 87 of them and the two agree
in the other 201. The mean effect is about two cents per loan and the net across
all 288 is −$6.13.

That one-directional bias is the entire argument, and it is the same argument
§8.1 makes for the retirement core: half-up breaks every tie away from zero, so
on a balance that compounds monthly for up to 360 months it drifts upward and
keeps drifting. Here the drift lands in the borrower's disfavour. **Half-even
stands** — not as a compromise against the original, but because on the cases
where the two differ at all it is the better answer.

Parity is therefore stated precisely rather than absolutely: the port reproduces
`financetools` **exactly, line for line, with the rounding convention held
constant**. The fixture is generated twice, once under each mode, and the port is
checked against the half-even run — which tests the algorithm and nothing else.
What the convention itself costs is measured separately and pinned by its own
tests. Across the committed fixture, 78 of 2,948 installments differ between the
modes: 2.65%, never more than a cent on any interest charge, and never enough to
move a payoff date.

What *does* move the numbers is the **scale**, and that is the decision that was
actually hiding behind the rounding question. Quantizing to scale 4 rather than
to cents changes lifetime interest in every single trial — by $0.0001 to $0.73
across a queue's life, and by up to $0.09 on the four-loan documented fixture.
It never changed a payoff duration or a payment count in 200 trials, so the
effect is real but small.

Schedules quantize to **cents, per installment**. Scale 4 exists because Access
stored `Currency` at four places and the twenty-year retirement history had to
round-trip losslessly (§8.1); that reasoning has nothing to say about loans. An
installment is not an intermediate value, it is a transaction someone actually
makes, and nobody has ever owed a fraction of a cent. `Money` remains the type,
at scale 4 like everywhere else; the loan module simply keeps every balance,
payment, and interest charge on the cent grid, which is what a servicer does.

One implementation note that matters for parity. Python computes interest at
full `Decimal` precision and quantizes once, at the moment it records the
payment. Rounding to scale 4 first and to cents second is a *double* rounding
and can disagree with a single one — `31.93495` goes to `31.93` in one step and
to `31.94` in two. The port therefore rounds to cents in a single division. The
other two quantities fall out of that one without further rounding: because
half-even is symmetric and both the balance and the payment already sit on the
cent grid, `round(payment − interest)` is exactly `payment − round(interest)`,
and likewise for the balance carried forward. The clamps for overpayment and
underpayment survive the reformulation too, since the cases where the
full-precision and cent-rounded tests disagree are precisely the cases where
both answers round to the same installment.

### 11.3 Where the Money/number seam falls

Balances, payments, interest charges, and budgets are `Money`. The interest rate,
the monthly rate, the discount factor `((1+r)ⁿ − 1)/(r(1+r)ⁿ)`, and the
proportional weights that cascade and ice slide distribute by are `number`.
Exactly two operations cross:

```
interest         = balance × monthlyRate        Money × number → Money
minimum payment  = principal ÷ discountFactor   Money ÷ number → Money
```

Both round to cents in one step, as above.

Rates are also expressed as **fractions**, not percentages — `0.061`, not `6.1` —
matching `annualReturn: 0.07` in `projection.ts`. This is an API change, not an
output change; the monthly rate is identical either way.

That last point is worth stating separately, because the Python gets it wrong in
an instructive way. `Loan.__init__` passes the interest rate through the same
`Dec()` helper it uses for money, so `Loan(1000, 4.875)` silently becomes a
4.88% loan. A rate is not an amount, it has no cent grid, and rounding it to two
places is the precise confusion `Money.ratio()` exists to keep separate. The
port keeps rates unrounded. **Parity fixtures must therefore use rates with two
or fewer decimal places**, or the port will disagree with the Python and be
right to.

### 11.4 Parity fixtures: reconcile against the original, as the migration did

The Access migration is trusted because recomputed totals match Access's own
query exactly, every year for twenty years (§8.3). The same standard applies
here, and it is available for the same reason: there is an independent
implementation to check against.

A script generates complete schedules from the Python — every installment, not
just the totals — and commits them as JSON fixtures. The port replays them and
must agree line for line. This makes the port *provably* faithful rather than
plausibly so, and it is cheap, because the oracle already exists and passes its
own tests.

The fixtures use invented round-ish loans, so nothing about anyone's real debt
enters the repository. That is a weaker version of ground rule 1 than the
retirement data needed, but the habit is worth keeping.

### 11.5 Faithful first, then corrected — with the departures named

Where the Python is arguably wrong, the port reproduces it first and departs
deliberately, with each departure tested on its own. This is the migration's
pattern exactly: totals reconciled to zero drift while returns were *expected* to
move, and §8.3 records the gap rather than hiding it.

Three departures are known going in.

**Rates stay rates** (§11.3). `4.875%` is a 4.875% loan.

**Proportional distribution preserves the budget.** Cascade and ice slide split
the leftover budget across loans in proportion to interest rate and to monthly
interest cost respectively. The Python computes each loan's share independently
and rounds each one, so the shares need not sum to the budget — a cent or two
appears or evaporates every cycle. `Money.allocate` was written for exactly this
(largest-remainder, total preserved exactly), and using it means the budget the
user typed is the budget that gets spent. Parity for these two strategies is
therefore *deliberately* inexact, and the fixture asserts the correction rather
than tolerating the drift.

**A 0% loan has a defined minimum payment.** The discount factor divides by `r`,
so `financetools` raises `DivisionUndefined` on an interest-free loan — which is
a real product, not a degenerate input. The limit as `r → 0` is simply
`principal ÷ term`, and the port returns it.

A fourth thing the port exposes rather than changes: when a payment does not
cover the interest due, the Python capitalizes the shortfall into the balance and
records only the interest actually *paid*. That is coherent negative
amortization, but the difference between accrued and paid interest vanishes from
the record. `Installment` carries a `capitalized` field so the balance growing
while nothing is repaid is visible in the schedule instead of inferred from it.
No number changes; one becomes legible.

### 11.6 Scope, and what stays out

All five strategies land together, plus the comparison that ranks them. They
share a single driver, so once ordering and distribution exist each strategy is a
few lines, and three-of-five would leave that driver half-exercised for no real
saving.

Left behind: the `display_info` / `expanded_info` / `history_info` printers,
which are a CLI for a library that now has a UI; and `recursive_solve` with its
`solve_for_interest` / `solve_for_np` wrappers, which the Python's own comments
document as an experiment that is no faster and caps out at Python's recursion
depth. The capability it offered — model a payoff without disturbing the object —
is not needed in a package where nothing mutates in the first place.

**Integration is a separate phase.** `loans` ships standalone: no ledger wiring,
no UI, no account linkage. Designing that API before there is a consumer is how
you get an API shaped like a guess — the lesson from `history.ts`, which was
built inside the web app and only graduated to a package once use had tested its
shape. Loans in the interface, and the question of whether a loan is an account
with a negative balance or a different thing entirely, come after.

### 11.7 What the port turned up

195 tests. The port reproduces `financetools` line for line: every installment of
every loan under every ordered strategy, across seven single-loan schedules and
six queues — 2,948 installments, with the rounding convention held constant.

**The rounding probe was right and its conclusion was wrong**, which is written
up in §11.2 because the correction is the valuable part. A measurement over
randomly generated inputs answered a question nobody had asked: it sampled two
decimal places uniformly and so never drew a rate whose monthly value terminates.
Round rates are not an edge case, they are how loans are quoted. The lesson is
narrower than "measure more" — it is that a random probe tests the distribution
it samples from, and choosing that distribution is itself a modelling decision.

**`Money.allocate` allocates at scale 4, which is the wrong grid for a payment.**
The correction in §11.5 was supposed to be a one-line swap to a helper written
for exactly this job. It preserved the total, as advertised, and split $1,000
three ways into $333.3334 / $333.3333 / $333.3333 — three amounts that sum
correctly and that nobody can pay. Splitting the *cent count* instead puts the
odd cent, rather than the odd hundredth of one, on the loan with the strongest
claim. Caught by a test asserting the payments were the expected pair of figures,
and now pinned directly by one asserting every amount a strategy produces sits on
the cent grid.

**Three assertions about strategy behaviour were wrong, and the numbers were
more interesting than the guesses.** Written before running them:

- *Snowball pays the most interest.* It does not — **blizzard** does, by a wide
  margin: $2,240 against avalanche's $1,601 on the same debt, about 40% more.
  Ranking by monthly interest *cost* rather than by rate lets a large cheap
  balance out-shout a small dear one, and the README's description of blizzard as
  "similar to Avalanche" undersells how differently it can behave.
- *Scheduled minimums beat servicing interest.* Backwards. Under avalanche,
  `interest-only` minimums cost **less** ($1,601 against $1,715), because holding
  the cheap balances still sends every spare dollar at the dearest debt instead of
  diverting some into paying down 3% money early. This is presumably why the
  Python defaults to it, though it never says so.
- *A retired loan's budget visibly speeds up the survivors.* True, but not where
  it was looked for — under avalanche the freed money goes to the next target, not
  to the loan being watched. The property worth asserting is the invariant behind
  it: every month that does not retire a loan spends the budget in full.

**A fourth departure, unplanned.** `financetools` computes `get_p_to_i()` as
principal over interest and raises `ZeroDivisionError` on a loan that never
charged any — the same interest-free loan that already breaks `min_payment`.
Both now return `null`, alongside `percentPrincipal`, which the Python reports as
`0` when nothing has been paid. No payments made is not the same as a payment
that achieved nothing, and §3 of the ground rules is exactly this distinction.

**What did not need changing.** The awkward cases are the parts the Python gets
right and gets right quietly: clamping the final installment so a payoff never
overshoots into credit, and capitalizing unpaid interest by computing the balance
carried forward *before* zeroing a negative principal payment. Both survive the
rewrite into pure functions untouched, and both have their reasoning written into
the port because neither is obvious from the code.

One further consequence of the pure-function shape: the single rounding in §11.2
was not just a fidelity trick. Because half-even is symmetric and the balance and
payment are already whole cents, `round(payment − interest)` is *exactly*
`payment − round(interest)`, so one rounding produces all three figures in an
installment. The clamps survive the reformulation too — the cases where the
full-precision and cent-rounded tests disagree are precisely the cases where both
answers round to the same installment. That is why the port can match a
28-significant-digit `Decimal` implementation using a `bigint` and a `number`.

---

## 12. Routing

The app has held its view state in `useState` since the first UI: a nullable
`openAccount`, a nullable `editingYear`, and a dashboard when both are null.
Three early returns in one component. It worked because there were three
surfaces and one reader, and it stops working for a reason that has nothing to
do with how many surfaces there are.

An account page you cannot link to, cannot bookmark, and cannot leave with the
back button is not a page. It is a modal wearing a page's clothes. The back
button in particular is the tell: on a phone it is the system gesture, so the
first instinct after opening an account is the one action the app answers by
closing the whole thing.

Loans will add a fourth surface, and comparing repayment strategies is the first
view here that someone would genuinely want to send to another person. That
turns a nuisance into a structural problem, which is why this comes before the
integration rather than after it.

### 12.1 A route is a domain type, not a string

The decision that shapes everything else: routing is modelled as a **discriminated
union** with pure `parseRoute` and `formatRoute` functions on either side of it.

```
type Route =
  | { view: 'dashboard' }
  | { view: 'account'; accountId: AccountId }
  | { view: 'year'; year: number }
```

Nothing about that is React. It is a parser and a printer over a small algebra,
which means it is testable the way the rest of this codebase is testable — plain
data in, plain data out, no DOM and no framework. The React layer on top is a
single hook that subscribes to `hashchange` and calls `parseRoute`.

This is the same shape the project keeps arriving at, and the reason to name it
explicitly is that it keeps paying. `core` is pure and the app is a shell over
it. The charts are hand-written SVG over `d3-scale`, with the maths separated
from the rendering. Now the router: the interesting part is a total function
from a string to a union, and the framework integration is the boring part.

The property worth having is that **an unparseable URL is not an error state**.
`parseRoute` is total — anything it does not recognise is the dashboard. A stale
link, a typo, a hand-edited hash, a route removed in a later version: all land
somewhere sensible rather than on a blank screen. There is no 404 in an app whose
entire dataset is in the browser, and pretending otherwise would be inventing a
failure mode.

### 12.2 Hash, not paths

`#/accounts/acct:1`, not `/accounts/acct:1`.

Real paths are prettier and are what people expect, and they require the host to
rewrite unknown paths to `index.html`. That is a `_redirects` file, or the
Pages 404 trick, or an nginx `try_files` — a piece of configuration that lives
somewhere other than this repository, is easy to forget, and fails in a way that
looks like the app is broken rather than the host is misconfigured.

Hash routing needs none of it. It works on any static host, it works from
`file://`, and it works unchanged inside a Tauri shell — which §10 names as a
target and which does not serve over HTTP at all. For a local-first app with no
server, that is the honest default rather than the lazy one: the URL is uglier
in exchange for the app working everywhere it is put, with no deployment
knowledge encoded outside the build.

Should paths become worth it later, `parseRoute` and `formatRoute` are where the
change lands, and the union does not move.

### 12.3 Why not a router library

React Router would do this, costs 15–20 KB gzipped, and brings loaders, nested
layouts, and a concept surface that four routes cannot use.

The argument against it is the one §10 already made about charts: a library
built for the standard case fights back the moment the case is not standard, and
what this app needs from routing is genuinely small — four views, one parameter
each, no nesting, no data loading, since the entire ledger is already in memory
before the first render. A hundred lines of typed parser answers all of it and
adds nothing to reason about later.

The risk in hand-rolling is the usual one: it grows into a bad router. The guard
is that the union is the whole interface. When a route needs something the union
cannot express — a query string, genuine nesting, a loading state — that is the
signal to adopt a real router, and by then the call sites will already be
expressed in terms of `Route` values rather than strings, which is what makes
the swap mechanical rather than a rewrite.

### 12.4 What the URL says, and what it must not

Route parameters are identity, never data. `#/accounts/acct:1` names an account;
it does not carry a balance, a name, or anything else about it. That matters
here more than it usually would, because a URL is the single most likely thing
to be copied out of this app and pasted somewhere else — into a chat message, a
bug report, a screenshot. Ground rule 1 is about what reaches a bundle, but the
same instinct applies to what reaches a clipboard.

Account ids are already opaque and local to the document (`acct:1`), so they
carry nothing. The year editor takes a year. Neither leaks.

### 12.5 What the work turned up

Routing cost **+0.59 KB gzipped** — 296.13 KB to 297.72 KB raw. React Router
would have been 15–20 KB for the same four views, which is the ratio §12.3
predicted without being able to check it.

The app also gained tests for the first time. `parseRoute` and `formatRoute` are
pure, so they are unit-testable with no DOM and no React, and there are thirty of
them: every malformed URL a person could plausibly be holding, the escaping of an
id containing a slash, and a round-trip property over every route shape. `pnpm
test` was already `pnpm -r test`, so CI picked them up with no configuration —
which is an argument for keeping the interesting part of a UI concern outside the
UI, since that is the only reason there was anything cheap to test.

**Two assertions in those tests were wrong before the code was.** One expected
the formatted hash to contain no `#`, which every hash begins with by definition.
The other expected `interestDue`-style arithmetic that had simply been done
wrong on paper. Both were test bugs rather than code bugs, and both were found in
seconds because the functions are pure — which is most of the argument for the
split.

**Looking at the running app changed a decision.** §12.1 said an unrecognised URL
falls back to the dashboard, and the first implementation *also* rewrote the
address bar when a well-formed route named an account the ledger does not have —
on the reasoning that showing one thing while the URL claims another makes the
URL a lie.

Driving it exposed that as inconsistent and quietly destructive. `#/nowhere`
keeps its URL and renders the dashboard; a missing account silently became `#/`.
Two behaviours for one situation. Worse, the rewrite erases the evidence: someone
told "that link does not work" cannot say what they tried, because the app has
already replaced it.

The URL now stands in both cases, and the app *says* the account is not in this
ledger. Absent is a fact worth stating rather than normalising away, which is
ground rule 3 wearing different clothes — it was about numbers, and it is really
about not silently substituting a plausible value for a missing one.

**Year stepping confirmed the push/replace split was worth making.** Five steps
through the editor add zero history entries, so the way out is always one press
back. Verified in the browser rather than reasoned about: `history.length` before
and after.

One thing deliberately not solved. Opening a deep link as the very first page and
then pressing back leaves the app, because there is no history to return to. That
is correct browser behaviour and not something a router should fake; the
persistent "← All accounts" control is what covers it.

---

## 13. Loans in the ledger

`packages/loans` has been finished and unused since §11, deliberately: the
integration API should be designed against a real consumer rather than guessed
at, which is the `history.ts` lesson. This is that consumer.

### 13.1 A loan is its own entity, not an account with a negative balance

The tempting option is `kind: 'loan'` on `Account`, balances stored negative.
Everything already built would carry it — observations, flows, the repository,
persistence — and net worth would fall out of a sum that already exists.

It is the wrong shape, and the reason is written in §3.3. The legacy model had
no way to say *this money moved* as distinct from *this money was earned*, so
`Q0` became a plug and per-account returns went wrong across every rollover. The
lesson generalises: **when two concepts differ in kind, giving them one
representation does not unify them, it hides the difference until something
downstream gets it wrong.**

A loan differs from an asset account in ways that are not about sign:

- **Interest is a cost, not a return.** `summarizeSeries` would compute a
  time-weighted return and an "earned" figure for a debt. Both are meaningless,
  and worse, both are *plausible-looking*.
- **A loan has a contract.** A rate and a term that say what is supposed to
  happen. No asset account has that.
- **"Paid off" is success; "closed" is neutral.** A zero balance means opposite
  things in the two cases.
- **`shareOfHousehold` goes negative**, and every filter that currently reads
  `kind !== 'benchmark'` would need to learn a second exception.

That last point is the tell. The benchmark already demonstrates the pattern —
`deriveHistory` and `deriveAccountHistories` both special-case it — and one
exception carried gracefully is not evidence that a second will be. It is
evidence that the type is being asked to mean two things.

So loans get their own collection in the snapshot. Nothing in `retirement`
changes, and nothing in `retirement` needs auditing.

### 13.2 But the record half is still observations

Modelling loans separately is not licence to abandon Decision 1. The obvious
shortcut — a mutable `balance` field on the loan record — is exactly the
period-snapshot shape §4.1 rejected, and it would drift the same way `Q0` did.

So a loan is **terms plus observations**, mirroring an account:

```
Loan             identity, rate, term remaining, kind
LoanObservation  "this much was owed on this date"
```

What is owed *now* is the latest observation, derived the same way
`balanceAsOf` derives an account's value. The entry form writes an observation
rather than mutating a field, so a balance corrected next month sits alongside
the old one instead of erasing it.

Payment flows are deliberately **not** in this slice. A loan's interesting
output is forward — what it costs, how long it takes, which strategy wins — and
that needs the balance, the rate, and the remaining term, none of which are
payment history. Recording actual payments and reconciling them against the
schedule is a real feature and its own phase, and the shape above accommodates it
without moving: payments are flows against a loan, exactly as contributions are
flows against an account.

### 13.3 What the form asks for is what a statement says

`LoanTerms` in `packages/loans` takes a principal, a rate, and a term in months.
The temptation is to store what was *originally* borrowed and derive the rest.

That is the wrong question to ask a person. Nobody reliably remembers what they
borrowed in 2019; everyone can read what they owe today off a statement, along
with the rate and how many payments are left. So the record holds **months
remaining**, and the observation holds **what is owed now** — which maps onto
`LoanTerms` with no conversion at all and no arithmetic that could be wrong.

Original principal is a nice figure for a "how far along am I" display later. It
is not needed to answer any question this slice asks, and inventing it from a
back-calculation would be worse than not having it.

### 13.4 Where the types live

`Loan` and `LoanObservation` go in `core/types.ts`, beside `Account` and
`BalanceObservation`. `packages/loans` keeps the calculations.

This preserves the dependency shape from Decision 4 exactly: `store` depends on
`core` alone and does not learn about amortization, while `loans` stays a peer of
`retirement` over the same `core`. The alternative — putting the ledger record in
`packages/loans` — would force `store` to depend on a calculation package to know
how to serialize a document, which inverts the layering for no benefit.

`toTerms` is the seam: it turns a ledger `Loan` plus its latest observation into
the `LoanTerms` the pure functions already take. One small function, one obvious
place for the mapping to live.

### 13.5 Schema version 2

The snapshot gains `loans` and `loanObservations`, so `SNAPSHOT_SCHEMA_VERSION`
goes to 2.

Version 1 documents remain readable: both fields are treated as empty when
absent, since a ledger written before loans existed genuinely has none. That is
the honest reading rather than a lenient one, and it means every exported file
anyone is holding still opens. Writing always emits the current version, so a
document round-trips forward exactly once and stays there.

### 13.6 A real defect in the ported algorithm, found by using it

Integrating loans surfaced something the parity suite could not, because it is
not a parity failure: `financetools` and this port agree exactly, and both are
wrong.

The first realistic ledger — a $17,000 car loan at 6% over 60 months and a
$4,800 card at 18.99% over 24 — produced a comparison where **cascade beat
avalanche**. That contradicts the whole theory of avalanche, which targets the
highest rate and is provably the cheapest ordering. It also contradicts the
`financetools` README, which says avalanche "consistently results in the lowest
interest paid".

The ordering was not the problem. The problem is the month a targeted loan is
retired. `payMonth` clamps the principal payment to the balance owed, so the
loan takes only what it still needs — and **the rest of the budget is not spent
at all.** It is not redirected to the remaining loans, and it is not carried
forward. It simply does not happen.

Measured on that ledger: avalanche leaves **$692.44** unspent in month 6, when
the card clears. Cascade, which spreads and therefore overshoots by less, leaves
$160.73. The $531 difference is most of the $17.56 interest gap between them.
Avalanche loses not because targeting the dearest debt is wrong, but because it
retires loans in a way that wastes more budget on the way past.

This is inherited, not introduced. The Python does the same thing, for the same
reason, and its own tests never noticed because they assert totals rather than
comparing strategies against theory.

**It is not fixed here, deliberately.** The fix — reallocating a retiring loan's
surplus to the remaining loans within the same month — changes the output of
every strategy on every queue, which would invalidate the parity fixture in the
same commit that integrates loans. Two large changes tangled together is how a
regression hides. §11.5 established the pattern for this: reproduce, name the
departure, correct it deliberately and on its own.

It is worth doing next, and it is more than a tidy-up. The app tells someone to
pay $900 a month and then quietly models a month where only $207.56 is spent, so
every strategy's cost is overstated and the comparison between them is distorted
by an artifact rather than by the strategies. The correction is the same
principle as the `allocateCents` fix in §11.5: **the budget someone typed is the
budget that gets spent.**

### 13.7 What the work turned up

469 tests. The vertical works end to end — a loan typed into a form, persisted to
`localStorage`, resolved through the ledger seam, amortized, and compared five
ways — and it was verified by driving it rather than by reasoning about it.

**Two display bugs that only rendering could find.** A rate entered as 18.99%
read back as `19.0%`, because the shared `percent` helper rounds to one decimal;
quoted rates carry two, and someone who types 18.99 and is shown 19.0 has been
told their figure was approximate when it was not. And a contractual payment
displayed as `$329`, because the money helper drops cents — which is right for a
balance and wrong for a payment, and specifically undercuts §11.2, where
installments are quantized to cents precisely because an installment is a
transaction someone makes. Both now have their own formatter.

**Two more that were pure carelessness, and equally invisible without looking.**
The summary tiles rendered their label, value and detail on one run-together
line, because the shared styles assume block elements and they had been written
as spans. And the chart legend's swatch for accumulated interest was invisible,
because it reused `band-inner` — which styles an SVG path and has no background —
instead of `key-swatch-inner`. Ground rule 5 exists for exactly this class of
thing: nothing was wrong with the numbers, and the page was still wrong.

**Float noise reached the document.** `18.99 / 100` is `0.18989999999999999` in
IEEE 754, which is correct and looks broken in an exported ledger someone opens
in a text editor. The stored rate is rounded to six places — a ten-thousandth of
a percent, far finer than any rate is quoted, and emphatically not money-rounding
a rate. Worth noting that the seam held: this was cosmetic in a `number`, and no
amount was ever at risk, because amounts never travel as floats at all.

**The derived-id trick carried over intact.** Saving a loan twice in one day
corrects that day's balance instead of stacking two observations, because the
observation id is derived from the loan and the date — the same forgiving
behaviour the year editor has, and the reason a corrected figure does not
silently become a second data point.

**What is still missing, and named rather than hidden.** Payment flows are not
recorded, so the ledger knows what is owed and not what has been paid against
it. Net worth does not combine savings and debts. Neither is a gap in this
slice; both are the next two, and §13.2 explains why the shape accommodates them
without moving.

---

## 14. Spending the whole budget

§13.6 found it; this fixes it. When a targeted loan is retired it takes only what
it still owes, and the remainder of that month's budget is not spent at all —
not redirected to the loans still outstanding, not carried to the next month. It
simply does not happen.

The consequences are worse than a rounding artifact. Every strategy's cost is
overstated, because money the borrower actually has is modelled as never leaving
their hands. And the *comparison between* strategies is distorted, because
strategies waste different amounts: on the first realistic ledger tried,
avalanche left $692.44 unspent in the month a card cleared, cascade left $160.73,
and the difference was enough to reverse their ranking. A tool whose entire
purpose is ranking strategies was ranking an artifact.

### 14.1 The fix is a fixed point, not a special case

The obvious patch — "if the target overshoots, give the change to the next loan"
— is not enough, because the next loan can overshoot too. A large budget against
several small balances can retire three loans in one month, and each hand-off
needs the same treatment.

So allocation becomes a small fixed-point loop. Deal out the month's budget by
whatever rule the strategy uses; find any loan whose share exceeds what it needs
to finish; settle those at exactly what they need; then deal the *rest* of the
budget out again across the loans still standing. Repeat until nothing overshoots.

It terminates for a plain reason: every pass that changes anything removes at
least one loan from the pool, so it cannot run more times than there are loans.

Two properties fall out that are worth stating as tests rather than trusting.
Every month before the debt is fully cleared now spends the budget **exactly** —
there is no month where money goes unspent while something is still owed. And no
loan is ever paid more than it owes, which is what made the surplus appear in the
first place.

### 14.2 What this costs: parity, and how to keep it anyway

`financetools` has this defect, so correcting it means the port no longer
reproduces the Python line for line. That is the thing §11.4 built the whole
fixture apparatus to guarantee, and giving it up quietly would be a bad trade.

It does not have to be given up. The divergence is precisely scoped:

- **Single-loan schedules are untouched.** A lone loan retiring has nobody to
  hand its surplus to, so all seven single-loan cases still match the original
  Python exactly, and they are the ones that test the amortization arithmetic —
  the interest, the rounding, the clamps, the capitalization.
- **Only the multi-loan driver changes**, and only in months where a loan
  retires.

For the queue cases, the oracle is regenerated from a **patched** Python: the
same correction, written independently in the language it came from, applied by
the fixture generator where it is visible and reviewable rather than assumed. If
the two implementations of the correction agree line for line across 2,948
installments, the fix is right for the same reason the port was right.

That is weaker than the original claim, and worth being honest about how: the
Python patch is no longer an independent implementation, because the same person
wrote both. It still catches everything a transcription error could cause, which
is most of what parity was protecting against. What it cannot catch is a
misunderstanding of the correction itself — and that is what §14.1's two
properties are for, since they are statements about the world rather than about
agreement between two programs.

The unpatched fixture is kept alongside, so the size and shape of the departure
stays measurable rather than becoming folklore.

### 14.3 What the fix turned up

**It never costs more.** Across all 30 strategy runs in the fixture, not one pays
more interest after the correction than before. That is the right shape — money
that was being modelled as never leaving the borrower's hands now goes against
the debt, and there is no mechanism by which spending it sooner could cost more.
Total interest across the fixture falls by **$5,178**, or 1.2%; the worst single
case, a lopsided queue under avalanche, falls by **$1,202**.

**Avalanche is optimal again.** On the ledger from §13.6 it goes from $1,609.57
to $1,536.97 and reclaims first place from cascade, which is what the theory says
and what `financetools`' README claims. The defect was never in the ordering. It
was that avalanche, precisely *because* it retires loans fastest, hit the wasteful
path most often — the strategy most punished by the bug was the one that should
have won.

**The two implementations agree exactly.** 119 parity assertions, every ordered
strategy across all six queues, matching the independently written Python
correction line for line. §14.2 already said what that is worth and what it is
not, and both halves of that stand.

**A test was asserting the artifact.** `compare.test.ts` had a case named "can
disagree with itself about what is best", which asserted that the cheapest and
fastest strategies differ. It passed for a year of commits and it was measuring
the bug: the cheapest strategy was not the one targeting the dearest debt because
that one was wasting the most money. With the budget spent, avalanche is both,
and the test now says so.

The replacement is more careful about what it claims. Winner agreement does not
make the goal redundant — blizzard and ice slide tie on months and sit $340 apart
on interest, so which of them looks worse still depends entirely on what is being
asked. That is the honest version of the point the original test was reaching for.

**The fixture grew from 308 KB to 439 KB**, holding three suites where it held
two. The uncorrected runs are kept deliberately: `rounding.test.ts` measures
half-up against half-even and must not have the budget correction mixed into that
comparison, and keeping the pre-correction figures is what stops the size of this
departure becoming folklore. Single-loan cases are generated once rather than
three times, because a lone loan retiring has nobody to hand a surplus to and the
correction provably cannot reach it.

---

## 15. Retiring most of the parity apparatus

§11.4 built a fixture that reconciles this port against `financetools` line for
line, and it did its job. This removes most of it. The reasoning is worth writing
down because it is not "the file got big" — the file is fine — it is that parity
stopped meaning what it originally meant.

### 15.1 What parity was for, and when it stopped

The claim was: an independent implementation exists, so a port that reproduces it
exactly cannot be carrying a transcription error. That is a strong claim and it
was true when it was made.

Three deliberate departures later it is much weaker. Rates stopped being rounded
like money (§11.3); the proportional split started preserving the budget
(§11.5); and the retirement month started spending it (§14). Each divergence
narrowed what parity could still speak to.

The last one broke the claim outright. Keeping queue parity through §14 required
writing the same correction a second time, in Python, in the fixture generator —
which §14.2 admitted at the time. Two implementations by the same author of the
same idea do not independently verify each other. They verify that the idea was
transcribed twice without a typo, which is worth something and is not worth
209 KB and a permanent negotiation with every future correction.

`rounding.test.ts` had drifted further still: it compared two Python runs against
each other and asserted nothing whatever about this codebase. A test that cannot
fail because of our code is not a test, it is a frozen measurement — and the
measurement is already written up, with its numbers, in §11.2.

### 15.2 What is kept, and why exactly that

**Single-loan schedules against the unmodified library.** Seven cases, about
14 KB. This is the one place no divergence has happened, and it is where the
arithmetic that matters lives: interest on a balance, half-even to the cent, the
overpayment clamp on a final installment, negative amortization when a payment
cannot cover interest. There, `financetools` is still a genuinely independent
implementation, and reconciling against it still means what §11.4 said it meant.

Everything else goes: both rounding-mode suites, all queue cases, the corrected
Python in the generator, and `rounding.test.ts`.

What replaces the queue coverage is what should have been carrying it anyway.
The properties are already asserted directly — the budget is spent every month,
no loan is paid more than it owes, every figure lands on the cent grid, avalanche
is optimal, cascade splits by rate and ice slide by monthly cost — and those are
claims about the world rather than about agreement with another program. The one
genuine gap was that no test pinned a full queue run's totals to a figure, so
cent-level drift in the driver could pass unnoticed. That gap is closed with
explicit expected totals for all five strategies on one fixture: a golden, minus
the 209 KB and the external repository.

### 15.3 The general point

A test that exists to prove a migration is finished when the migration is
finished. Keeping it past that point is not free: it made the correctness fix in
§14 more expensive than it should have been, and it came close to being an
argument for *not* fixing a real defect. That is the tell. When a test starts
arguing against a change that is otherwise clearly right, the test has become the
thing being served.

The upstream defect is not this repository's to carry either. It is reported
there, and this port is correct here.

---

## 16. Recording payments

The ledger knows what is owed and nothing about what has been paid against it.
§13.2 deferred this deliberately and said the shape would take it without moving:
payments are flows against a loan, exactly as contributions are flows against an
account. This is that, and the shape did hold.

### 16.1 What recording payments actually buys

Not a prettier history. The balance observations already say what is owed, and a
list of payments beside them is only bookkeeping.

What it buys is the **interest actually charged**, which nothing in the model can
currently see. `summarizePeriod` already does the equivalent for an account:

```
organic gain = end − start − what crossed the boundary
```

Growth is whatever the balance did that the flows do not explain. Invert it for a
debt and the same arithmetic gives:

```
interest charged = what was paid − how far the balance fell
```

If $4,000 of payments moved the balance down by $3,100, the lender charged $900.
That is a measurement, not a projection — and it is the loan-side answer to §3.1,
which is the finding this whole project grew out of: **measure what actually
happened rather than trusting the formula.**

The difference matters more here than it looks. A quoted APR is not what a
lender charges. There are fees, daily rather than monthly compounding, a rate
that changed mid-cycle, a payment applied late. The nominal rate says what should
have happened; the ledger says what did. Where they disagree, the ledger is
right, and nobody currently has any way to notice.

That also gives the effective rate — interest charged over the average balance
carried — which is the number to compare against the quoted one, and the number
worth showing when they differ.

### 16.2 Derived, not entered

A statement helpfully breaks each payment into interest and principal, which is a
standing invitation to store it that way. The invitation should be declined, for
the reason §3.3 gives: a stored split is derivable state that can drift from the
observations it is supposed to agree with, which is what `Q0` was.

So a payment records **what was paid, and when**. The split against any period
falls out of the balances either side of it. Storing less makes the model say
more, because now the interest figure cannot silently disagree with the balances.

The one case this loses is a lender whose statement disagrees with arithmetic —
where the split as printed does not reconcile with the balance movement. That is
a genuinely interesting event and the right response is to surface it, not to
store both numbers and let one quietly win. Not in this slice; noted so the
absence is a decision rather than an oversight.

### 16.3 Schema version 3

`loanPayments` joins `loans` and `loanObservations`. Version 1 and 2 documents
both still open, with the field read as empty when absent — same reasoning as
§13.5, and the same one-way upgrade on write.

That is the third schema version in three phases, which is worth a note. It is
not churn: each one added a collection that did not exist before and broke
nothing that did, which is the cheap kind of migration. The expensive kind
changes the meaning of a field that is already populated, and none of these has.

### 16.4 What a payment is not

It does not move the balance. The balance is what the observations say, and a
payment recorded without a fresh observation leaves what is owed exactly where it
was — correctly, because nobody has looked.

This will feel wrong for about a second and then feel right. A payment is
evidence that money left; only a statement is evidence of what is now owed.
Deriving one from the other would put the model back in the business of guessing,
and the whole ledger exists to avoid that. Where a payment is recorded and the
balance has not been re-observed, the interface says the balance is stale rather
than moving it.

### 16.5 What the work turned up

395 tests. The derivation works end to end and was verified by driving it: a
payment recorded through the form, a two-statement history, and the interest
figure checked against arithmetic done by hand.

**The measurement does what it was built to do.** On a car loan quoted at 6%,
$310 paid against a balance that fell $230 gives $80 of interest and an effective
rate of **5.84%** — the loan cost *less* than its sticker rate over that period.
Whether it reads high or low is not the point; the point is that the number is
now visible at all, and it comes from what happened rather than from applying a
rate to a formula.

**The migration was tested by accident, which is the best way.** The browser was
still holding a schema version 2 document from the previous phase, so opening it
in a version 3 build was a real upgrade rather than a synthetic one. It opened,
read its loans and balances, and rewrote itself as version 3 on the first save.
That is the third such upgrade and the third that needed no migration step,
because each has added a collection rather than changed the meaning of one.

**Two ids, two different rules, and the difference is the domain.** A balance
observation's id is derived from the loan and the date, so saving twice in a day
*corrects* the day's reading — a second look at the same statement supersedes the
first. A payment's id is random, so two payments in one day are two payments.
Same-looking records, opposite behaviour, and getting it backwards either way
would be a silent data bug. Worth stating because the derived-id trick from the
year editor is easy to copy one function too far.

**A period boundary needed a convention and now has one.** A payment dated on an
observation date belongs to the period that *closed* on it, not the one starting.
Half-open at the start. Either choice is defensible and the cost of not choosing
is a payment counted twice or not at all, so it is written down and tested rather
than left to whichever comparison someone typed first.

That convention also settles what "stale" means: a balance is out of date when a
payment is recorded strictly *after* the most recent observation. Same-day is not
stale, because a same-day payment is already inside the period that closed.

---

## 17. Net worth

Savings and debts have been two separate screens since §13. This puts them in one
figure, which is the first thing in the app that is about the household rather
than about one module of it.

### 17.1 The calculation goes in `core`, and knows about neither module

`retirement` and `loans` are peers, and neither imports the other — that was the
point of Decision 4 and it is worth not spending. A net worth derivation living
in either one would make the first peer-to-peer dependency in the repository, and
a package of its own is a lot of ceremony for what starts as one function.

So `core` takes it, on the condition that it learns nothing new. It already holds
`summarizePeriod`, which nets dated balances against dated flows; this sits
beside it and nets **two series of dated amounts** against each other. It has no
idea one series came from investment accounts and the other from loans, and it
does not need one. Both modules already produce exactly that shape, and the app
hands over both.

That constraint is doing real work rather than being tidy. A function that cannot
see the difference between an asset and a debt cannot grow a special case for
either, and net worth is precisely the place where a special case would be a
subtle lie.

### 17.2 Zero owed and nothing known are different, and only the caller can tell

Ground rule 3 has an awkward corner here. A household with no debts genuinely
owes zero. A household with three loans and no balances recorded owes an unknown
amount — and subtracting zero would report a net worth that is too high, in the
flattering direction, which is the worst way to be wrong about this.

The function cannot distinguish them: both arrive as an empty series. So it does
not try. Each point reports whether that side had been observed by that date, and
the *caller* — which knows whether any loans exist at all — decides what that
means. An app with no loans shows a net worth. An app with unobserved loans says
so and declines to imply precision it does not have.

Pushing the judgement to the caller is right here rather than lazy. `core` is
where facts about arithmetic live; "this household has loans it has never told us
about" is a fact about a ledger, and the ledger layer is where it can be known.

### 17.3 The dashboard gains a fact and loses nothing

Net worth appears beside the retirement hero, not instead of it.

The hero says "chance of reaching $X by YYYY", and that number is about
retirement savings and labels itself that way. It was also tuned by eye against
real bugs — a version once read 100% before anyone touched a control — and the
fan chart beneath it went through the colour and banding work in §10. Redefining
what those mean, in the same phase that first introduces debts to the screen, is
two changes wearing one coat.

So net worth is its own clearly-marked figure with its two halves shown
separately, and the projection continues to project savings. Whether the headline
should eventually *be* net worth is a real question and a later one — and it is a
better question once there is a net worth series to look at, which there was not
before this.

### 17.4 What is deliberately not projected

The fan chart simulates savings forward and will keep doing so. It does not
subtract projected debt, and it should not yet.

Debt has a *schedule*: it falls in a way that is contractual and nearly certain,
which is the opposite of the distribution the Monte Carlo draws from. Overlaying
one on the other means either drawing a near-deterministic line inside a
probability fan — implying uncertainty that is not there — or netting them and
producing a band whose width means two different things at once. Neither is
honest, and getting it right needs its own thinking rather than an afternoon.

The historical net worth series has no such problem, because both sides are
observed. That is what this phase draws.

### 17.5 What the work turned up

406 tests. This one went in cleanly, which is worth saying plainly rather than
manufacturing a finding: the shape had been argued out in §17.1–17.4 before any
code, and the code did what the argument said it would.

**The ignorance constraint bought a test that would not otherwise exist.**
Because `netWorthSeries` cannot tell an asset from a debt, swapping its two
arguments must negate the result exactly. That property is now asserted, and it
is a stronger guarantee than any example: it cannot hold if a special case for
either side has crept in anywhere. A function that knew which side was which
could not be checked this way at all.

**The caveat fired on real data, which is the only way to trust it.** The browser
was holding a ledger where one loan had lost its observations during the previous
phase's testing. The dashboard said so — *"One loan has no balance recorded, so
it is subtracting nothing"* — and the net worth figure above it was, correctly,
too high. That is ground rule 3 catching the exact case §17.2 was written about,
without anyone constructing it.

**One judgement call worth recording.** Where some debts are observed and some
are not, the Debts tile shows the figure it knows rather than a dash. Hiding a
real $16,020 because a second loan is unrecorded would trade a number that is
incomplete for no number at all, which is worse: the reader loses information and
still has to read the caveat to understand why. The tile shows what is known and
says what is missing, and the banner above it says it again in the direction that
matters — the total is too *high*.

**The default household reads correctly**, which was the case most likely to be
got wrong by a feature built while thinking about debts. No loans at all gives
net worth equal to assets, debts of `$0`, and the words "nothing owed" rather
than a dash — because that household genuinely owes nothing, and it is the
caller, not `core`, that can tell.
