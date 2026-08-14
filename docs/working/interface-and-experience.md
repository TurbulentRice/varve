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

> **Answered in part, 2026-08-14.** He uses **two forms, each with a sub-form**,
> and has offered to document them. So the guess in §6 was right about the shape
> — two or three of twenty carry the value — and the specifics are still coming.
>
> What did arrive is what he used the database *for*, which turns out to be the
> more useful half: tracking retirement growth and readiness, running Monte
> Carlos, previewing the retirement financial situation, and watching organic
> gains against contributions to confirm the money was growing on its own. Every
> one of those exists here already, which is a good sign about §1–§17 and a
> pointed one about §18 — the app can answer all four and made none of them easy
> to find.
>
> **This does not block.** The forms will inform the interface when they arrive;
> they do not get to define it. See §23 for where that lands.

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

---

## 23. Where this is going, now that the original is describable

The answer recorded in §20 arrived alongside a statement of direction, and the
two want reading together. Written down here because it is not derivable from the
code, and because it changes what the next several phases are for.

### 23.1 Consuming the legacy database in spirit, not in shape

The Access database was used for four things: tracking retirement growth,
judging readiness, running Monte Carlos, and watching organic gains against
contributions to confirm the money was growing on its own. All four already work
here. That is a good report on the first era and a pointed one about the second,
because the app could answer every one of them and made none of them easy to
find — which is exactly §18.3's diagnosis, arriving independently.

The instruction attached to it is the important part: **this is not a
reimplementation.** The two forms he uses will be documented and will inform the
interface; they do not get to define it. What is being built consumes the legacy
database in spirit — its questions, its twenty years of evidence, its hard-won
findings (§3) — while owing nothing to its shape. The audience is a generation
that never saw the original, and for them "it works like the Access forms" is not
a feature.

So §20's question is answered enough to act on, and the remaining half is an
input rather than a gate.

### 23.2 The three things that would make this genuinely useful

Stated as direction rather than as a phase plan. Each is larger than anything in
§22, and the order between them is not settled.

**Net worth into the future.** Today §22.3 plots net worth backwards and the Plan
page projects savings forwards, and nothing joins them. The join is the thing
someone actually wants: one line, running from the record into the model, with
both sides of the position on it. §17.4 called projecting debt alongside savings
the honest hard one and it still is — but the reason it is hard is now clearer,
because §22.3 had to confront the same mismatch backwards. The two sides run on
different clocks and are known to different precisions, and a projection that
hides that would be the flattering lie this codebase keeps catching.

**Retirement contributions planned as a percentage of salary.** The Plan page
asks for an annual contribution in dollars, which is not how anyone decides. What
people choose is a percentage of what they earn, from now until an age they pick.
That needs income, and income belongs to a person rather than to a household.

**What a retirement number actually means.** "I want three million" is a target
with no units attached to a life. The question underneath it — *how comfortably
will I be able to live?* — is the one the household's owner named directly, and
answering it means working backwards from spending rather than forwards from a
balance: what a year costs now, what it would cost then, and therefore what the
number needs to be. Framed the honest way round, "to live as you do now, you
would need X" is a far better answer than asking someone to guess X.

### 23.3 The modelling question all three share, and the seam that is already open

Two of the three need something the ledger does not model: **a person with
income, an age, and an intention.** The third needs spending, which attaches to
the same place.

The good news is that the seam is already cut. `Owner` exists in `core`, carries
an optional `birthYear` — added for age-based milestones and unused since — and
accounts already reference owners through `ownerIds`. So this is not a new
entity fighting its way into an established model. It is an existing entity
growing three or four fields, and Decision 1's observations-and-flows shape
should absorb income the same way it absorbed contributions.

The genuine fork, when it comes, is whether **salary and spending are properties
of a person or observations about one**. Everything in this codebase that changes
over time is an observation with a date (Decision 1, §13.2), and a salary very
obviously changes over time — so the answer is probably observations, and
`Owner.birthYear` staying a plain field is the exception that proves it, because
a birth year is the one thing about a person that genuinely does not move.

> **Decided, 2026-08-14: observations, not properties.** Put to the repository's
> owner and settled as recommended above. So a salary is a dated record of what
> someone earned over a span, and spending likewise, and neither is a mutable
> field that overwrites its own history — a raise is a new record, and last
> year's figure survives to be projected from. `Owner` keeps `birthYear` as a
> plain field, and that stays the deliberate exception rather than an
> inconsistency.
>
> This is a decision about *shape*, and it does not settle the details that come
> with it: whether a salary record carries a span or a single date, whether
> spending is entered as a total or by category, and whether an unrecorded year
> carries the last one forward the way `balanceAsOf` does. Those want deciding in
> the phase that builds them, against real screens. What is settled is that none
> of them will be answered by mutating a field on a person.

