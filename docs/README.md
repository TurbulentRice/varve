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

[`working/discovery-and-architecture.md`](working/discovery-and-architecture.md)
covers phases 0–5: reading the legacy Access database and spreadsheet, the
findings that came out of them, the architectural decisions with their
trade-offs, and every phase through the loans port.

**Its section numbering is load-bearing.** Code comments cite it directly —
`§8.1` for the money conventions, `§11.2` for the loans rounding argument,
`Decision 4` for the monorepo shape. Extend it; do not renumber it. Grep before
you restructure:

```bash
grep -rn "§[0-9]\|Decision [0-9]" --include="*.ts" packages/
```

## Adding a new document

A phase extends the existing working document when it builds on what is there.
It gets a new file under `working/` when it opens a genuinely separate line of
work — a subsystem with its own discovery, its own decisions, and no need to
share section numbers.

Other kinds of documentation are welcome here as they arise: guides, operational
runbooks, design notes, decision records. Give them a directory when there are
two of a kind, not before.
