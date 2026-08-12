# Documentation

Everything written down about Varve that is not a code comment.

| | |
|---|---|
| [`STATUS.md`](STATUS.md) | Where things stand, what's next, known debt. **Living** — rewritten each phase. |
| [`working/`](working) | Working documents: the reasoning behind what was built. **Accumulating** — extended, corrected in place, never trimmed. |

The root [`CLAUDE.md`](../CLAUDE.md) holds the goals, ground rules, and working
protocol. It is the durable layer and deliberately short, since it loads into
every session; depth belongs here.

## The two kinds of document

The split that matters is **volatility**, and it is worth keeping clean.

`STATUS.md` *replaces* itself. It answers "where are we" and is wrong the moment
a phase lands, so it gets rewritten rather than appended to.

A working document *accumulates*. Its value is the record of how the thinking
changed — including the places it was wrong and got corrected, which is why
corrections are marked visibly rather than edited away. Twice, a correction
written into one survived a later session about to repeat the mistake. Mixing an
overwritten status section into an append-only document would turn its history
from a record of reasoning into churn, which is why these are separate files.

## Working documents

There are two, and they divide by **era** rather than by topic.

[`working/discovery-and-architecture.md`](working/discovery-and-architecture.md)
— §1–§17, **closed**. Reading the legacy Access database and spreadsheet, the
findings that came out of them, the architectural decisions with their
trade-offs, and every phase from the calculation core through net worth. It
records how the *model* was arrived at, and that question is settled. Extend it
only to correct something now known to be wrong, visibly, as §11.2 and §9.3 do.

[`working/interface-and-experience.md`](working/interface-and-experience.md) —
§18 onward, **open**. Whether anyone would want to use what the first era built.

**The numbering runs continuously across both.** A second document restarting at
§1 would make `§8.1` ambiguous in a dozen places, and the failure would be
silent. §18.4 sets this out; `check-docs.mjs` enforces it.

**Section numbering is load-bearing.** Code comments cite it directly — `§8.1`
for the money conventions, `§11.2` for the loans rounding argument, `Decision 4`
for the monorepo shape. Extend it; do not renumber it. This is checked rather
than trusted, on every pull request and locally:

```bash
node .github/scripts/check-docs.mjs
```

It resolves every `§` and `Decision` citation in the repository — including the
ones the working documents make of each other — against the headings that
actually exist, and fails if any lands nowhere.

## Adding a new document

A phase extends the current working document when it builds on what is there. It
gets a new file under `working/` when an **era** ends — when the question the
existing document was answering is settled and a different one takes over. That
has happened once, at §18.

A new file continues the numbering. It does not restart it.

Other kinds of documentation are welcome here as they arise: guides, operational
runbooks, design notes, decision records. Give them a directory when there are
two of a kind, not before.
