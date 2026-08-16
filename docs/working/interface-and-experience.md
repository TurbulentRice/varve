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

> ⚠️ **The paragraph above is wrong, and §27 has the corrected account.** The
> returns do *not* diverge. `summarizePeriod` applies the fee rule itself when
> computing `netExternalFlow`, and `timeWeightedReturn` applies it again via
> `isExternalFlow`, so both organic gain and TWR come out net of fees no matter
> what the caller passes. Measured rather than reasoned about this time: on the
> same balances, the two callers' flow arrays give identical `organicGain` and
> identical `twr`, differing only in `byKind.fee`.
>
> The blank column is therefore the *whole* visible defect, and it is a display
> bug rather than a correctness one. What §27 found underneath it is a different
> and realer problem — `summarizePeriod` duplicates the definition of "external"
> instead of calling the one in `core`, and the copy ignores the `feeTreatment`
> option — which is how this was diagnosed wrongly in the first place: two
> definitions that agree by default are indistinguishable until one of them is
> asked a question the other was never given.

**Deliberately not fixed here.** Changing which flows count as external changes
every return figure in the application, which means it wants its own phase, its
own tests, and a run of `pnpm reconcile` against twenty years of real data to
show that the totals still land where Access says they do (ground rule 6). Doing
it inside a phase about two interface items would bury it. It is the strongest
candidate for the next slice.

---

## 27. One definition of external

§26.3 reported this as a correctness bug: an account's return and the
household's return computed on different definitions of what counts as an
external flow, with a blank fee column as the visible symptom. The blank column
is real. The rest of that diagnosis was wrong, and how it was wrong is the
interesting part.

### 27.1 What is actually true, measured

`summarizePeriod` does not use the flow array it is handed to decide what is
external. It filters internally:

```ts
const netExternalFlow = Money.sum(
  within.filter((f) => f.kind !== 'dividend' && f.kind !== 'fee').map((f) => f.amount),
);
```

and `timeWeightedReturn` filters again, through `isExternalFlow`. So organic gain
and TWR come out **net of fees on both paths**, whatever the caller passes.
Measured rather than asserted, on identical balances with a contribution and a
fee:

| | `byKind.fee` | `organicGain` | `twr` |
|---|---|---|---|
| Household path (fees kept) | −100.00 | 0.00 | 0.000000 |
| Account path (fees stripped) | **0.00** | 0.00 | 0.000000 |

Only the first column moves. §26.3's claim that two return figures on adjacent
pages were computed differently does not survive contact with the numbers, and
that section now carries the correction.

**The lesson is worth more than the bug.** The wrong diagnosis came from reading
two call sites, seeing that they filtered differently, and concluding the
difference propagated. It does not, because a third place filters again. Ground
rule 5 says look at the output and question numbers that move; the corollary
found here is that a difference in *inputs* is not evidence until you have
watched the outputs fail to agree.

### 27.2 The real defect, which is one layer down

Three places decide what "external" means. `core/types.ts` has
`isExternalFlow(kind, feeTreatment)`, documented, with `net` and `gross` as a
deliberate parameter — the difference between them *is* the fee drag, which is
why it exists. `timeWeightedReturn` calls it. And `summarizePeriod` open-codes
the same rule by hand, ignoring the option it was given.

That is not a style complaint. `summarizePeriod` takes `ReturnOptions` and passes
them to `timeWeightedReturn`, so asking it for a gross figure returns an object
that is **internally inconsistent**:

| `feeTreatment` | `organicGain` | `simpleReturn` | `twr` |
|---|---|---|---|
| `net` | 0.00 | 0.000000 | 0.000000 |
| `gross` | 0.00 | 0.000000 | **0.009569** |

A gross TWR beside a net organic gain, in one returned value, silently. Nothing
uses `gross` today, which is the only reason this has not produced a wrong number
on screen — and `gross` exists precisely to show fee drag, which is a thing this
app will want to show.

So the fix is the one §26.3 named for the wrong reason: **one definition of
external, and everybody calls it.** `summarizePeriod` stops open-coding the rule
and calls `isExternalFlow` with the treatment it was handed.

### 27.3 Why the parameter was named into a trap

`SeriesInput.externalFlows` is what invited the display bug. A caller handed a
field called *external flows* reasonably concludes it should hand over the flows
that are external — so `deriveAccountHistory` applies the fee rule before
calling, and `deriveHistory` does not, and both are defensible readings of the
name. The callee then applies the rule itself, so the pre-filtering achieves
nothing except destroying the data `byKind` needs.

