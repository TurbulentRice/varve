# Retirement Tracker → (working title)

A personal finance platform. Retirement tracking first, loan repayment second.

Grown out of a Microsoft Access database that has tracked one household's
retirement savings quarterly since 2006, plus the Excel workbook that condensed
it. Both are preserved in [`legacy/extracted/`](legacy/extracted/README.md); the analysis that
came out of them is in [WORKING-DOC.md](WORKING-DOC.md).

## Getting started

```bash
pnpm install && pnpm test
```

## Layout

| Package | What it is |
|---|---|
| [`packages/core`](packages/core) | Domain model and financial calculations. Pure, zero dependencies. |
| [`packages/legacy-import`](packages/legacy-import) | One-way migration from the Access database. |
| [`legacy/extracted/`](legacy/extracted) | Schema and extraction tooling for the legacy database. |

## A note on the data

The database this grew out of holds one household's real balance history, so
**it is not in this repository** — only the schema, the reconstructed queries,
and the extraction script, none of which contain personal data.

The migration is verified instead against
[a synthetic fixture](packages/legacy-import/test/fixtures/synthetic.ts): invented
round numbers reproducing every structural quirk the real data taught us — a
rollover, a many-to-one consolidation, a dormant account that reconciles with
nothing, a partial year, a benchmark carried as an account. That suite runs
everywhere, on every clone.

If you do have the source database, `legacy/extracted/extract.sh` regenerates
the extract and a second suite lights up, replaying twenty years through the new
model and checking every year-end total against Access's own `qryYearEndTotals`.
It asserts properties rather than balances, so it reveals nothing about what it
reads.

## The shape of it

An account has two append-only streams — **balance observations** ("it was worth
this on this date") and **flows** ("this crossed the boundary on this date").
Returns, gains, totals, and projections are all derived, never stored.

That choice buys three things: transfers become representable, so a rollover
stops being counted as investment growth; granularity stops being part of the
schema, so hand-entered quarterly data and a daily API feed are the same shape;
and opening balances cannot drift from closing ones, because they are the same
observation.

Money is a `bigint` at four decimal places — exactly the scale Access's
`Currency` type used, so the entire twenty-year history round-trips losslessly.
Rates are ordinary `number`s. `Money.ratio()` is the only bridge between them.

## Status

Discovery and the calculation core are done and reconciled against the real
data. Storage, UI, and the loans module are not started — see
[§9 of the working doc](WORKING-DOC.md#9-initializing-the-real-project).
