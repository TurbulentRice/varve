# Varve — Interface & Experience

The working document for the second era. The first
([discovery-and-architecture.md](discovery-and-architecture.md), §1–§17) built a
model that is correct: exact money, honest returns, a ledger that can tell money
that moved from money that grew, two domain modules over one core, and a
migration that reconciles against twenty years of real data.

This era is about whether anyone would *want to use it*.

**Started:** 2026-08-12 · **Covers:** §18 onward.
For where things stand right now, see [`docs/STATUS.md`](../STATUS.md).

> **Numbering continues from the first document rather than restarting.** Code
> comments cite sections as `§8.1`, `§14`, `Decision 1`, and those citations have
> to stay globally unique — a second `§3.1` in a second file would make every one
> of them ambiguous. So this document begins at §18 and counts on. CI checks
> citations against both files; see §18.4.

---

## 18. Where the first era left the interface

### 18.1 What is good, and worth protecting

Three things work and should survive any restructuring.

**The account detail page.** It answers a real question — what did this account
actually do — with a chart, a table twin, and figures that distinguish growth
from money arriving. It is the best page in the app and the pattern the rest
should follow.

**The strategy comparison.** Five ways to spend one budget, ranked, with the cost
of choosing wrong stated in pounds and months. Nothing else on the market shows
this, and it is the clearest example of the app doing something a bank statement
cannot.

**Charts that refuse to lie.** Gaps drawn as gaps, the sign carrying meaning
rather than colour alone, a table behind every chart so no number is reachable
only by hovering. That discipline came out of real bugs (§10) and is not
negotiable in a redesign.

### 18.2 What is wrong, measured rather than asserted

Taken from the running app at a 1280×871 viewport, on the bundled sample:

| | |
|---|---|
| Landing page height | **2,223px — 2.6 screens** |
| Where "Account by account" begins | **1.7 screens down**, inside a disclosure |
| Distance from a projection control to the chart it drives | 224px |
| Distance from that control to the numbers it drives | **2.4 screens** |
| Kinds of action in the masthead row | **three** — navigate, manage data, edit |

Five problems follow from that, and they are structural rather than cosmetic.

**The landing page is two pages wearing one coat.** It interleaves a *record* —
net worth, real contributions, what was earned, every recorded year, the accounts
— with a *model*: a what-if simulator whose hero figure, controls, fan chart and
projection table all move together and none of which describes anything that has
happened. Reading down the page, the ground shifts under you twice.

**Two headline numbers compete inside one screen.** Net worth at 171px and the
retirement chance at 327px are both set as the big figure. When everything is the
headline, nothing is.

**Positions are not first-class.** Accounts and loans are the nouns of a personal
finance app — the things a person actually has. One is a table inside a collapsed
sibling most of the way down a page; the other is a button in a row that also
contains Export. Neither has a home.

**The feedback loop is broken by distance.** Moving a slider changes a chart 224px
below it and a table 2.4 screens below that. The whole appeal of a simulator is
watching things move together, and the layout prevents it.

**Editing is a takeover.** `#/years/2025` replaces the entire application with a
form. Changing what an account is worth should happen where that account lives.

### 18.3 The diagnosis in one sentence

Everything is on one page because the app grew a feature at a time, and nothing
was ever asked to leave — so the page became a changelog of what got built rather
than an answer to what someone came to find out.

### 18.4 A second document, and why the numbering continues

The first working document reached 1,558 lines and 71 sections covering two
domains and eleven phases. It is not too long to be useful — the reasoning is the
point, and it has twice stopped a later session repeating a mistake — but it is
finished. It records how the *model* was arrived at, and that question is closed.

So this is a second document rather than an eighteenth section, and the first one
should be treated as closed: extended only to correct something now known to be
wrong, in the visible way §11.2 and §9.3 already demonstrate.

The numbering continues across both because **61 citations in the codebase depend
on section numbers being globally unique**. `§8.1` means one thing. A second
document restarting at §1 would make roughly a dozen references ambiguous
overnight, and — as §15.3 pointed out about a different check — the failure would
be silent. `check-docs.mjs` now resolves citations against both files.

---

## 19. Where the interface should go

### 19.1 The organising idea: separate the record from the model

A personal finance app answers three questions, and they want different rooms:

- **Where am I?** — positions, net worth, what changed. Facts.
- **How did I get here?** — history, returns, what each account did. Facts over time.
- **What if?** — retirement projections, repayment strategies. Models.

The current app answers all three on one scroll, which is why it feels cluttered
even though each individual piece is careful. The model is the loudest thing on
the page and it is the only part that is not true yet.

### 19.2 Proposed shape

A persistent shell with four destinations, replacing the ad-hoc back buttons:

```
Overview  ·  Accounts  ·  Debts  ·  Plan
```

**Overview** (`#/`) — one screen, one headline. Net worth and its trend, a
compact strip showing savings against debts, and anything that needs attention:
a balance that has gone stale, a loan with nothing recorded, a ledger not
exported in months. Everything links onward. **No simulator.**

