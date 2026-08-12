# Status

**Living document.** Rewritten at the end of each phase, not appended to. If you
want the history of how the thinking changed, that is
[the working doc](working/discovery-and-architecture.md) — this file only ever
describes now.

Last updated: 2026-08-12, after wiring loans into the ledger.

## Where things stand

Eight phases done. **469 tests**, clean typecheck, clean production build, and
CI running both on every PR.

| Package | What it holds | Tests |
|---|---|---|
| [`packages/core`](../packages/core) | Money, dates, domain types, returns, aggregation, projection. Zero dependencies. | 80 |
| [`packages/store`](../packages/store) | Snapshot format (v2), repository interface, in-memory + persisting adapters. | 34 |
| [`packages/retirement`](../packages/retirement) | Ledger, household + per-account derivation, year entry, Monte Carlo. | 83 |
| [`packages/loans`](../packages/loans) | Amortization, five repayment strategies, comparison, ledger seam. | 215 |
| [`packages/legacy-import`](../packages/legacy-import) | One-way migration from Access, with a synthetic fixture. | 23 |
| [`apps/web`](../apps/web) | React + Vite. Dashboard, projections, year editor, account views, debts, hash routing. | 34 |

## Roadmap

1. ✅ Monte Carlo and better projections
2. ✅ Framework and the first real UI (React + Vite)
3. ✅ Editing and persistence
4. ✅ Per-account views
5. ✅ `packages/loans` — `financetools` ported, reconciled line for line
6. ✅ Routing — hash-based, hand-rolled, bookmarkable surfaces
7. ✅ Loans in the ledger — schema v2, entry, schedule, strategy comparison
8. ⬅ **Next: the wasted-budget defect (§13.6), then payments and net worth.**

Deferred behind a stated seam: server, auth, sync, institution APIs. None is
worth building for a user who does not exist yet.

## What's next, in order

### 1. The wasted-budget defect (§13.6)

The highest-value item, and a correctness fix rather than a polish one. When a
targeted loan is retired, it takes only what it still owes and **the rest of that
month's budget is not spent at all** — not redirected, not carried forward.

On a realistic ledger that is $692 unspent in a single month, enough to make
cascade beat avalanche and contradict the whole theory of the thing. Every
strategy's cost is overstated, and the comparison between them is distorted by an
artifact rather than by the strategies.

Inherited from `financetools`, so fixing it is a deliberate departure that
changes the parity fixture. That is exactly why it wants its own phase rather
than being smuggled into another.

### 2. Recording payments

The ledger knows what is owed and not what has been paid against it. Payments are
flows against a loan, exactly as contributions are flows against an account, so
the shape accommodates them without moving (§13.2). This is what makes "am I on
schedule?" answerable.

### 3. Net worth

Savings and debts in one figure. `Money` handles the sign, but the dashboard hero
and the fan chart were both tuned by eye against real bugs, so changing what they
*mean* deserves its own phase rather than a quiet redefinition.

## Known debt, deliberately deferred

- **A retiring loan wastes that month's budget.** See above — the next phase.
- **No payment history for loans.** Balances are observed; what was paid against
  them is not recorded yet.
- **Net worth does not exist.** Savings and debts are shown side by side and
  never combined.
- **Routing is hand-rolled** (§12.3). Fine at four views with one parameter each.
  The signal to adopt a real router is a route needing something the union cannot
  express — a query string, genuine nesting, a loading state. Call sites already
  speak in `Route` values, so that swap is mechanical.
- **Account detail tiles get tight at 1280px** — six across, with "Share of
  household" wrapping. Legible, not elegant.
- **`localStorage` is not durable.** Export is the real backup. A "last exported"
  nudge would be the honest version.
- **The loans parity fixture is 308 KB.** The price of a committed oracle, with
  the encoding already compacted 3×. Fine for now; worth revisiting if it grows.

## Orientation for a cold start

1. [`CLAUDE.md`](../CLAUDE.md) — goals, ground rules, working protocol. Read first.
2. [The working doc](working/discovery-and-architecture.md) — all of it,
   especially §4 (architecture), §10 (roadmap), §11 (the loans port).
3. [`packages/core/src/money.ts`](../packages/core/src/money.ts) — the conventions
   every calculation inherits.
4. [`packages/loans/src/cents.ts`](../packages/loans/src/cents.ts) — why loans use
   a coarser grid, and the single-rounding argument that makes parity possible.
5. [`packages/retirement/src/series.ts`](../packages/retirement/src/series.ts) —
   how a derivation is structured, and how `recorded` / `measurable` handle
   absent data.
6. [`packages/loans/test/parity.test.ts`](../packages/loans/test/parity.test.ts)
   and [`rounding.test.ts`](../packages/loans/test/rounding.test.ts) — the testing
   style, and how a deliberate departure gets pinned rather than hidden.
