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

---

## 21. The licence, decided before there are contributors

Not an interface question, and it belongs here anyway: it is a decision with a
deadline, and the deadline is quiet. The repository was MIT-licensed from the
first commit — the reflex choice, made without examining it. Examining it now is
cheap because the copyright is held by one person. It stops being cheap the first
time an outside pull request is merged, because from then on each contributor
holds copyright in their patch and relicensing needs every one of them to agree.
Projects that discover this late either chase signatures for years or never
change at all. So the question gets answered while the answer is still a commit.

**What was actually weighed.** Three families were on the table.

*Stay permissive.* MIT and Apache-2.0 grant the same practical freedoms: use,
modify, redistribute, sell, no obligation to publish anything back. The
difference is entirely in what the text says beyond that.

*Go copyleft.* AGPL-3.0 would force anyone running a modified Varve as a network
service to publish their changes. It was considered seriously and rejected on the
facts of this codebase, not on ideology. §12 made this app local-first with no
server, which means the network clause has almost nothing to bite on today — its
only real effect would be on a fork that adds the hosted mode this project has
deliberately deferred. Against that thin benefit, AGPL makes the code
unusable inside most companies, which is exactly where the people who have opinions
about twenty-year retirement arithmetic tend to work. Paying a real cost in
contributors for a clause that currently governs nothing is a bad trade. Worth
revisiting *if* a hosted Varve is ever built — at which point the same
sole-copyright-holder window will have closed, which is a reason to note the
possibility here rather than assume it stays open.

*Go source-available* (BSL, Polyform, and relatives). Rejected quickly. These
exist to stop a competitor commercialising your work, and there is nothing here
to protect commercially. The cost is that the project stops being open source in
any sense a reviewer would recognise, which for a repository whose main output is
a written record of reasoning is a loss with no matching gain.

**The choice: Apache-2.0.** It is MIT after a lawyer's pass, and each of the
three things it adds turns out to be pointed at this project specifically.

The **patent grant** (§3 of the licence) is the substantive one. MIT is silent on
patents: it grants copyright permission and leaves open the theory that a
contributor could contribute code and later assert a patent reading on it.
Apache-2.0 grants that licence explicitly and terminates it for anyone who files
a patent suit over the work. Financial calculation methods are a patented and
litigated space — retirement projection and amortisation are not a quiet corner
of the art — and Varve implements exactly that kind of arithmetic. This is the
gap MIT leaves that is most plausibly load-bearing here.

The **limitation of liability** (§8) matters more than it would for a utility
library. MIT disclaims warranty in one paragraph and says little about liability.
Apache-2.0 disclaims warranty *and* caps liability separately and explicitly.
This software's whole purpose is to produce numbers someone may act on when
deciding whether they can retire. Ground rule 5 exists because these numbers have
been wrong before and were caught only by looking. A licence that says plainly
this comes with no warranty and no liability is the honest match to a codebase
that already documents its own near-misses.

The **trademark reservation** (§6) is small and worth having. It means the code
can be forked freely while the name stays attached to this project — the fork
gets everything except the ability to call itself Varve. `NOTICE` says so in one
sentence, along with the plainer point that this is a tool for looking at your
own records, not financial advice.

The cost of all this is a 200-line licence file instead of a 20-line one, and a
`NOTICE` file to keep current. That is the entire downside.

**On the docs.** A split was considered — code under Apache-2.0, `docs/` under
CC BY 4.0 — on the reasoning that code licences fit prose awkwardly (what is
"source form" for an essay?) and that these documents are a substantial artifact
in their own right. It was not done. Apache-2.0's definitions are broad enough to
cover documentation, a second licence is a second thing to explain and to get
wrong at the boundary, and no concrete problem motivated the split. Noted rather
than done, so that a future reader knows it was weighed.

**Compatibility.** Apache-2.0 permits everything MIT permitted, so nothing built
against the earlier releases breaks. Those releases remain MIT-licensed under
their own terms; a relicence is not retroactive and cannot revoke a grant already
made. Anyone who prefers the MIT terms can keep using the tagged commits that
carried them.

---

## 22. The shell, and the first chart about the household

The first phase of this era does two things that only make sense together: it
builds the four-destination shell §19.2 proposed, and it gives the Overview
something to be about. Either alone is worse than both. A net worth chart added
to today's landing page would land on a page §22.2 is about to dissolve, and
would grow the very page §18.2 measured at 2.6 screens. A shell built without the
chart would leave the Overview with three tiles and nothing else — an empty room
is not obviously better than a crowded one, and it would be hard to tell whether
the restructuring had helped.

### 22.1 The five forks, settled

§19.4 listed five and recommended on each. Three were accepted as written, two
moved.

**The Overview replaces the landing page.** Accepted, and the argument is
stronger than §19.4 made it. "Sit in front" is not a compromise between the two
options — it *is* the failure mode §18.3 diagnoses. That page is a changelog
because it grew a feature at a time and nothing was ever asked to leave; adding a
page in front of it asks nothing to leave, and buys a fifth destination on top of
the four. The redistribution is in §22.2 and it loses nothing.