**Deliberately not decided now.** Which of the three comes first, whether
spending is entered or inferred, and how a projection shows two series known to
different precisions. All three are bigger than a page redesign, and the next
phase (§24) is a page redesign.

---

## 24. The Debts page

The one destination §22 moved without redesigning. It carries what §18.1 calls
the clearest example of this app doing something a bank statement cannot — five
ways to spend one budget, ranked, with the cost of choosing wrong in dollars and
months — and it buries that under a table of raw statement figures.

### 24.1 A correction to §19.2: the control goes next to what it drives

§19.2 specified this page as "a list that visualises without a click, the budget
control at the top, and the strategy comparison as the payoff below it". Two of
those three survive. **The control does not go at the top**, and §19.2 is wrong
about it.

> ⚠️ **§19.2's "budget control at the top" is superseded.** It was written before
> §22 measured what distance costs. The budget drives the comparison and nothing
> else — not the tiles, not the list. Putting it at the top puts the entire loan
> table between a cause and its only effect, which is precisely the defect §18.2
> measured on the old landing page (a control 2.4 screens from the numbers it
> drove) and §22.2 fixed on Plan by moving them together. Doing it deliberately
> on a new page, one phase after paying to undo it elsewhere, would be an odd way
> to spend the lesson.

The rule §22 actually established is *adjacency*, not *topness*. "At the top" was
a proxy for "prominent", and prominence is not what a control needs — a control
needs its effect in view when it moves. So the order is: facts, then the record,
then the model with its control attached to it.

1. **Three tiles** — what is owed, what it costs a month, the contractual
   minimum. All three are independent of the budget, which is what makes them
   safe to put above it.
2. **The loan list**, visualising.
3. **The budget control.**
4. **The comparison**, immediately under it.

### 24.2 What the list draws, and the mismatch it exists to show

"Visualises without a click" wants a quantity worth drawing rather than
decoration. The candidate that looks obvious — a sparkline of each balance over
time — is wrong here for a data reason: most loans carry one observation, and a
sparkline of one point is a dot pretending to be a trend. The account list
avoids the same trap by drawing share rather than history.

So each row gets a **share-of-what-is-owed meter**, the same one `AccountsTable`
uses and for the same reason recorded there: a meter, not a chart — one quantity
against its own whole, where the figure carries the value and the bar carries the
proportion at a glance. Reading it is never required.

Writing it made `ShareBar` the fifth component in the shared layer, and it is
worth saying how, because the first draft got it wrong. The bar was pasted into
this file as a local copy with a paragraph above it explaining that the two would
diverge once payments landed and so did not need extracting yet. That paragraph
was a rationalisation: §22.1's bound is **two call sites or it waits**, the two
copies were character-identical, and a rule that gets an essay of exemption on
its first real test is not a rule. It was extracted, both local copies deleted.
The prediction that they will diverge may even be right; the time to split them
is when they do.

Alongside it, a new column: **what this loan costs a month**, from `interestDue`
at the current balance. That figure is not on any statement in this form, and it
is the page's own argument made visible. The bar and the number disagree
routinely — a small balance at a punitive rate costs nearly what a far larger
cheap one does — and seeing that disagreement is the point.

> ⚠️ **This paragraph originally drew the wrong conclusion, and driving the page
> corrected it.** It said the mismatch is "exactly what the Blizzard strategy
> exists to exploit", and that someone who sees a short bar beside a large monthly
> cost has understood the comparison before reading it. Both claims are backwards.
> Blizzard targets the largest monthly interest charge, that charge tracks the
> largest *balance*, and on a realistic ledger — a mortgage, a car loan and a
> store card — Blizzard finishes **last**, $12,671 behind Avalanche. See §24.4.
>
> The true statement is narrower and more useful. Monthly cost tells you where
> your money is going right now; it does not tell you what to clear first. The
> rate does, which is why Avalanche wins and why the comparison exists at all.
> The column earns its place by making the rate's effect visible on the balances
> you actually hold — not by ranking anything.

Using `interestDue` rather than multiplying by hand is not fussiness: it
quantizes to cents through `scaleToCents`, which is the convention §11.2 settled
for anything that behaves like an installment, and re-deriving it here would be a
second implementation of a rounding rule that took a section to get right.

### 24.4 What the work turned up

**Two things were wrong, and both were found by driving the page rather than
reading it.** Neither would have been caught by a test, because both were claims
about meaning rather than about arithmetic.

