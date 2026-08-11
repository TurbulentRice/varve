# Status

**Living document.** Rewritten at the end of each phase, not appended to. If you
want the history of how the thinking changed, that is
[the working doc](working/discovery-and-architecture.md) — this file only ever
describes now.

Last updated: 2026-08-11, after routing.

## Where things stand

Seven phases done, merged to `main`. **440 tests**, clean typecheck, clean
production build, and CI running both on every PR.

| Package | What it holds | Tests |
|---|---|---|
| [`packages/core`](../packages/core) | Money, dates, domain types, returns, aggregation, projection. Zero dependencies. | 80 |
| [`packages/store`](../packages/store) | Snapshot format, repository interface, in-memory + persisting adapters. | 29 |
| [`packages/retirement`](../packages/retirement) | Ledger, household + per-account derivation, year entry, Monte Carlo. | 83 |
| [`packages/loans`](../packages/loans) | Amortization, five repayment strategies, comparison. Ported from `financetools`. | 195 |
| [`packages/legacy-import`](../packages/legacy-import) | One-way migration from Access, with a synthetic fixture. | 23 |
| [`apps/web`](../apps/web) | React + Vite. Dashboard, projection fan chart, year editor, account views, hash routing. | 30 |

## Roadmap

1. ✅ Monte Carlo and better projections
2. ✅ Framework and the first real UI (React + Vite)
3. ✅ Editing and persistence
4. ✅ Per-account views
5. ✅ `packages/loans` — `financetools` ported, reconciled line for line
6. ✅ Routing — hash-based, hand-rolled, four surfaces bookmarkable
7. ⬅ **Next: wiring loans into the ledger and the UI.**

Deferred behind a stated seam: server, auth, sync, institution APIs. None is
worth building for a user who does not exist yet.

## What's next

### Wiring loans into the ledger and the UI

`packages/loans` is finished and standalone. Nothing consumes it yet, which was
deliberate: the integration API should be designed against a real consumer rather
than guessed at — the `history.ts` lesson.

The open question is a modelling one, and deserves the same treatment §11 got:

- **Is a loan an account with a negative balance, or its own entity?** The
  observations-and-flows model in `core` was built for assets. A loan has a
  contractual schedule, which an investment account does not, and that schedule
  is a *projection* rather than a record. Forcing it into `BalanceObservation`
  may be elegant, or may be the `Q0`-as-plug mistake in a new costume.
- **Does net worth combine them?** `Money` handles the sign fine, but every
  derivation in `retirement` that assumes growth is good needs re-reading.
- **What does the UI actually show?** The comparison table is the interesting
  output — five strategies, one budget, ranked. Probably that plus one schedule
  chart. Not five.

## Known debt, deliberately deferred

- **Loans are not integrated.** Standalone by design; see above.
- **No route for loans yet.** `Route` is a union in
  [`apps/web/src/routing/route.ts`](../apps/web/src/routing/route.ts); the loans
  surface is one more member and one more case in `parseRoute`.
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
