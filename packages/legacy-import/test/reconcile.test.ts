/**
 * Reconciliation against the real legacy database.
 *
 * The acceptance bar: recomputing year-end totals from the migrated model must
 * reproduce Access's `qryYearEndTotals` exactly. Return figures are *expected*
 * to differ — that is the point of the migration — but no dollar of anyone's
 * balance history may move.
 *
 * The source data is one household's actual balance history and is not in this
 * repository (see `.gitignore`), so this suite runs only where the data exists.
 * `synthetic.test.ts` covers the same logic on invented numbers and always runs;
 * this is the local check that the real thing still agrees.
 *
 * Assertions here are deliberately written against *properties* — "every year
 * reconciles", "exactly one warning survives" — never against specific balances
 * or names, so that the committed test reveals nothing about the data it reads.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { Money, balanceAsOf, summarizeYear, yearEnd, type BalanceObservation, type Flow } from '@varve/core';
import { importLegacy, type ImportResult } from '../src/import.js';
import { loadLegacyCsv } from '../src/load.js';
import { indexBy, legacyYearEndTotals } from './helpers.js';

const CSV_DIR = fileURLToPath(new URL('../../../legacy/extracted/csv', import.meta.url));
const HAS_LEGACY_DATA = existsSync(join(CSV_DIR, 'tblPerformance.csv'));
const withLegacyData = describe.skipIf(!HAS_LEGACY_DATA);

if (!HAS_LEGACY_DATA) {
  console.warn(
    `\n  Skipping real-data reconciliation: nothing at ${CSV_DIR}` +
      '\n  Run legacy/extracted/extract.sh against the source .accdb to enable it.' +
      '\n  (synthetic.test.ts covers the same logic and always runs.)\n',
  );
}

let imported: ImportResult;
let legacyTotals: Map<number, Money>;
let years: number[];
let observations: Map<string, BalanceObservation[]>;
let flows: Map<string, Flow[]>;

beforeAll(async () => {
  if (!HAS_LEGACY_DATA) return;

  const csv = await loadLegacyCsv(CSV_DIR);
  imported = importLegacy(csv);
  legacyTotals = legacyYearEndTotals(csv, imported);
  years = [...legacyTotals.keys()].sort((a, b) => a - b);
  observations = indexBy(imported.observations) as Map<string, BalanceObservation[]>;
  flows = indexBy(imported.flows) as Map<string, Flow[]>;
});

withLegacyData('reconciliation', () => {
  it('reproduces every year-end total exactly', () => {
    const drifted: number[] = [];
    for (const year of years) {
      const ours = Money.sum(
        imported.accounts
          .filter((a) => a.kind !== 'benchmark')
          .map((a) => balanceAsOf(observations.get(a.id) ?? [], yearEnd(year)).amount),
      );
      if (!ours.minus(legacyTotals.get(year)!).isZero()) drifted.push(year);
    }
    expect(drifted, 'years that failed to reconcile').toEqual([]);
    expect(years.length).toBeGreaterThan(15);
  });

  it('never records two observations for one account on one date', () => {
    const seen = new Map<string, Set<string>>();
    for (const o of imported.observations) {
      const dates = seen.get(o.accountId) ?? new Set();
      expect(dates.has(o.asOf)).toBe(false);
      dates.add(o.asOf);
      seen.set(o.accountId, dates);
    }
  });
});

withLegacyData('transfer recovery', () => {
  it('accounts for every movement but one', () => {
    // Amount matching plus per-owner grouping resolves all but a single
    // dormant account whose balance left the records without arriving anywhere.
    const warnings = imported.issues.filter((i) => i.severity === 'warning');
    expect(warnings).toHaveLength(1);

    const matched = imported.issues.filter((i) => i.kind === 'matched-transfer');
    expect(matched.length).toBeGreaterThanOrEqual(8);
  });

  it('pairs both halves of every matched transfer', () => {
    const transfers = imported.flows.filter(
      (f) => f.kind === 'transfer_in' || f.kind === 'transfer_out',
    );
    for (const flow of transfers.filter((f) => f.counterpartyAccountId)) {
      const other = transfers.find(
        (f) =>
          f.accountId === flow.counterpartyAccountId && f.counterpartyAccountId === flow.accountId,
      );
      expect(other, `unpaired counterparty on ${flow.id}`).toBeDefined();
      expect(other!.amount.abs().toString()).toBe(flow.amount.abs().toString());
    }
  });
});

withLegacyData('what the migration changes', () => {
  it('shifts a meaningful number of account-years', () => {
    let shifted = 0;
    for (const account of imported.accounts) {
      if (account.kind === 'benchmark') continue;
      for (const year of years) {
        const summary = summarizeYear(
          observations.get(account.id) ?? [],
          flows.get(account.id) ?? [],
          year,
        );
        if (summary.startValue.isZero() || summary.endValue.isZero()) continue;
        if (Math.abs(summary.simpleReturn - summary.twr) >= 0.01) shifted += 1;
      }
    }
    expect(shifted).toBeGreaterThan(20);
  });

  it('leaves returns untouched where no money moved', () => {
    let checked = 0;
    for (const account of imported.accounts) {
      if (account.kind === 'benchmark') continue;
      for (const year of years) {
        const summary = summarizeYear(
          observations.get(account.id) ?? [],
          flows.get(account.id) ?? [],
          year,
        );
        if (!summary.netExternalFlow.isZero() || summary.startValue.isZero()) continue;
        expect(summary.twr).toBeCloseTo(summary.simpleReturn, 9);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});
