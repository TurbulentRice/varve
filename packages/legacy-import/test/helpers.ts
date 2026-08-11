import { Money, type AccountId } from '@varve/core';
import { parseCsvRecords } from '../src/csv.js';
import type { ImportResult, LegacyCsv } from '../src/import.js';

/** Group observations or flows by the account they belong to. */
export function indexBy<T extends { accountId: AccountId }>(
  items: readonly T[],
): Map<AccountId, T[]> {
  const map = new Map<AccountId, T[]>();
  for (const item of items) {
    const list = map.get(item.accountId) ?? [];
    list.push(item);
    map.set(item.accountId, list);
  }
  return map;
}

/**
 * Recompute Access's `qryYearEndTotals` straight from the source CSV: per year,
 * sum the latest reported quarter across every non-benchmark portfolio.
 *
 * Deliberately a second, independent implementation of the legacy rule. If it
 * shared code with the importer it could not catch the importer being wrong.
 */
export function legacyYearEndTotals(
  csv: LegacyCsv,
  imported: ImportResult,
): Map<number, Money> {
  const benchmarks = new Set(
    imported.accounts.filter((a) => a.kind === 'benchmark').map((a) => a.legacyPortfolioId),
  );

  const totals = new Map<number, Money>();
  for (const row of parseCsvRecords(csv.performance)) {
    if (benchmarks.has(Number(row.PortfolioFK))) continue;

    const latest = ['Q4', 'Q3', 'Q2', 'Q1']
      .map((q) => row[q]?.trim())
      .find((v) => v !== undefined && v !== '');
    if (!latest) continue;

    const year = Number(row.YearFK);
    totals.set(year, (totals.get(year) ?? Money.zero()).plus(Money.fromString(latest)));
  }
  return totals;
}