*The monthly-cost column was described backwards.* §24.2 now carries the
correction in full. In short: the copy said the balance-versus-cost mismatch is
what Blizzard exploits, and on a mortgage-plus-car-plus-store-card ledger
Blizzard finishes last by $12,671 — because it chases the largest monthly charge,
and the largest monthly charge belongs to the largest balance, which here is the
cheapest debt in the ledger. The interface was telling the reader that the column
pointed at the winner when it pointed at the loser. The column is worth keeping;
the sentence around it was not.

Worth noticing that the prose was written before the numbers existed, and read as
perfectly reasonable until three real loans were on screen underneath it. That is
the same shape as §11.2's probe and ground rule 7: a claim that sounds right is
not evidence, and the distribution it was imagined against is usually the one
that agrees with it.

*A mode outlived its route, and §22 caused it.* Opening the loan editor and then
using the shell's navigation left the editor open — go to Accounts, come back to
Debts, and the half-filled form is still there. Worse, opening the editor on an
existing loan and then clicking **Debts** rendered a blank *new loan* form,
because that branch passes `existing={null}` for any non-null editing state. Two
different states rendering as one.

The bug is a direct consequence of §22 and could not have existed before it. The
loan editor is a mode within a route rather than a route of its own, which was
sound when the only ways out were the editor's own buttons — a mode could not
survive a navigation because a navigation could not happen. Persistent navigation
is exactly the thing that makes it possible, and adding one to an app whose modes
assumed it did not exist is the sort of change that breaks something quietly two
phases later. A mode is now cleared whenever the route changes.

There is a general lesson filed with it: **when a shell makes a new kind of
transition possible, every state that assumed the old transitions is suspect.**
Nothing here is a loading state or a nested route, so §12.3's signal still has
not fired — but this is the first thing the router has had to think about that is
not a URL.

### 24.5 What is deliberately not here

**Per-loan payoff sparklines** wait for the payments work, which is where a loan
gains more than one observation to draw.

**Reordering the comparison table** is untouched. It ranks by interest paid, and
whether it should rank by time-to-clear is a real question with a real answer that
nobody has asked for yet.

---

## 25. Are the payments on schedule?

§20 has carried this since the era opened, described as "cheap on top of §16, and
the question a borrower actually asks". The second half is right. The first half
turned out to depend entirely on what the question is taken to mean, and the
obvious reading is not computable from what this ledger stores.

### 25.1 The reading that does not work, and why

"On schedule" sounds like: take the contract, play it forward from the day it was
signed, and compare where the balance should be against where it is.

That is not available here, and the reason is in the model rather than in the
effort. A `Loan` stores `termMonths` as **payments remaining**, not an original
term, and it does not decrement — it is whatever was true when someone last typed
it. There is no origination date and no original principal, deliberately: §13.3
decided the form asks for what a statement tells you, and a statement tells you
the balance, the rate and how many payments are left. Anchoring an amortization
at the earliest observation using today's `termMonths` would silently mix a
balance from three years ago with a remaining term from last week, and produce a
plausible, wrong answer — the kind that is worse than no answer.

The alternative fix — store an origination date and original principal — is
rejected for the reason §13.3 gave the first time. It asks for two numbers a
borrower usually does not have to hand, in order to answer a question that can be
answered without them.

### 25.2 The reading that does work: pace, measured

Anchor forwards instead of backwards. The contract from **here** is well defined
— this balance, this rate, this many payments left — and that is exactly
`scheduledPayment`. What is not known is whether the borrower is actually keeping
to it, and that *is* recorded, in the payments §16 added.

So the question becomes two, and both are measurements rather than projections:

**Are you paying what the contract asks?** Compare the pace actually kept against
`scheduledPayment`. The pace comes out of `loanCost`'s periods — the same
observation-bracketed windows, obeying the same half-open convention (§16.5) —
because those are the only spans where both ends are known. Total paid across
periods that contain payments, over the months those periods covered.

**What does that pace do to the finish?** Project the current balance twice, once
at the contractual payment and once at the measured pace, and report the
difference in months and in interest. `projectLoan` already does this and is
parity-tested against 2,948 installments, so neither number is new arithmetic.

This is the same move §16.1 made and for the same reason: the nominal figure says
what should happen, the ledger says what did, and where they disagree the ledger
is right. "On schedule" against a reconstructed history would have been a
projection wearing a measurement's clothes.

### 25.3 What it must refuse to answer

Four cases return `null` rather than a number, and each is a way the obvious
implementation would lie.

**No payments recorded.** Nothing to measure. Not "on schedule" — unknown.