**`#/debts` in routing, `Loan` in the domain.** Accepted, with an addition
§19.4 did not consider. `parseRoute` is total — anything it does not recognise is
the landing page (§12.1) — so renaming the route would send every existing
`#/loans` bookmark silently to the Overview. That is the precise mistake §12.5
already caught and corrected once: a URL that quietly resolves somewhere else
destroys the evidence, and the reader cannot say what they tried. So `loans`
survives as a **parse-only alias**. It is understood, it is never emitted, and
`formatRoute` produces only the canonical `debts`. Three lines, and old links
keep working instead of failing in the flattering direction.

**The year editor survives as bulk entry.** Accepted. December's sit-down over
every account and "that 2019 figure is wrong" are different moments and want
different surfaces. In-place editing on the account page is real work — the
observations-and-flows split, validation, optimistic state — and belongs to its
own phase rather than riding along with a restructuring. `#/years/:year` keeps
its URL.

**Plan settings stay out of the URL, so the router survives untouched.** This is
the first departure. §19.4 took it as given that `#/plan` wants its settings
linkable, and read that as the query-string trigger §12.3 named. But §12.4 is a
rule in the same document and it points the other way: *route parameters are
identity, never data*. A contribution amount and a retirement target are not
identity. They are a statement about someone's finances, and §12.4's whole reason
for existing is that a URL is the single most likely thing to be copied out of
this app and pasted into a chat or a screenshot. Ground rule 1 governs what
reaches a bundle; §12.4 extends the same instinct to what reaches a clipboard,
and a linkable projection is a convenience with no user attached to it.

So the trigger does not fire, and the hand-rolled router keeps its **0.59 KB**
against React Router's 15–20 (§12.5). Worth recording for whoever revisits this:
even if the decision reverses, the trigger *still* would not fire, because
`parseRoute` is a total function over the whole hash string and `#/plan?years=25`
is a parser change plus a typed union member — not a router. §12.3's signal
should be read as "a route needs something the union cannot express", and a
query string is not yet an example of that. The genuine signals remaining are
nesting and loading states, neither of which local-first data produces.

**The component layer is bounded by what already repeats.** The second
departure, and one of degree rather than direction. §19.4 named five components —
tile, card, stat, list-row, page-header — to build before the surfaces multiply.
The direction is right and the count is speculative: three of those five would be
designed against pages that do not exist, which is how a design system ends up
fitting nothing. The bound applied here is **two call sites or it waits**, and
that bound is not hypothetical — `Tile` is already defined twice, once as a local
function in `StatTiles.tsx` and once as hand-written `div`s in `NetWorth.tsx`,
against 129 selectors in a single 867-line sheet. See §22.4 for what that
actually yielded, which was not what this paragraph predicted.

### 22.2 Where the landing page went

Nothing was dropped. The old render was roughly 120 lines of JSX doing five
jobs, and each piece has a destination:

The masthead's identity — household, owners, counts — becomes the shell header.
Its actions split, which is the point: §18.2 counted **three kinds of action in
one row**, and navigation now lives in the nav while Export, Open and Update
numbers cluster as data actions. Net worth and its caveat anchor the Overview.
The retirement hero, the controls, the projection chart and the projection table
all move to Plan together, and being together is the fix for the 2.4-screen
feedback loop §18.2 measured — the controls now sit directly above the chart they
drive, with the numbers immediately under it. `AccountsTable` is promoted out of
its disclosure onto Accounts, where it stops beginning 1.7 screens down.
`LoansView` becomes Debts unchanged.

`StatTiles` is the one piece that genuinely splits. Value, Contributed and Earned
are facts about the household and stay with the record on Accounts; they are also
what the Overview's chart is drawn from, so duplicating them there would put the
same three numbers on two pages. Average return and Fees paid are account
concepts and go with them.

**`HistoryTable` was reassigned mid-flight.** The plan going in was to make it the
table twin of the net worth chart, on the reasoning that it is the household's
year-by-year record and every chart needs a twin (§18.1). Reading it again killed
that: its nine columns are time-weighted return, the legacy spreadsheet's figure,
the delta between them in basis points, and the benchmark. That is a table about
*how the accounts performed*, not about what the household is worth, and pressing
it into service as a net worth twin would have made it answer neither question.
It goes to Accounts with the rest of the record, and the net worth chart gets a
purpose-built twin of four columns — date, assets, debts, net — which is the
honest twin and about fifteen lines.

### 22.3 Net worth over time is one series, not three

The obvious chart here plots all three quantities: assets, debts, and the net
line between them. It is wrong, and the reason is arithmetic rather than taste.

Debts are small against assets in any household that has been saving for twenty
years — in this one, by more than an order of magnitude. Draw all three and the
net line and the assets line are separated by less than the stroke width for most
of the plot: two series in the legend, one visible line on the chart. That is the
same defect §18.1 records being caught by looking — *a legend with two identical
swatches* — arrived at from the opposite direction. Drawing debts as a downward
area from zero fixes the collision and replaces it with a second one, a series
that renders as a flat line on the axis for its whole length.

