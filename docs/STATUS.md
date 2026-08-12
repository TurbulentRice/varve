# Status

**Living document.** Rewritten at the end of each phase, not appended to. If you
want the history of how the thinking changed, that is
[the working doc](working/discovery-and-architecture.md) — this file only ever
describes now.

Last updated: 2026-08-12. The first era is closed; the second is being planned.

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
12. ⬅ **Next: the interface era — see
    [interface-and-experience.md](working/interface-and-experience.md).**

Deferred behind a stated seam: server, auth, sync, institution APIs. None is
worth building for a user who does not exist yet.

## What's next

**A second working document opens here:**
[interface-and-experience.md](working/interface-and-experience.md). The model is
correct; the question now is whether anyone would want to use it.

The first era's document is **closed** — extended only to correct something known
to be wrong. Its numbering continues into the new file rather than restarting,
because 61 citations in the codebase depend on `§8.1` meaning one thing (§18.4).

The diagnosis, measured on the running app: the landing page is **2.6 screens**,
the account list — the best thing in the app — begins **1.7 screens down** inside
a collapsed disclosure, and a projection control sits **2.4 screens** from the
numbers it drives. The page is a changelog of what got built rather than an
answer to what someone came to find out.

The proposal is a persistent shell with four destinations — Overview, Accounts,
Debts, Plan — separating the *record* from the *model*, and making positions
first-class instead of a table row and a button. §19 has the shape; §19.4 lists
the forks that want deciding before anything is built.

Outstanding product work is carried forward in §20 so a STATUS rewrite cannot
lose it. The near-term pieces, in order of what they buy:

1. **Net worth over time** — the series exists behind today's figure and nothing
   plots it. Needs no new data, and is the natural anchor for an Overview.
2. **Are the payments on schedule?** — cheap on top of §16, and the question a
   borrower actually asks.
3. **A statement whose split disagrees with the balances** (§16.2) — a genuinely
   interesting event, currently invisible.

## Known debt, deliberately deferred

- **Nothing compares payments to the schedule.** The ledger now knows what was
  paid and what it cost, but not whether that is ahead of or behind the
  contractual plan. Cheap to add on top of §16.
- **A statement whose printed split disagrees with the balances is not
  surfaced** (§16.2). It is a genuinely interesting event and currently invisible.
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