Renamed to `flows`, with the contract written down: **internal transfers must
already be removed, because only the caller knows what a group is; nothing else
should be.** That is the one filtering decision a caller genuinely owns — a
rollover between two accounts is external to each and invisible to the household,
and no callee can know which accounts are in the group.

`deriveAccountHistory` accordingly stops stripping fee and dividend, and the fee
column fills in.

### 27.4 What must not move

Every return figure in the application is derived through this code, so the test
of this phase is that **nothing changes except the fee column**. The `net` path
is untouched by construction — `isExternalFlow(kind, 'net')` returns exactly what
the open-coded filter returned — but "by construction" is what §11.2 says to
distrust.

So: the existing suites stand as the regression guard, and the migration is
replayed against the real Access data with `pnpm reconcile`, which is the check
that has held since §8.3 and reconciles twenty years to zero drift. If a return
moves, this phase is wrong.

### 27.5 What the work turned up

**Nothing moved, which was the whole point.** All 459 existing tests passed
unchanged before a single new one was added, the six reconciliation tests replayed
twenty years of the real Access data to the same figures, and the running app
reports byte-identical rows either side of the change:

```
before  2022 | $35,000 | $0 | — | −$5,000 | −12.5% | −12.5% | — | −12.5%
after   2022 | $35,000 | $0 | $200 | −$5,000 | −12.5% | −12.5% | — | −12.5%
```

One column filled in; eight did not budge. The household's rows are unchanged in
every column including fees, and the account's new per-year figures sum to
$1,100, which is exactly what its lifetime total already claimed.

**The wrong diagnosis is the more useful artifact.** §26.3 read two call sites,
saw them filter differently, and concluded the difference reached the output. It
does not, because a third place filters again. Both readings of the code were
correct in isolation; the conclusion drawn from them was not, and no test would
have caught it because the code was doing the right thing.

What made it wrong was reasoning about a *difference in inputs* rather than
watching outputs disagree. Ground rule 5 says look at the output and question
numbers that move. The corollary this phase earned is the contrapositive:
**numbers that fail to move are also evidence, and a difference upstream is a
hypothesis until they do.** Ten minutes with a probe would have shown the twr
column identical on both paths and redirected the whole diagnosis.

**Two definitions that agree are indistinguishable until one is asked something
new.** `summarizePeriod`'s hand-written external rule matched `isExternalFlow`
exactly for the default treatment, which is why nothing ever failed. It diverged
only under `feeTreatment: 'gross'` — an option that exists, is documented, is
threaded through to `timeWeightedReturn`, and had no caller. The duplicate could
have sat there for years and then produced a wrong number the first time somebody
built the fee-drag view that `FeeTreatment` was written for.

That is the argument for collapsing duplicated definitions even when they agree:
the cost is paid later and by someone who did not write either copy. This is the
same shape as §15.3's point about a check that fails silently, and §11.2's about
a probe that never sampled the case.

**`gross` works now, and nothing shows it.** The difference between the two
treatments is the fee drag in dollars, which is a genuinely interesting figure
this app can compute and does not display anywhere. Logged rather than built —
this phase was about not moving numbers, and adding a view is a different job.

---

## 28. Contributions as a percentage of what someone earns

The smallest of §23's three, chosen first for exactly that reason: it is the one
that forces the income modelling the other two build on, and it settles those
questions against a real screen at the lowest stakes. Net worth into the future
and what-a-number-means-for-a-year both inherit whatever is decided here, so it
is worth deciding carefully and cheaply rather than expensively and late.

### 28.1 What the Plan page asks for now, and why it is the wrong question

`Controls` asks *saving each year*, in dollars, on a slider from 0 to 60,000.
Nobody decides that way. What a person chooses is a percentage of what they earn
— 6% to the match, 15% because that is the rule of thumb — and the dollar figure
is the consequence. Asking for the consequence means the reader has to do the
arithmetic the app exists to do, and redo it every time they imagine a raise.

> ⚠️ **"Nobody decides that way" is false, and §29 undoes what it justified.**
> Plenty of people decide in dollars and nothing else: *I max the 401(k)*, *$500
> a month*, *whatever is left after the mortgage*. A percentage is **a** route to
> the number, frequently a derived convenience rather than the actual decision.
>
> The observation underneath is still true — percentages are how many people
> think, and one slider cannot express two earners. What was wrong was using it
> to **replace** a control instead of **adding a mode**. Same species of error as
> the Blizzard copy in §24.2: a defensible premise carried one step too far, and
> caught the same way, by someone looking at the result.

