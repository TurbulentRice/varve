/**
 * The year-by-year roll-up, shared by every level it is asked at.
 *
 * A household and a single account want exactly the same table — value,
 * contributions, fees, what was earned, the return, and how far the legacy
 * method was from it. What differs is only what goes *in*, and one difference in
 * particular is worth stating because it inverts:
 *
 * At household level a transfer between two tracked accounts is not an event —
 * the money never left, so it is netted away. At account level that same
 * transfer is emphatically an event: the money genuinely arrived or departed,
 * and counting it as growth would be the exact error this project exists to
 * correct.
 *
 * Both callers therefore assemble their own flows and hand them here.
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
  type DatedBalance,
  type Flow,
  type IsoDate,
} from '@varve/core';

export interface YearRow {
  readonly year: number;
  readonly startValue: Money;
  readonly endValue: Money;
  /** May precede the year end when the year is still in progress. */
  readonly endValueAsOf: IsoDate;
  /**
   * Whether this year holds a balance of its own.
   *
   * A year with none is a *gap*, not a flat year: the balance shown is the last
   * one before it, carried forward. Reporting a gap as 0% would claim something
   * about a year nobody recorded — and would drag every average that included
   * it toward zero.
   */
  readonly recorded: boolean;
  /** Recorded, but not through the year end — a year still in progress. */
  readonly partial: boolean;
  /**
   * Whether the year can be measured at all — whether the account was seen at
   * least twice across it.
   *
   * A year with a single closing balance and nothing before it says what the
   * account is worth and nothing about what it did. Treating the missing opening
   * as zero is how a first entry of $100,000 comes back as "earned $100,000".
   *
   * Two observations is the right test rather than "was there one before the
   * year": an account opened on 1 January and funded through it *is* measurable,
   * because its starting point was recorded, just inside the year rather than
   * before it.
   */
  readonly measurable: boolean;
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

export interface SeriesInput {
  readonly balances: readonly DatedBalance[];
  /** Flows that cross the boundary of whatever is being summarized. */
  readonly externalFlows: readonly Flow[];
  /** Every flow, including those that are not external — fees, mostly. */
  readonly allFlows: readonly Flow[];
  readonly benchmarkBalances: readonly DatedBalance[];
  readonly notes: ReadonlyMap<number, string>;
}

export interface SeriesSummary {
  readonly years: readonly YearRow[];
  readonly currentValue: Money;
  readonly currentValueAsOf: IsoDate;
  /** Paid in during the tracked period, net of withdrawals. */
  readonly totalContributed: Money;
  readonly totalFees: Money;
  /** Everything earned above what was put in. */
  readonly lifetimeGain: Money;
  /** Geometric mean of the annual time-weighted returns. */
  readonly averageReturn: number;
  readonly averageBenchmark: number | null;
}

export function summarizeSeries(input: SeriesInput): SeriesSummary {
  const { balances, externalFlows, allFlows, notes } = input;

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

      // Before the record begins there is genuinely nothing to say.
      if (summary.startValue.isZero() && summary.endValue.isZero()) continue;

      const recorded = balances.some((b) => b.asOf > range.start && b.asOf <= range.end);
      const measurable =
        balances.filter((b) => b.asOf >= range.start && b.asOf <= range.end).length >= 2;

      years.push({
        year,
        startValue: summary.startValue,
        endValue: summary.endValue,
        endValueAsOf: summary.endValueAsOf,
        recorded,
        partial: recorded && summary.endValueAsOf < range.end,
        measurable,
        contributions: summary.byKind.contribution.plus(summary.byKind.withdrawal),
        fees: summary.byKind.fee.abs(),
        totalGain: summary.totalGain,
        organicGain: summary.organicGain,
        twr: summary.twr,
        legacyReturn: measurable && !summary.startValue.isZero() ? summary.simpleReturn : null,
        benchmark: benchmarkReturn(input.benchmarkBalances, range),
        note: notes.get(year) ?? null,
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

  // A year counts toward the average if it can be measured *and* had capital at
  // risk — it either began with a balance or money was put in.
  //
  // The distinction matters at the start of a record. A ledger that opens with a
  // balance carried in from before tracking began has nothing at risk and no
  // return to speak of, and averaging its 0% in would understate every real year
  // after it. But accounts that genuinely open at zero and are funded through the
  // year *do* earn a return on the money while it is invested, and dropping that
  // year would discard a real one. Only the first case has no contributions.
  const investedYears = years.filter(
    (y) => y.recorded && y.measurable && (!y.startValue.isZero() || !y.contributions.isZero()),
  );
  const benchmarks = investedYears
    .map((y) => y.benchmark)
    .filter((r): r is number => r !== null);

  return {
    years,
    currentValue,
    currentValueAsOf,
    totalContributed: contributed,
    totalFees: Money.sum(allFlows.filter((f) => f.kind === 'fee').map((f) => f.amount)).abs(),
    // Only measurable years can contribute a gain; the rest would be counting an
    // opening balance as something that was earned.
    lifetimeGain: Money.sum(years.filter((y) => y.measurable).map((y) => y.organicGain)),
    averageReturn: geometricMean(investedYears.map((y) => y.twr)),
    averageBenchmark: benchmarks.length > 0 ? geometricMean(benchmarks) : null,
  };
}

function benchmarkReturn(
  balances: readonly DatedBalance[],
  range: { start: IsoDate; end: IsoDate },
): number | null {
  if (balances.length === 0) return null;

  // An index has no flows, so its return is simply how far the level moved.
  const within = balances.filter((b) => b.asOf >= range.start && b.asOf <= range.end);
  return within.length < 2 ? null : timeWeightedReturn(within, []).rate;
}
