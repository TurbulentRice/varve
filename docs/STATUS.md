# Status

**Living document.** Rewritten at the end of each phase, not appended to. If you
want the history of how the thinking changed, that is
[the working doc](working/discovery-and-architecture.md) — this file only ever
describes now.

Last updated: 2026-08-12, after net worth.

## Where things stand

Eleven phases done. **406 tests**, clean typecheck, clean production build, and
CI running tests, the bundle guard and the documentation checks on every PR.

| Package | What it holds | Tests |
|---|---|---|
| [`packages/core`](../packages/core) | Money, dates, domain types, returns, aggregation, projection, net worth. Zero dependencies. | 91 |
| [`packages/store`](../packages/store) | Snapshot format (v3), repository interface, in-memory + persisting adapters. | 39 |
| [`packages/retirement`](../packages/retirement) | Ledger, household + per-account derivation, year entry, Monte Carlo. | 83 |
| [`packages/loans`](../packages/loans) | Amortization, strategies, comparison, ledger seam, what a loan actually cost. | 136 |
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
8. ✅ The wasted-budget defect — the whole budget is spent every month (§14)
9. ✅ Retired most of the parity fixture (§15)
10. ✅ Recording payments — interest measured rather than assumed (§16)
11. ✅ Net worth — assets against debts, beside the hero rather than instead of it (§17)
12. ⬅ **Next: an open choice — see below.**

Deferred behind a stated seam: server, auth, sync, institution APIs. None is
worth building for a user who does not exist yet.

## What's next

No single obvious next piece, which is itself worth noting — the modules that
were missing are now present. Three candidates, roughly in order of what they
buy:

### 1. Net worth over time

§17 draws the figure for today and the series exists behind it, but nothing plots
it. A net worth line running back through the record is the first chart in the
app about the household rather than one module of it, and needs no new data.

### 2. Are the payments on schedule?

The ledger knows what was paid and what it cost (§16) but not whether that is
ahead of or behind the contractual plan. Cheap on top of what exists, and it is
the question a borrower actually asks.

### 3. Projecting debt alongside savings

The honest hard one, and deliberately deferred in §17.4. Debt falls on a
near-certain schedule; savings are a distribution. Drawing them on one axis means
either implying uncertainty that is not there or producing a band whose width
means two things at once. Needs its own thinking, not an afternoon.

## Known debt, deliberately deferred

- **Nothing compares payments to the schedule.** The ledger now knows what was
  paid and what it cost, but not whether that is ahead of or behind the
  contractual plan. Cheap to add on top of §16.
- **A statement whose printed split disagrees with the balances is not
  surfaced** (§16.2). It is a genuinely interesting event and currently invisible.
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
- **`financetools` upstream still wastes a retiring loan's budget** (§14). The
  defect is fixed here and reported there; nothing in this repository depends on
  it being fixed upstream.

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
   and [`cost.test.ts`](../packages/loans/test/cost.test.ts) — the testing style,
   and how a measurement is asserted rather than a formula re-run.