It is also the field that makes a household of two people impossible to express.
One slider cannot say that Ada saves 12% of $95,000 and Ben saves 6% of $70,000,
and averaging them into one number throws away the fact that they will not stop
saving in the same year.

### 28.2 Income is an observation, and everything follows from that

§23.3 settled the shape. The details it deferred, settled here:

**A single date, carried forward — not a span.** An income record says *as of
this date, this person earns this much a year*, and the answer for any later date
is the most recent record on or before it. That is `balanceAsOf`'s rule exactly,
and it is how a raise actually works: it happens on a day and holds until the
next one. A span would be a second temporal concept in a codebase that already
has one, and it would need an answer for what happens in the gap between spans.

**Annualised, always.** Not monthly, not per-paycheck. A percentage of salary is
an annual idea, the projection steps in years, and storing a period alongside the
amount means every reader has to normalise before it can add two people together.
The form can say "a year" and mean it.

**It belongs to a person, not an account.** This is the first record in the
ledger that does. Every other observation hangs off an account or a loan, and
income hangs off an `Owner` — which is what makes it the thing that unlocks the
rest of §23, because spending will hang there too.

**Called income rather than salary.** The UI says salary because that is what
most people are entering, and the type says income because the moment someone is
self-employed, or has rental receipts, the narrower word starts lying. No `kind`
field: categories are a §23.2 problem for spending, and inventing them here would
be building against a screen nobody has drawn.

### 28.3 What is *not* a record: intentions

A desired retirement age and a contribution rate are not observations. They are
not measurements of anything that happened; they are what someone intends. §19.1
drew this line for the interface — the record is what happened, the model is what
if — and it turns out to cut the data model the same way.

So **birth year is a property** (it does not move, §23.3), **income is a record**
(it moved, and when it moved is the point), and **retirement age and savings rate
are plan settings** — held by the Plan page, not written to the ledger.

That has a consequence worth stating: change your mind about retiring at 62 and
nothing is lost, because there was never a fact there. Change your salary and the
old figure survives, because there was.

### 28.4 Two people retire in different years, so the contribution steps

Once contributions are per-person, they stop per-person. Ada retiring in twelve
years and Ben in eighteen means the household saves both shares for twelve years
and Ben's alone for six more. A single `annualContribution` cannot say that, and
picking one horizon for the household would either stop Ben's saving early or
keep Ada's going after she has stopped.

So `simulate` gains a **contribution schedule** — one figure per projected year —
alongside the scalar it already takes. The scalar path is unchanged and still
applies `contributionGrowth`; the schedule path is precomputed. Both collapse to
the same thing inside the hot loop, which now reads a per-year array rather than
carrying a running multiply, so the sanctioned float loop (ground rule 2) gets no
slower and no less honest.

The projection horizon becomes the **last** retirement rather than the first. The
alternative — stop at the first — would silently discard the years the other
person is still saving, which is the flattering-direction mistake in reverse and
just as wrong.

> ⚠️ **The paragraph above overreached, and building it showed why.** The
> *contribution schedule* runs to each person's own retirement — that part is
> right and is what shipped. The *projection horizon* is a different question and
> it is not this calculation's to answer: someone whose saving stops in fourteen
> years may perfectly well want to know where they stand in twenty-five, and
> forcing the chart to end when the contributions do would answer a question they
> did not ask.
>
> So the horizon stays the reader's, `For N years` keeps its slider, and the
> schedule simply falls to zero inside it once everyone has stopped. What
> `yearsToLastRetirement` is actually for is *saying so* — the control now
> carries a line reading when the last person stops, which turns a derived number
> that nothing used into the one place it was needed.

### 28.5 Where income gets entered, and the destination not built

Income is entered on the Plan page, beside the rate it feeds, and there is no
fifth destination for people in this phase.

That is a compromise and worth naming as one. The record/model split says a
salary is a record and the Plan page is the model room, so on principle income
belongs somewhere else — a **People** destination, which §23 makes inevitable
once spending and per-person accounts arrive. Against that: a fifth nav item
built to hold one number per person is a room with a chair in it, and this phase
would then be two things at once, which is the mistake §22 and §24 both avoided
deliberately.