So the Overview's chart is **one series: net worth**. The split is not lost — it
is in the three tiles directly above the chart, and in all four columns of the
table twin below it. A single series also means no legend at all, since the title
names the only thing plotted, and no second categorical hue: the line is
`--data-line`, the quantity hue §10 already validated against both surfaces.
Adding a token would have meant re-running the palette validator for a
distinction the chart does not need to make.

Two properties carry over from the existing charts because they are not
negotiable (§18.1). Gaps are drawn as gaps — `d3-shape`'s `defined` breaks the
path at any date with no observation on either side, rather than bridging it, for
the same reason §16 and ground rule 3 give. And net worth can go negative, so the
plot draws a zero rule whenever its domain crosses zero and lets the sign carry
the meaning, with colour never doing that job alone.

### 22.4 Lifting the series out of the render

`App.tsx` built the net worth series inline, and it was the worst code in the
app for a reason that is structural rather than careless: it cannot go in
`retirement` or `loans` without making those two packages know about each other,
which §17.1 spent a section preventing, and `core` deliberately takes two
anonymous series so it can stay ignorant of both (§17.2). With no legal home it
stayed in a `useMemo`, where nothing could test it.

It moves to `apps/web/src/lib/net-worth.ts`, which is the right compromise: the
app is the only layer that legitimately knows both sides exist, and a plain
function there is as testable as anything in `packages/` — `apps/web` has run
`vitest` since §12.5. The move also fixed a defect visible only once the code was
somewhere it could be read. Building the debt side ran a `filter` and a `sort`
over every loan observation once per date, inside a `map` over every date — a
quadratic scan rebuilt on every render, invisible at twenty observations and not
the kind of thing that announces itself later. It is one pass now.

### 22.5 What the work turned up

**The numbers §18.2 measured, measured again.** Same viewport, same bundled
sample, same method.

| | Before | After |
|---|---|---|
| Landing page height | 2,223px — **2.6 screens** | 1,388px — **1.6 screens** |
| Where the account list begins | **1.7 screens down**, in a disclosure | 230px, on its own page |
| Control → the chart it drives | 224px | **32px** |
| Control → the numbers it drives | **2.4 screens** | 574px — 0.66 screens |
| Kinds of action in one header row | **three** | one nav, one primary, one data pair |

The Overview figure includes the year-by-year table left open, so it is the
honest worst case rather than the flattering one. Everything the old page
carried is still reachable; it is spread over four rooms instead of stacked in
one.

**The whole restructuring cost +2.28 KB gzipped.** 101.34 KB to 103.62 KB, for
four surfaces, a chart, a table twin, the shell and the shared components. Worth
recording next to §12.5's +0.59 KB for routing, because both are the same
argument: the expensive thing in a front end is almost never the code you write
for your own problem.

**Ground rule 5 caught something, again by looking at the output.** With a loan
recorded, the Overview's headline read $370,500 while the last point on the chart
sat at $389,000 — the line ending *above* the figure it is supposed to
illustrate. Both are right. The loan statement was dated after the last recorded
balance, so it moves the full-resolution figure and cannot move an annual grid
whose newest year end predates it. The tempting fix is to backdate the debt to
31 December, and it would have been a lie in the flattering direction — the exact
failure §17.2 exists to prevent. What shipped instead is one line under the chart
saying where the line ends and what the figures above are as of. The mismatch is
real, so the interface says so.

Worth noting how close this came to going unnoticed: the bundled sample has no
loans at all, so every screenshot of the Overview showed debts as a dash and the
two figures agreeing. It surfaced only after adding a loan through the running
app, which is ground rule 6's point about driving the thing rather than reading
it.

**A test had to be deleted, and that was the signal.** `#/accounts` was in the
list of URLs that fall back to the landing page — "no id", nonsense. It is now a
destination. Deleting an assertion is usually a smell; here it is the whole
change in one line, because a list of positions you cannot link to is not
first-class, and §19.2's complaint was exactly that positions are not
first-class.

**The duplication was worse than §22.1 estimated.** `Tile` was written out three
times identically, not twice — `StatTiles.tsx`, `AccountDetail.tsx`, and as raw
`div`s in `NetWorth.tsx`. Three call sites for a component nobody had noticed was
a component is a reasonable summary of what "the CSS will not survive four more
surfaces" meant in practice. The bound held anyway: the layer that shipped is
four small components across three ideas, and `list-row` and `stat` are still
unbuilt because nothing has needed them twice.

**`NetWorth.tsx` was deleted rather than moved.** Its tiles are now the
Overview's, and its caveat became one item in an attention strip that is empty
whenever nothing is wrong. That last property is the one worth protecting: a
panel with something in it every time gets read as decoration by the day it
matters.

**What this phase deliberately did not touch.** The Debts page kept its existing
order — table, then budget control, then comparison — rather than taking §19.2's
"budget control at the top, comparison as the payoff". That is a redesign of one
surface, and doing it inside a phase that moves every surface would have made
both harder to review. In-place editing on the account page (§22.1) is likewise
still to come, and `#/years/:year` is unchanged.