**A payment record spanning less than a month.** Two payments eleven days apart
imply a monthly pace only if you are willing to multiply by 2.8, and that is
extrapolation from one data point dressed as arithmetic. Ground rule 7 is exactly
this: a measurement only tests the distribution it samples. Below a month, the
answer is that there is not yet enough to say.

**A pace that never clears the balance.** If the measured pace is at or under the
interest, `projectLoan` already returns `null` rather than an infinite schedule.
That is not a failure to report — it is the single most important thing this
feature can say, and it gets its own message rather than a blank.

**One observation.** No period, so no bracketed span, so no pace. Same rule as
`YearRow.measurable` and §16's two-observation minimum.

### 25.4 Where it lives

`packages/loans`, beside `loanCost`, as a pure function of the same three
inputs. Not in the app: unlike the net worth shaping (§22.4) and the debts
summary (§24), this needs nothing from outside the loans domain, so putting it in
`apps/web` would be moving domain logic into a view for no reason. Ground rule 4
cuts the other way here and the package is where it belongs.

### 25.5 What the work turned up

**The contract's own schedule is one payment longer than the contract's own term,
and showing a delta hid it.** Driving a car loan with six months of payments, the
page reported "clear in 34 months, 15 sooner than the contract" directly beneath
a tile reading "clears it in 48 payments". 34 + 15 = 49.

Both figures are right. The tile quotes `loan.termMonths`, the stated number of
payments remaining. The comparison plays the balance forward at the contractual
payment, and that payment is quantized to cents (§11.2), so it falls a fraction
short of retiring the balance in 48 and leaves a residual 49th. The discrepancy
is real, tiny, and inherent in paying whole cents.

What was wrong was the presentation. A bare difference invites the reader to
reconstruct the baseline, and when they do, it disagrees with a number six inches
higher. The fix is to name the baseline instead of implying it — *15 sooner than
the contract's 49* — which puts both numbers on screen and lets the subtraction
work. The alternative, comparing the measured pace against `termMonths` rather
than against a projection, was rejected: it would mix a stated term with a
computed schedule, which is the same category error §25.1 refused at the start.

There is a general point here worth keeping. **A difference is only safe to show
alone when its baseline is not also on the page.** Everywhere else, show both.

**A test's name contradicted its own assertion.** The case for a loan with a
single observation was written expecting a refusal, and asserted `'no-payments'`
— which is what the code returned, because zero periods means zero paying
periods. But a payment *had* been recorded in that fixture. The interface would
have told someone who entered a payment that they had entered none. §25.3 lists
the single-observation case separately for exactly this reason, and the code had
quietly merged it into the neighbouring one. Now `'single-observation'`, with a
test asserting the two are distinguishable.

Worth noting how it surfaced: not from the code, and not from a failing test —
the test passed. It came from reading the test's own sentence next to its
expectation and finding they disagreed. That is the argument for the naming
convention in `CLAUDE.md` doing real work rather than being decoration.

**A fourth copy of `Tile`.** §22.1 found three and §24 extracted `ShareBar` on
the same principle; `LoanDetail` had a fourth, missed because it sat below the
fold of the file. Deleted. The lesson is not about tiles — it is that "extract
what has two call sites" needs a way to *find* the call sites, and reading one
file at a time is not it.

**The measurement agrees with the independent one already on the page.** On the
underpaid store card, the pace section says the balance never falls at $61 a
month against $167 asked. Directly below it, `loanCost` — written a phase earlier
and knowing nothing about pace — reports principal repaid of **−$300** and an
effective rate of **32.89%** against a quoted 24.99%. Two derivations from the
same records, arrived at independently, agreeing that this debt is growing. That
is the kind of corroboration ground rule 6 asks for, and it is worth more than
either figure alone.

---

## 26. Closing the small list

Two items, both carried since §22 and §24, both deliberately deferred out of
phases that would have been doing two things at once. They ship together because
neither is large enough to be a phase and both are the last of their kind: after
this the near-term list is empty and what remains is §23.

### 26.1 Editing where the account lives

§18.2's fifth structural complaint was that editing is a takeover. §22 fixed half
of it by keeping the shell around the year editor, and §22.1 settled the other
half in principle: `#/years/:year` stays as bulk entry, and single corrections
happen on the account page. This is that.

**The seam was already cut, which is why this is small.** `planYearEntry` derives
its record ids per account and per year, so planning an entry for one account
touches exactly that account's records for that year and nothing else — a fact
worth checking rather than assuming, because the function takes a list and could
easily have swept the year. And `existingYearEntry` already returns an
`editable` flag that is false when a foreign observation sits on the year's
closing date. That guard exists because the legacy import holds quarterly detail
an annual box cannot represent, and showing December's figure in an editable
field invites someone to overwrite four quarters with one number. It applies
here unchanged.

