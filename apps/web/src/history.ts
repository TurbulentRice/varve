/**
 * Deriving the household view from a repository.
 *
 * This is the layer that will eventually become `packages/retirement` — it is
 * here for now because writing it against a real UI is how we find out what the
 * shape should be. Everything below is pure derivation over the store; nothing
 * is persisted.
 */

import {
  Money,
  aggregateBalances,
  balanceAsOf,
  calendarYearRange,
  externalFlowsForGroup,
  geometricMean,
  summarizePeriod,
  timeWeightedReturn,
  yearEnd,
  yearOf,
  type Account,
  type AccountId,
  type BalanceObservation,
  type DatedBalance,
  type Flow,
  type IsoDate,
  type Note,
  type Owner,
} from '@varve/core';
import type { Repository } from '@varve/store';

export interface YearRow {
  readonly year: number;
  readonly endValue: Money;
  /** May precede the year end when the year is still in progress. */
  readonly endValueAsOf: IsoDate;
  readonly partial: boolean;
  readonly contributions: Money;
  readonly fees: Money;
  readonly totalGain: Money;
  readonly organicGain: Money;
  /** Chain-linked time-weighted return. */
  readonly twr: number;
  /**
   * What the legacy spreadsheet would have reported, or `null` where it has no
   * answer — it divides by the starting balance, so a year an account opened
   * from zero is undefined rather than 0%.
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
  readonly totalContributed: Money;
  readonly totalFees: Money;
  readonly lifetimeGain: Money;
  /** Geometric mean of the annual time-weighted returns. */
  readonly averageReturn: number;
  readonly averageBenchmark: number | null;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(key(item)) ?? [];
    list.push(item);
    map.set(key(item), list);
  }
  return map;
}

export async function buildHistory(repo: Repository): Promise<History> {
  const [household, owners, accounts, observations, flows, notes, revision] = await Promise.all([
    repo.household(),
    repo.owners(),
    repo.accounts(),
    repo.observations(),
    repo.flows(),
    repo.notes(),
    repo.revision(),
  ]);

  const tracked = accounts.filter((a) => a.kind !== 'benchmark');
  const benchmark = accounts.find((a) => a.kind === 'benchmark');
  const trackedIds = new Set<AccountId>(tracked.map((a) => a.id));

  const observationsByAccount = groupBy(observations, (o) => o.accountId);

  // The household's balance series: every account summed at every date any of
  // them was observed. Closed accounts contribute zero because the importer
  // records a closing zero — without it they would answer forever.
  const householdBalances = aggregateBalances(
    new Map(
      tracked.map((a) => [a.id, (observationsByAccount.get(a.id) ?? []) as BalanceObservation[]]),
    ),
  );

  // Transfers between two tracked accounts are not household events. Dropping
  // them is what keeps a rollover from reading as a contribution, and what lets
  // a year in which every account was replaced still report an honest return.
  const householdFlows = externalFlowsForGroup(
    flows.filter((f) => trackedIds.has(f.accountId)),
    trackedIds,
  );

  const benchmarkBalances: DatedBalance[] = benchmark
    ? (observationsByAccount.get(benchmark.id) ?? [])
    : [];

  const noteByYear = new Map(notes.map((n: Note) => [n.year, n.text]));

  const observedYears = householdBalances.map((b) => yearOf(b.asOf));
  const firstYear = Math.min(...observedYears);
  const lastYear = Math.max(...observedYears);

  const years: YearRow[] = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    const range = calendarYearRange(year);
    const summary = summarizePeriod(householdBalances, householdFlows, range);

    // Nothing observed in this year at all — skip rather than render a row of
    // zeroes that looks like a year of no growth.
    if (summary.startValue.isZero() && summary.endValue.isZero()) continue;

    const benchmarkReturn = benchmark
      ? timeWeightedReturn(
          benchmarkBalances.filter((b) => b.asOf >= range.start && b.asOf <= range.end),
          [],
        ).rate
      : null;

    years.push({
      year,
      endValue: summary.endValue,
      endValueAsOf: summary.endValueAsOf,
      partial: summary.endValueAsOf < range.end,
      contributions: summary.byKind.contribution.plus(summary.byKind.withdrawal),
      fees: summary.byKind.fee.abs(),
      totalGain: summary.totalGain,
      organicGain: summary.organicGain,
      twr: summary.twr,
      legacyReturn: summary.startValue.isZero() ? null : summary.simpleReturn,
      benchmark: benchmarkReturn,
      note: noteByYear.get(year) ?? null,
    });
  }

  const latest = balanceAsOf(householdBalances, yearEnd(lastYear));
  const contributionFlows = householdFlows.filter(
    (f: Flow) => f.kind === 'contribution' || f.kind === 'withdrawal',
  );

  const benchmarkYears = years.map((y) => y.benchmark).filter((r): r is number => r !== null);

  return {
    householdName: household.name,
    owners,
    accounts,
    revision,
    years,
    currentValue: latest.amount,
    currentValueAsOf: latest.asOf,
    totalContributed: Money.sum(contributionFlows.map((f) => f.amount)),
    totalFees: Money.sum(flows.filter((f) => f.kind === 'fee').map((f) => f.amount)).abs(),
    lifetimeGain: Money.sum(years.map((y) => y.organicGain)),
    averageReturn: geometricMean(years.map((y) => y.twr)),
    averageBenchmark: benchmarkYears.length > 0 ? geometricMean(benchmarkYears) : null,
  };
}
