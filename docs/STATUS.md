# Status

**Living document.** Rewritten at the end of each phase, not appended to. If you
want the history of how the thinking changed, that is
[the working doc](working/discovery-and-architecture.md) — this file only ever
describes now.

Last updated: 2026-08-12. The second era has begun; its first phase has landed.

## Where things stand

Twelve phases done. **429 tests**, clean typecheck, clean production build, and
CI running tests, the bundle guard and the documentation checks on every PR.

| Package | What it holds | Tests |
|---|---|---|
| [`packages/core`](../packages/core) | Money, dates, domain types, returns, aggregation, projection, net worth. Zero dependencies. | 91 |
| [`packages/store`](../packages/store) | Snapshot format (v3), repository interface, in-memory + persisting adapters. | 39 |
| [`packages/retirement`](../packages/retirement) | Ledger, household + per-account derivation, year entry, Monte Carlo. | 83 |
| [`packages/loans`](../packages/loans) | Amortization, strategies, comparison, ledger seam, what a loan actually cost. | 136 |
| [`packages/legacy-import`](../packages/legacy-import) | One-way migration from Access, with a synthetic fixture. | 23 |
| [`apps/web`](../apps/web) | React + Vite. A four-destination shell — Overview, Accounts, Debts, Plan — plus account and debt detail, the year editor, and hash routing. | 57 |

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
12. ✅ The shell, and net worth over time — four destinations, the landing page
    dissolved into them, the first chart about the household (§22)
13. ⬅ **Next: a surface at a time. See
    [interface-and-experience.md](working/interface-and-experience.md).**

Deferred behind a stated seam: server, auth, sync, institution APIs. None is
worth building for a user who does not exist yet.

## What's next

The era's working document is
[interface-and-experience.md](working/interface-and-experience.md); §20 carries
everything outstanding so a rewrite of this file cannot lose it.

§22 settled the five forks §19.4 raised and built the shell. Two of them moved:
projection settings stay **out** of the URL (§12.4 — parameters are identity,
never data), which means the hand-rolled router survives untouched; and the
component layer is bounded by **two call sites or it waits**, which yielded four
small components rather than five speculative ones.

The near-term pieces, in order of what they buy:

1. **The Debts page, redesigned** — budget control at the top, the strategy
   comparison as the payoff below it (§19.2). Deliberately untouched in §22 so
   that a phase moving every surface did not also redesign one.
2. **Are the payments on schedule?** — cheap on top of §16, and the question a
   borrower actually asks.
3. **In-place editing on the account page** (§22.1) — `#/years/:year` stays as
   bulk entry; this is the single-correction case, and it is its own phase.
4. **A statement whose split disagrees with the balances** (§16.2) — a genuinely
   interesting event, currently invisible.

Still unanswered and now directly relevant: §6's third question, which asks the
one person who has been reading this data for twenty years what he actually
looks at. §20 has it.

## Known debt, deliberately deferred

- **Nothing compares payments to the schedule.** The ledger now knows what was
  paid and what it cost, but not whether that is ahead of or behind the
  contractual plan. Cheap to add on top of §16.
- **The net worth chart is annualised while the figure beside it is not** (§22.3).
  Correct, and it means the line can end above the headline when a loan statement
  postdates the last recorded balance. Said out loud under the chart rather than
  papered over — see §22.5.
- **A statement whose printed split disagrees with the balances is not
  surfaced** (§16.2). It is a genuinely interesting event and currently invisible.
- **Routing is hand-rolled** (§12.3), and §22.1 argues the signal still has not
  fired: a query string is a parser change, not a router. The genuine remaining
  signals are nesting and loading states, neither of which local-first data
  produces. Call sites speak in `Route` values, so the swap stays mechanical.
- **The Debts page keeps its old order** — table, budget, comparison. §19.2 wants
  the control at the top. Deliberately deferred out of §22 so one phase did not
  both move every surface and redesign one.
- **Account detail tiles get tight at 1280px** — six across, with "Share of
  household" wrapping. The shared `Tile` (§22.1) is now the one place to fix it.
- **`localStorage` is not durable.** Export is the real backup. A "last exported"
  nudge would be the honest version, and the Overview's attention strip is now
  the place it belongs.
- **`financetools` upstream still wastes a retiring loan's budget** (§14). The
  defect is fixed here and reported there; nothing in this repository depends on
  it being fixed upstream.

## Orientation for a cold start

1. [`CLAUDE.md`](../CLAUDE.md) — goals, ground rules, working protocol. Read first.
2. [The first working doc](working/discovery-and-architecture.md) — closed, but
   read §4 (architecture), §10 (roadmap), §11 (the loans port). Then
   [the current one](working/interface-and-experience.md), §18 onward.
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
