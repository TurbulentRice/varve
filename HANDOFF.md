# Handoff — picking up Varve

Paste this into a fresh session. It carries the state, the rules, and the next
task. Everything it asserts is checkable in the repo; where it says "read X",
read X before deciding anything.

---

## What Varve is

A personal finance platform, web-first, local-first, TypeScript throughout.
Retirement tracking is the first module; loan repayment is the second.

It grew out of two real artefacts: a Microsoft Access database that has tracked
one household's retirement savings **quarterly since 2006**, and the Excel
workbook that condensed it. Both were reverse-engineered on macOS with
`mdbtools`. That archaeology is not colour — it produced the findings that shape
every design decision in the codebase, and they are written up in
[WORKING-DOC.md](WORKING-DOC.md).

**Read `WORKING-DOC.md` first.** It is the single source of reasoning: discovery,
findings, architectural decisions with their trade-offs, and the phased roadmap.
It is long because the reasoning is the point.

Repo: https://github.com/TurbulentRice/varve (public, MIT)

---

## Where things stand

Five phases done, committed, and pushed. **215 tests**, clean typecheck, clean
production build.

| Package | What it holds | Tests |
|---|---|---|
| `packages/core` | Money, dates, domain types, returns, aggregation, projection. Zero dependencies. | 80 |
| `packages/store` | Snapshot format, repository interface, in-memory + persisting adapters. | 29 |
| `packages/retirement` | Ledger, household + per-account derivation, year entry, Monte Carlo. | 83 |
| `packages/legacy-import` | One-way migration from Access, with a synthetic fixture. | 23 |
| `apps/web` | React + Vite. Dashboard, projection fan chart, year editor, account views. | — |

```bash
pnpm install && pnpm test        # everything
pnpm build                       # typecheck + emit all packages
pnpm --filter @varve/web dev     # the app
pnpm snapshot                    # rebuild the sample (and local, if present)
pnpm reconcile                   # replay the real Access data, if you have it
```

### Roadmap position

1. ✅ Monte Carlo and better projections
2. ✅ Framework and the first real UI (React + Vite)
3. ✅ Editing and persistence
4. ✅ Per-account views
5. ⬅ **`packages/loans` — port `financetools` to TypeScript. You are here.**

Deferred behind a stated seam: server, auth, sync, institution APIs.

### Known debt, deliberately deferred

- **No routing.** View state is a three-way toggle (dashboard / editor / account
  detail) held in `useState`. An account page you cannot bookmark or reach with
  the back button is the first thing that will feel wrong to a real user.
  Routing is likely the next infrastructure piece after loans.
- **Account detail tiles get tight at 1280px** — six across, with "Share of
  household" wrapping. Legible, not elegant.
- **`localStorage` is not durable.** Export is the real backup. A "last exported"
  nudge would be the honest version.

---

## Ground rules

These are not stylistic preferences. Each one exists because breaking it caused
a real bug in this codebase.

### 1. Never put real financial data in the repo

The source database holds one household's actual balance history. It is
gitignored, and so is any snapshot derived from it. Tests assert *properties*
("every year reconciles", "exactly one warning survives"), never balances or
names, so a committed test reveals nothing about what it reads.

**Before every commit that touches `apps/web`:**

```bash
grep -rE "Rollover IRA|Individual Cash Reserves|Vanguard|Jackson|Angela" apps/web/dist/assets/*.js
```

This is not paranoia. An earlier version auto-loaded a local snapshot via
`import.meta.glob` and put every real account name and balance into the
production bundle — a build that could have been deployed. Real snapshots now
live **outside any app source tree** and are opened through a file picker.

### 2. Money is exact; rates are not

`Money` is a `bigint` at four decimal places — the scale Access's `Currency` type
used, so the whole twenty-year history round-trips losslessly. Rates, returns,
weights, and growth factors are plain `number`s, because they are chain-linked
products and fractional powers where exactness is neither achievable nor
meaningful. `Money.ratio()` is the single deliberate seam between the two.

Rounding is **half-even** throughout, because these operations compound and
half-up drifts upward across a forty-year projection.

The one sanctioned exception: the Monte Carlo inner loop runs in floats and
converts back at the boundary. A simulated future is a draw from a distribution
with uncertainty measured in tens of percent; exact decimal buys nothing there
and costs an order of magnitude of speed. **If you make an exception, say why in
the code.**

### 3. Missing is not zero

This has produced two separate bugs and is the single most likely way to
introduce a third.

- A year with no balance recorded is a **gap**, not a flat 0% year. `YearRow`
  carries `recorded`.
- A year seen only once cannot be measured at all — treating its missing opening
  balance as zero reported a first entry of $100,000 as "earned $100,000".
  `YearRow` carries `measurable`.

Both are excluded from averages and from the returns that seed simulations. When
a number could be *unknown* rather than zero, model it as `null` and blank it in
the UI.

