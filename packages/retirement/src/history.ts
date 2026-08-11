/**
 * The year-by-year view of a household's savings.
 *
 * Reproduces what the legacy spreadsheet showed — value, contributions, fees,
 * what was earned — alongside the two figures it could not: a correct
 * time-weighted return, and the gap between that and what it used to report.
 */

import {
  Money,
  balanceAsOf,
  calendarYearRange,
  geometricMean,
  summarizePeriod,
  timeWeightedReturn,
  yearEnd,
  yearOf,
  type Account,
  type IsoDate,
  type Owner,
} from '@varve/core';
import { householdSeries } from './household.js';
import type { Ledger } from './ledger.js';

export interface YearRow {
  readonly year: number;
  readonly startValue: Money;
  readonly endValue: Money;
  /** May precede the year end when the year is still in progress. */
  readonly endValueAsOf: IsoDate;
  readonly partial: boolean;
  readonly contributions: Money;
  readonly fees: Money;
  /** Change in balance including contributions. Progress, not performance. */
  readonly totalGain: Money;
  /** Change in balance excluding external flows. The benchmarkable one. */
  readonly organicGain: Money;
  /** Chain-linked time-weighted return. */
  readonly twr: number;
  /**
   * What the legacy spreadsheet would have reported, or `null` where it has no
   * answer — it divides by the starting balance, so a year that began at zero is
   * undefined rather than 0%.
   */
  readonly legacyReturn: number | null;
  /** Benchmark return over the same year, when a benchmark is tracked. */
  readonly benchmark: number | null;
  readonly note: string | null;
}

export interface History {
  readonly householdName: string;
  readonly owners: readonly Owner[];
  readonly accounts: readonly Account[];
  readonly revision: number;

  readonly years: readonly YearRow[];
  readonly currentValue: Money;
  readonly currentValueAsOf: IsoDate;
  /** Contributed during the tracked period, net of withdrawals. */
  readonly totalContributed: Money;
  readonly totalFees: Money;
  /** Everything earned above what was put in. */
  readonly lifetimeGain: Money;
  /** Geometric mean of the annual time-weighted returns. */
  readonly averageReturn: number;
  readonly averageBenchmark: number | null;
}

/**
 * Derive the household history. Pure: no I/O, no store, no clock.
 *
 * Accepts anything with the shape of a {@link Ledger}, which a `Snapshot` read
 * from disk satisfies directly.
 */
export function deriveHistory(ledger: Ledger): History {
  const series = householdSeries(ledger);
  const { balances, externalFlows } = series;

  const noteByYear = new Map(ledger.notes.map((n) => [n.year, n.text]));

  const years: YearRow[] = [];
  let currentValue = Money.zero();
  let currentValueAsOf = '1970-01-01' as IsoDate;

  if (balances.length > 0) {
    const observed = balances.map((b) => yearOf(b.asOf));
    const firstYear = Math.min(...observed);
    const lastYear = Math.max(...observed);

    for (let year = firstYear; year <= lastYear; year += 1) {
      const range = calendarYearRange(year);
      const summary = summarizePeriod(balances, externalFlows, range);

      // Nothing observed in this year at all. Skipping beats rendering a row of
      // zeroes that reads as a year of no growth.
      if (summary.startValue.isZero() && summary.endValue.isZero()) continue;

      years.push({
        year,
        startValue: summary.startValue,
        endValue: summary.endValue,
        endValueAsOf: summary.endValueAsOf,
        partial: summary.endValueAsOf < range.end,
        contributions: summary.byKind.contribution.plus(summary.byKind.withdrawal),
        fees: summary.byKind.fee.abs(),
        totalGain: summary.totalGain,
        organicGain: summary.organicGain,
        twr: summary.twr,
        legacyReturn: summary.startValue.isZero() ? null : summary.simpleReturn,
        benchmark: benchmarkReturn(series, range),
        note: noteByYear.get(year) ?? null,
      });
    }

    const latest = balanceAsOf(balances, yearEnd(lastYear));
    currentValue = latest.amount;
    currentValueAsOf = latest.asOf;
  }

  // Money that arrived from outside the tracked period — an opening balance
  // carried in before records began — is a transfer, not a contribution, and is
  // excluded here. It was never earned and never saved during these years.
  const contributed = Money.sum(
    externalFlows
      .filter((f) => f.kind === 'contribution' || f.kind === 'withdrawal')
      .map((f) => f.amount),
  );

  // A year counts toward the average if it had capital at risk: it either began
  // with a balance, or money was put in during it.
  //
  // The distinction matters at the start of a record. A ledger that opens with a
  // balance carried in from before tracking began has nothing at risk and no
  // return to speak of, and averaging its 0% in would understate every real year
  // after it. But accounts that genuinely open at zero and are funded through the
  // year *do* earn a return on the money while it is invested, and dropping that
  // year would discard a real one. Only the first case has no contributions.
  const investedYears = years.filter(
    (y) => !y.startValue.isZero() || !y.contributions.isZero(),
  );
  const benchmarks = investedYears
    .map((y) => y.benchmark)
    .filter((r): r is number => r !== null);

  return {
    householdName: ledger.household.name,
    owners: ledger.owners,
    accounts: ledger.accounts,
    revision: ledger.revision,
    years,
    currentValue,
    currentValueAsOf,
    totalContributed: contributed,
    totalFees: Money.sum(ledger.flows.filter((f) => f.kind === 'fee').map((f) => f.amount)).abs(),
    lifetimeGain: Money.sum(years.map((y) => y.organicGain)),
    averageReturn: geometricMean(investedYears.map((y) => y.twr)),
    averageBenchmark: benchmarks.length > 0 ? geometricMean(benchmarks) : null,
  };
}

function benchmarkReturn(
  series: ReturnType<typeof householdSeries>,
  range: { start: IsoDate; end: IsoDate },
): number | null {
  if (!series.benchmark) return null;

  // An index has no flows, so its return is simply how far the level moved.
  const within = series.benchmarkBalances.filter(
    (b) => b.asOf >= range.start && b.asOf <= range.end,
  );
  return within.length < 2 ? null : timeWeightedReturn(within, []).rate;
}