So an account's history table gains three editable columns — worth at year end,
paid in, fees — and leaves the six derived ones alone. A locked year says so and
shows its figures as text.

**What this deliberately does not become.** Not a new route, not a modal, and not
a per-cell save. The row is edited and the page saves what changed, the same
transaction shape the year editor uses, because a correction that half-applies is
worse than one that is one click further away.

### 26.2 Sparklines on the Debts list, now that there is something to draw

§24.2 rejected a per-loan sparkline on the data rather than on taste: most loans
carried exactly one observation, and a sparkline of one point is a dot pretending
to be a trend. §24.5 deferred it to "the payments work, which is where a loan
gains more than one observation to draw", and §25 is that work.

The rejection still binds for a young loan, so the rule is **two observations or
nothing**. A loan with one balance shows no sparkline at all rather than a flat
line, for the same reason a gap is drawn as a gap.

**It goes inside the Owed cell, not in a ninth column.** The table is already
eight columns and STATUS records it as tight at 1280px. A trend beside its own
current figure is also simply better than a trend in a column of its own —
the value and its direction want reading together.

**It is a meter's cousin, not a chart, and the twin rule is met elsewhere.** The
sparkline carries no axis, no labels and no hover, and the figure beside it
carries the value — the same argument `ShareBar` makes. Every balance it encodes
appears as an opening or closing figure in the periods table on that loan's own
page, which is where §16 put them. So no value is reachable only by looking at
this drawing, which is what §18.1 actually protects. It gets a text label naming
the direction rather than being hidden, because "falling" is the thing a reader
takes from it and that should not require eyes.

### 26.3 What the work turned up

**A locked year showed six empty boxes over a decade of data.** `existingYearEntry`
answers `null` for a year it did not itself write, which is deliberate — it
reports only its own records so that nobody edits what an annual form cannot
express. The year editor has always rendered those nulls as blank disabled boxes,
and on that surface it is easy to miss: one row among many. On an account page it
is the whole table. Opening an account whose every year came from the import gave
six rows of empty greyed boxes, which reads as *nothing recorded* when the truth
is the exact opposite, quarter by quarter for six years.

The fix is to read locked figures from the derived `YearRow` — which the page
already has — rather than from the entry helper. Showing the number does not
reopen what the lock protects: the lock is about *editing*, and one December box
overwriting four quarters is still impossible. The same defect remains on the
year editor, which has no derived rows to hand and would need them passed in.
Logged rather than fixed, because it is a different surface.

**A mode outlived its subject, which is §24.4 happening again.** Switching from
one account to another with the editor open kept it open — and worse, `useState`
reads its initial argument once, so the drafts built from the first account's
records were still in the boxes against the second account's rows. Two accounts'
figures in one form, with a Save button.

That is the third time this shape has appeared: §24.4's editor mode surviving a
route change, and now a mode surviving a *prop* change. The generalisation is
worth stating properly. **State derived from something must be re-derived when
that something changes, and React will not do it for you** — `useState(initial)`
is a one-time read and `useEffect(..., [initial])` is the correction. The year
editor already had the effect, for exactly this reason, and this component was
written from the pattern without it.

**The fee column on an account page has never worked, and the reason is worse
than the symptom.** Every year of every account reports no fees, while the same
account's lifetime total reports them correctly and the *household's* year rows
report them correctly too.

The cause is one argument. `summarizeSeries` computes each year's `byKind`
totals from `externalFlows`, and the two callers disagree about what that
contains. `deriveAccountHistory` passes
`flows.filter((f) => f.kind !== 'fee' && f.kind !== 'dividend')` — fees removed,
because at account level a fee is not money crossing the boundary, it is money
the account loses to its provider. `deriveHistory` passes
`externalFlowsForGroup`, which only removes *internal transfers* and keeps fees.

So the blank column is the visible half. The invisible half is that **an
account's return and the household's return do not treat fees the same way**:
one folds them into organic gain, the other counts them as an external flow.
Those two numbers sit on adjacent pages and are meant to be comparable. This is a
direct descendant of §3.4, "fees are captured but abandoned downstream", and it
survived because nothing ever displayed the per-year figure until now.

**Deliberately not fixed here.** Changing which flows count as external changes
every return figure in the application, which means it wants its own phase, its
own tests, and a run of `pnpm reconcile` against twenty years of real data to
show that the totals still land where Access says they do (ground rule 6). Doing
it inside a phase about two interface items would bury it. It is the strongest
candidate for the next slice.
