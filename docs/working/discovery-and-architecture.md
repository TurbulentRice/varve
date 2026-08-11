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