### 4. Domain packages are pure

No I/O, no clock, no framework, no DOM. `loadLedger` is the only function in
`retirement` that touches a repository; everything else is a function of plain
data. A helper that reached for `document` was moved out of `store` for exactly
this reason.

### 5. Look at the output and question numbers that move

Several real bugs were caught only by rendering the result and being suspicious:
bands that out-shouted the line they surrounded, a legend with two identical
swatches, a hero reading 100%, uppercase account names, an empty grid cell on a
phone. When a number changes after a refactor, find out why before accepting it.

### 6. Verify, don't assert

For UI work: run the dev server, drive it, screenshot it. For data work:
reconcile against something independent. The migration is trusted because
recomputed year-end totals match Access's own query exactly, every year, twenty
years running.

---

## How we work

### Phases, with the reasoning written down first

Work proceeds in **discrete phases**, each ending in a commit that builds, passes,
and is pushed. Before writing code for a phase:

1. **Write the decision down** — extend `WORKING-DOC.md` with what is being
   built, the options considered, the trade-offs, and the choice. Prose, not
   bullets. If a decision has a genuine fork, say so and recommend rather than
   quietly picking.
2. **Build it**, tests alongside the code rather than after.
3. **Update the doc** with what the work actually turned up — the roadmap entry
   gets a ✅ and a paragraph on what was found. Several phases changed the design
   mid-flight; that record is the valuable part.
4. **Commit with an essay**, not a subject line. `git log` here explains *why*
   each choice was made and what was discovered. Read a few before writing one.

`WORKING-DOC.md` is the implementation doc. It is not a formality — twice, a
correction written into it survived a later session about to repeat the mistake.

### Comments explain why, not what

Every non-obvious decision carries its reasoning in the code. Module headers
explain what a file is for and which trade-off it embodies. If a comment
restates the code, delete it; if a choice would puzzle someone in six months,
explain it.

### Tests state properties in prose

`it('leaves returns untouched where no money moved')`, not `it('works')`. The
test name says what must be true; a comment says why it matters. Fixtures should
match what the system actually produces — two bugs here were fixtures that did
not, and one was a test asserting behaviour that turned out to be wrong.

---

## Next task: `packages/loans`

Port [`financetools`](https://github.com/TurbulentRice/financetools) —
`~/Dev/financetools`, Python, ~650 lines, zero dependencies, consumed today by
[RepayMint](https://github.com/TurbulentRice/RepayMint).

It models loan amortization and compares repayment strategies. `Loan` holds a
balance, rate, term and a payment history; `LoanQueue` holds several loans and a
budget, and implements ordered strategies (**avalanche**, **blizzard**,
**snowball**) plus **cascade**, **ice_slide**, **finish**, and a `debt_solve`
routine; `LoanQueueCompare` runs them against each other. `README.md` there
explains the algorithms well — read it.

The target shape is a **peer to `retirement` over the same `core`**. That is what
makes absorbing RepayMint an addition rather than a merge, and it is the
architecture bet from Decision 4 in the working doc.

### Decisions to make and write down before coding

- **Rounding.** `financetools` quantizes to cents with `ROUND_HALF_UP`. Varve
  rounds **half-even**. Matching Python exactly makes parity testing trivial and
  breaks the house convention; adopting half-even is consistent and means the
  ported output will differ from the Python in the last cent. Pick one, say why.
- **Where the Money/number seam falls.** Balances and payments are `Money`.
  Interest rates and the discount factor (`((1+r)^n − 1)/(r(1+r)^n)`) are rate
  maths and belong in `number`. Be explicit about where the crossing happens.
- **Parity fixtures.** The Access migration is trusted because it reconciles
  against an independent implementation. Consider the same here: generate
  amortization schedules from the Python and commit them as fixtures, so the
  port is *provably* faithful rather than plausibly so. The Python tests
  (`tests/`) are a starting point but thin.
- **Scope.** All the strategies, or the three the README documents first? A
  smaller first slice that is genuinely finished beats five half-ported
  algorithms.
- **Integration, or not yet.** Loans could stay standalone initially. Wiring it
  into the ledger and the UI is a separate phase, and doing it later means the
  API gets designed against a real consumer — which is the lesson from
  `history.ts`, built inside the web app and only graduated once its shape had
  been tested by use.

### Read before starting

1. `WORKING-DOC.md` — all of it, especially §4 (architecture) and §10 (roadmap).
2. `packages/core/src/money.ts` — the conventions every calculation inherits.
3. `packages/retirement/src/series.ts` — how a derivation is structured, and how
   `recorded` / `measurable` handle absent data.
4. `packages/retirement/test/account.test.ts` — the testing style.
5. `~/Dev/financetools/README.md` and `financetools/loan.py`.

Ask before assuming. Several decisions in this codebase went the non-obvious way
for reasons that are written down but not guessable.
