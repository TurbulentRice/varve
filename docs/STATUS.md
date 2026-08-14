# Status

**Living document.** Rewritten at the end of each phase, not appended to. If you
want the history of how the thinking changed, that is
[the working doc](working/discovery-and-architecture.md) — this file only ever
describes now.

Last updated: 2026-08-14. The second era is under way.

## Where things stand

Fifteen phases done. **459 tests**, clean typecheck, clean production build, and
CI running tests, the bundle guard and the documentation checks on every PR.

| Package | What it holds | Tests |
|---|---|---|
| [`packages/core`](../packages/core) | Money, dates, domain types, returns, aggregation, projection, net worth. Zero dependencies. | 91 |
| [`packages/store`](../packages/store) | Snapshot format (v3), repository interface, in-memory + persisting adapters. | 39 |
| [`packages/retirement`](../packages/retirement) | Ledger, household + per-account derivation, year entry, Monte Carlo. | 84 |
| [`packages/loans`](../packages/loans) | Amortization, strategies, comparison, ledger seam, what a loan actually cost, whether the payments are keeping up. | 151 |
| [`packages/legacy-import`](../packages/legacy-import) | One-way migration from Access, with a synthetic fixture. | 23 |
| [`apps/web`](../apps/web) | React + Vite. A four-destination shell — Overview, Accounts, Debts, Plan — plus account and debt detail, in-place corrections, the year editor, and hash routing. | 71 |

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
13. ✅ The Debts page — what it costs a month, shares drawn, the control beside
    what it drives (§24)
14. ✅ Are the payments on schedule? — pace measured against the contract, and
    what it does to the finish (§25)
15. ✅ In-place account corrections, and sparklines on the Debts list (§26)
16. ⬅ **Next: the fee inconsistency below, then §23.**

Deferred behind a stated seam: server, auth, sync, institution APIs. None is
worth building for a user who does not exist yet.

## What's next

The era's working document is
[interface-and-experience.md](working/interface-and-experience.md); §20 carries
everything outstanding so a rewrite of this file cannot lose it.

**§20's oldest question is answered in part.** The household's owner uses two
forms with sub-forms and has offered to document them; what he used the database
*for* is recorded in §20 and §23.1. All four uses already work here, which is a
good report on the first era and a pointed one about the second. The remaining
detail is an input, not a gate.

**§23 is the direction.** Three things larger than any phase so far: net worth
projected forward rather than only backward, retirement contributions planned as
a percentage of salary, and turning a retirement target into what it means for a
year of living. Two of the three need a person with income, an age and an
intention — and the seam is already cut, because `Owner` exists in `core` with an
unused `birthYear` and accounts already reference `ownerIds` (§23.3). The fork
when it comes is whether salary and spending are properties of a person or
observations about one; §23.3 recommends observations and does not decide.

> ⚠️ **A correctness finding is now ahead of everything else.** §26.3 turned up
> that an account's return and the household's return **do not treat fees the
> same way** — `deriveAccountHistory` removes fees from `externalFlows`,
> `deriveHistory` keeps them. The visible symptom is that the per-year fee column
> on an account page has always been blank. The real problem is that two return
> figures on adjacent pages are computed on different definitions. A direct
> descendant of §3.4. Fixing it changes every return in the app, so it wants its
> own phase and a `pnpm reconcile` against the real data.

The near-term pieces, in order of what they buy:

1. **The fee inconsistency** (§26.3). Correctness, and it gates trusting any
   comparison between an account and the household.
2. **A statement whose split disagrees with the balances** (§16.2) — a genuinely
   interesting event, currently invisible.
3. **The year editor shows imported years as blank boxes** (§26.3) — the same
   defect fixed on the account page, on a surface that has no derived rows to
   hand.

Anything from §23 is a larger commitment and wants its own decision first.

## Known debt, deliberately deferred

- **"On schedule" is measured forwards, not replayed from origination** (§25.1).
  A `Loan` stores payments *remaining* and no origination date, so the contract
  can only be anchored at the current balance. Storing an original principal and
  date would allow the other reading and was rejected for §13.3's reason.
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
- **Fees are counted as external at household level and internal at account
  level** (§26.3). The blank per-year fee column is the symptom; the return
  figures diverging is the problem.
- **The year editor renders imported years as blank disabled boxes** (§26.3).
  Fixed on the account page by reading the derived row; the year editor would
  need those rows passed in.
- **Account detail tiles get tight at 1280px** — six across, with "Share of
  household" wrapping. The shared `Tile` (§22.1) is now the one place to fix it.
- **The Debts table is eight columns wide** at 1280px after §24 added Share and
  Costs a month. It scrolls rather than wrapping, which is legible and not
  elegant. Same fix as the tiles above, and the same phase.
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