Entry location is not conceptual home — the year editor is reached from
everywhere and belongs to no destination (§22.1). Income is stored as a proper
ledger record, exported and reloaded like everything else; only the form sits on
Plan. When People arrives, the form moves and nothing about the data changes.

### 28.6 Schema version 4

`incomeObservations` joins the document. Versions 1 through 3 open unchanged,
with the collection read as empty — the fourth consecutive migration that adds a
collection rather than changing the meaning of a populated field, which is the
cheap kind (§16.3).

### 28.7 What the work turned up

**A control became a consequence, and `Settings` got smaller.** `contribution`
left the projection settings entirely — it is now derived from the savers rather
than chosen, and `Controls` shows it as a figure with "worked out from the shares
above" underneath. Three sliders where there were four, and the one that went was
the one asking the reader to do the arithmetic this app exists to do. Worth
noticing that removing a field made the page say *more*: the household total is
still there, and now the two numbers behind it are as well.

**The sample could not demonstrate the feature, and fixing that needed care.**
Ada and Ben had no birth year, so both cards read "no birth year on file" and the
entire when-do-you-stop half was invisible on the bundled ledger. The fix is
birth years for two invented people — but applied to the *sample writer*, not to
the importer, because the Access database has no such column and inventing one
during a migration would put a made-up figure into a real household's record.
Sample data may be invented; imported data may not.

**A placeholder read as "not saved".** After recording a salary the field cleared
and showed the figure greyed out as a placeholder, which is the standard pattern
and, next to a card whose other numbers are all live, looks exactly like an empty
box. Now the recorded figure is stated in full with the date it was true, and the
input is labelled *New figure*. The date turned out to be the more valuable half:
a salary is carried forward, so a projection run today may be using a number from
two years ago, and that is the same thing `LoanState.asOf` exists to say.

**§28.4 promised a horizon it should not deliver.** It said the projection runs
to the last retirement. Building it showed that conflates two questions: the
*contributions* stop per person, which is right, but the *horizon* is the
reader's — someone whose saving ends in fourteen years may well want to see
twenty-five. That section now carries the correction, the slider keeps its range,
and `yearsToLastRetirement` earns its place by labelling it rather than
overriding it.

**The two contribution paths collapsed rather than branching.** Adding a schedule
to `simulate` could have meant an `if` in the inner loop, ten thousand runs deep.
Instead both paths resolve to one `Float64Array` before any run begins — the
scalar compounds its growth into it, the schedule is read straight across — so
the loop indexes an array where it used to carry a running multiply. Same work,
one shape, and a `contributionGrowth` passed alongside a schedule now provably
does nothing rather than silently compounding a raise twice.

---

## 29. Putting the chart back, and adding a mode instead of replacing one

§28 shipped and was reviewed, and two of its decisions did not survive contact
with the page. This corrects both. It is a smaller phase than §28 and it exists
because §28 was wrong in a way that only looking could show — which is the
process working rather than failing, but it is worth writing down as a
correction rather than a refinement.

### 29.1 Measured, because the era's own standard demands it

At 1280×871 on the bundled sample, the same method §18.2 and §22.5 used:

| | Before §28 | After §28 |
|---|---|---|
| Plan page height | 2,305px — 2.65 screens | **2,771px — 3.18 screens** |
| Where the chart starts | 562px | **1,197px — 1.37 screens** |
| Where the numbers start | 1,104px | 1,550px — 1.78 screens |
| The savers block | — | **464px** directly under the headline |

Two things stand out. The Plan page became **taller than the landing page §18 was
written to condemn** — 3.18 screens against 2.6. And §22.2's headline achievement
on this page, a control 32px from the chart it drives, was undone by putting 660px
of form between them.

The lesson is not that a form is bad. It is that the Plan page's job is
*interaction with a visualisation* — move a thing, watch the fan move — and
anything that pushes the fan below the fold is taking the page's purpose away
regardless of how good the form is.

### 29.2 Amount and percentage are two modes, not two eras

The savings input becomes one cell in the controls row with a segmented toggle.

**Amount** is the default and is the old slider, unchanged. Nothing that worked
before stopped working.

**% of salary** shows a rate and a set of person chips — pick one person, several,
or `Custom…` for a figure not recorded against anybody. The resulting dollar
amount is the cell's value, so the mode swap changes how the number is *arrived
at* and never what the control reports.