**Accounts** (`#/accounts`) — a first-class list. Each row carries a sparkline
and a value, so the page shows something without a click. Adding an account
happens here.

**Account** (`#/accounts/:id`) — the page that already works, plus the two things
it is missing: editing balances and flows *in place*, and a chart you can hover
and scrub rather than only read.

**Debts** (`#/debts`) — the same treatment. A list that visualises without a
click, the budget control at the top, and the strategy comparison as the payoff
below it. Today this page makes you click into a loan before anything is drawn.

**Debt** (`#/debts/:id`) — as now, plus payments and the schedule comparison.

**Plan** (`#/plan`) — the simulator gets its own room, with controls and chart
adjacent and results immediately under them. This is where "what if" belongs, and
giving it space is what lets the Overview stop shouting.

### 19.3 What this buys

Each page answers one question. Accounts and debts become siblings rather than a
table row and a button. The record stops competing with the model. The Overview
becomes a genuine one-screen answer to "how am I doing", which is the thing
someone opens the app to find out — and which the app currently cannot give
without scrolling past a simulation.

It also creates room to be *beautiful*. Nothing on a page that answers one
question needs to be crammed, and the parts that make an interface feel alive —
a chart that responds to a cursor, a number that animates when its input moves, a
transition that explains where a page came from — are affordable only when a page
is not already full.

### 19.4 Decisions to make before building

Genuine forks, listed rather than quietly resolved.

**Does the Overview replace today's landing page or sit in front of it?** The
recommendation is replace: the current page's contents redistribute to Accounts
and Plan, and nothing is lost. The alternative — keeping it and adding a shell —
leaves the clutter and adds navigation to it.

**`#/loans` or `#/debts`?** The interface says Debts, the domain says Loan, the
URL currently says `loans`. A URL is user-facing. Recommendation: `#/debts` in
routing, `Loan` unchanged in the domain, with the mapping stated once.

**Does the hand-rolled router survive?** §12.3 named the signal precisely: a
route needing a query string, real nesting, or a loading state. `#/plan` wants
its settings in the URL so a projection can be linked — which is exactly a query
string. Recommendation: extend the union with a typed params member first, and
adopt a real router only if a second such need appears. Call sites already speak
in `Route` values, so the swap stays mechanical.

**Does editing move in-place, and what happens to `#/years/:year`?** The year
editor handles multiple accounts at once, which an in-place account editor does
not. Recommendation: keep it as a bulk-entry route, and add in-place editing on
the account page for single corrections. They serve different moments.

**Is there a design system, or does CSS stay ad-hoc?** Today it is a flat sheet
of hand-written classes reading theme tokens. That has held up well and will not
survive four more surfaces. Recommendation: a small component layer — tile, card,
stat, list-row, page-header — before the surfaces multiply, not after.

### 19.5 Deliberately not in this era

**Projecting debt alongside savings** (§17.4). Still the honest hard one.

**A server, auth, sync, institution APIs.** Unchanged from Decision 5. The seam
stays open and nothing here closes it.

**Mobile as its own surface.** The app is responsive and usable on a phone; §10
already argued that a good phone interface here is not a shrunken desktop one.
That remains true and remains later.

---

## 20. Outstanding work carried into this era

Nothing from the first era is abandoned. Collected here so it cannot quietly fall
off the end of a STATUS rewrite.

**Product gaps, roughly in order of what they buy**

1. **Net worth over time.** The series exists behind today's figure and nothing
   plots it. The first chart about the household rather than one module, and it
   needs no new data. Natural anchor for the Overview.
2. **Are the payments on schedule?** The ledger knows what was paid and what it
   cost (§16) and not whether that is ahead or behind. Cheap, and the question a
   borrower actually asks.
3. **A statement whose printed split disagrees with the balances** (§16.2). A
   genuinely interesting event, currently invisible.

**Known debt**

- **Account detail tiles get tight at 1280px** — six across, "Share of household"
  wrapping. A design-system pass (§19.4) should absorb this.
- **`localStorage` is not durable.** Export is the real backup; a "last exported"
  nudge is the honest version, and the Overview's attention strip is where it
  belongs.
- **Routing is hand-rolled** (§12.3), with the signal to reconsider now named
  concretely in §19.4.

**External, tracked, not blocking**

- **`financetools` upstream still wastes a retiring loan's budget** (§14). Fixed
  here, reported there. Nothing in this repository depends on the upstream fix.

**Still unanswered, and now directly relevant**

§6 asked three questions of the household's owner. Two are curiosities. The third
was written to anchor the interface and never got an answer:

> *What does he actually look at most? 20 forms and 4 reports were built;
> typically two or three carry all the value, and those should anchor v1's UI.*

That question is worth more now than when it was written. An era about what
people want to look at should probably begin by asking the one person who has
been looking at this data for twenty years.
