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

Six phases done, committed, and pushed. **410 tests**, clean typecheck, clean
production build.

| Package | What it holds | Tests |
|---|---|---|
| `packages/core` | Money, dates, domain types, returns, aggregation, projection. Zero dependencies. | 80 |
| `packages/store` | Snapshot format, repository interface, in-memory + persisting adapters. | 29 |
| `packages/retirement` | Ledger, household + per-account derivation, year entry, Monte Carlo. | 83 |
| `packages/loans` | Amortization, five repayment strategies, comparison. Ported from `financetools`. | 195 |
| `packages/legacy-import` | One-way migration from Access, with a synthetic fixture. | 23 |
| `apps/web` | React + Vite. Dashboard, projection fan chart, year editor, account views. | — |

```bash
pnpm install && pnpm test        # everything
pnpm build                       # typecheck + emit all packages
pnpm --filter @varve/web dev     # the app
pnpm snapshot                    # rebuild the sample (and local, if present)
pnpm reconcile                   # replay the real Access data, if you have it
pnpm --filter @varve/loans fixtures   # regenerate the financetools oracle (needs Python)
```

### Roadmap position

1. ✅ Monte Carlo and better projections
2. ✅ Framework and the first real UI (React + Vite)
3. ✅ Editing and persistence
4. ✅ Per-account views
5. ✅ `packages/loans` — `financetools` ported, reconciled line for line
6. ⬅ **Next: routing, then wiring loans into the ledger and the UI. You are here.**

Deferred behind a stated seam: server, auth, sync, institution APIs.

### Known debt, deliberately deferred

- **No routing.** View state is a three-way toggle (dashboard / editor / account
  detail) held in `useState`. An account page you cannot bookmark or reach with
  the back button is the first thing that will feel wrong to a real user. Loans
  will add a fourth surface, which makes this the next infrastructure piece.
- **Loans are not integrated.** `packages/loans` is standalone by design — no
  ledger wiring, no UI. Deliberate: the API should be designed against a real
  consumer, which is the `history.ts` lesson. Whether a loan is an account with a
  negative balance or a different thing entirely is still open.
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

## Next task: routing, then integrating loans

Two candidates, and they are ordered.

### 1. Routing

The app holds view state in a three-way `useState` toggle. An account page you
cannot bookmark, link, or reach with the back button is the first thing that will
feel wrong to a real user, and loans are about to add a fourth surface — which
turns a nuisance into a structural problem.

This is small and unglamorous. It is also the piece everything after it assumes.

### 2. Wiring loans into the ledger and the UI

`packages/loans` is finished and standalone: amortization, five strategies, and
the comparison, reconciled line for line against the Python (§11 of the working
doc). Nothing consumes it yet, which was deliberate — the integration API should
be designed against a real consumer rather than guessed at, the lesson from
`history.ts`.

The open question is the modelling one, and it deserves the same treatment §11
got — written down before code:

- **Is a loan an account with a negative balance, or its own entity?** The
  observations-and-flows model in `core` was built for assets. A loan has a
  contractual schedule, which an investment account does not, and that schedule
  is a *projection* rather than a record. Forcing it into `BalanceObservation`
  may be elegant or may be the `Q0`-as-plug mistake in a new costume.
- **Does net worth combine them?** If it does, `Money` handles the sign fine, but
  every derivation in `retirement` that assumes growth is good needs re-reading.
- **What does the UI actually show?** The comparison table is the interesting
  output — five strategies, one budget, ranked. Probably that, plus one schedule
  chart. Not five.

### Read before starting

1. `WORKING-DOC.md` §11 — the loans port, the decisions, and §11.7 for what
   building it turned up. §4 for the architecture, §10 for the roadmap.
2. `packages/core/src/money.ts` — the conventions every calculation inherits.
3. `packages/loans/src/cents.ts` — why loans use a coarser grid than everything
   else, and the single-rounding argument that makes parity possible.
4. `packages/retirement/src/series.ts` — how a derivation is structured, and how
   `recorded` / `measurable` handle absent data.
5. `packages/loans/test/parity.test.ts` and `rounding.test.ts` — the testing
   style, and how a deliberate departure gets pinned rather than hidden.

Regenerating the loans oracle needs a `financetools` checkout and Python:

```bash
pnpm --filter @varve/loans fixtures
```

It is committed, so this is only necessary if the Python changes.

Ask before assuming. Several decisions in this codebase went the non-obvious way
for reasons that are written down but not guessable — and at least one of those
reasons was written down wrong the first time and corrected by building it. See
the warning box in §11.2.