The per-person detail from §28 survives behind an expander inside that cell: a
rate and a stop-age each, revealed only when someone is actually planning two
earners separately. Simple by default, powerful on demand — which is the answer
to §28's real failure, since none of that information was wrong, it was just
permanently on screen at full size.

**`Custom…` matters more than it looks.** It is the case where somebody wants to
model a salary they have not recorded, or are not sure about, or that belongs to
nobody in the ledger — and without it, the percentage mode would demand a ledger
write before it would answer a hypothetical. A model room must not require
records to be created before it will model anything.

### 29.3 The record gets a room

People, their birth years and their salaries move off Plan entirely. Income is a
*record*; Plan is the model room; §28.5 already called the placement a
compromise and it turned out to cost more than estimated.

They move into what was the year editor, reframed. `#/years/:year` becomes
`#/record`, with the old spelling kept as a parse-only alias for the reason §22.1
gives — a total parser silently sending old bookmarks to the Overview destroys
evidence. The surface holds two panes:

- **Balances** — today's year editor, with its year stepper, unchanged.
- **People** — name, birth year, and salary history per person.

The year stepper lives *inside* the Balances pane rather than at the top of the
page, because it scopes that pane and not the other one, and a stepper above both
would claim to scope a salary by year.

**Why this room and not a fifth destination.** The four destinations are places
you go to *look* — Overview, Accounts, Debts, Plan all answer a question. The
record room is where you go to *write*, and it is the natural home for the
provider connections this project has deferred since Decision 5: nobody connects
a bank "on the Accounts page". Gathering the writes in one place also means the
question "where do I put this new kind of record?" has an answer that does not
grow the nav.

That leaves an inconsistency, named rather than hidden: **adding an account still
happens on Accounts, and adding a loan on Debts**. §19.2 put them there
deliberately and §22 built them that way. Whether they eventually move into the
record room is a real question and this phase does not answer it — moving them
would be a second restructuring riding along with a correction, which is the
thing §22 and §24 both refused to do.

### 29.4 `saveOwners`, and the first property this app edits

Editing a birth year needs a repository write that did not exist: `owners()` was
readable and nothing could change one. Added alongside the others, with the same
upsert-by-id semantics.

Worth noting what makes it different. Every other write in this app appends a
dated record — a balance, a payment, a salary. A birth year is a **property**,
so saving one overwrites. That is exactly the distinction §23.3 settled and
§28.2 built on, and it is the first time the difference shows up as two different
kinds of write rather than two different shapes of data.

### 29.5 What the work turned up

**The numbers, measured the same way §29.1 was.**

| | Before §28 | After §28 | Now |
|---|---|---|---|
| Plan page height | 2,305px | 2,771px | **2,180px — 2.5 screens** |
| Where the chart starts | 562px | 1,197px | **607px — 0.7 screens** |
| Control → the chart it drives | 32px | 660px | **32px** |

The page is now *smaller than it was before §28*, and §22.2's 32px is back
exactly. The percentage mode costs about 90px more than the amount mode when its
chips are showing, and the per-person expander costs another 270px on top of
that — but only while it is open, and only for someone who asked for it.

**A form that needs nothing must be the default.** The amount mode is first not
because it is more common but because it is the one that works on an empty
ledger. A percentage cannot produce a number until somebody has a salary on file,
so making it the default would have meant a fresh install opening on a control
that reads `$0` and a warning explaining why. That is a general rule worth
keeping: **where two modes compute the same thing, default to the one with no
prerequisites.**

**`Custom…` turned out to be load-bearing rather than a nicety.** Driving the
percentage mode on a cleared ledger, every chip carried a `?` and the total sat
at `$0` — correct, and useless. `Custom…` is what lets somebody ask *what if I
saved 15% of $120,000* without first writing a salary into a ledger they may not
even be modelling themselves. A model room that demands records before it will
model anything has stopped being a model room, which is the §19.1 line drawn
from the other side.

**Naming a warning's destination matters more when the destination moved.** The
missing-salary strip used to say "enter what they earn below", which was true
when the form was 200px down the same page. It now says *Update numbers*, which
is the button in the shell — the warning has to name the room, because the fix
is no longer in view.

**The record room made `sectionOf` mean something it did not before.** It already
returned `null` for the year editor on the grounds that a task is not a place.
That reading is now stronger rather than weaker: the four destinations are where
you go to *look*, and this is where you go to *write*, so lighting a nav item
while it is open would claim it belongs to one of them. The test that asserts
this got its name rewritten to say so.
