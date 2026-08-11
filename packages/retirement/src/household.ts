/**
 * Collapsing a household's accounts into one series.
 *
 * The step every household-level number depends on, extracted because it is
 * subtle in two specific ways and both are easy to get quietly wrong.
 */

import {
  aggregateBalances,
  externalFlowsForGroup,
  type Account,
  type AccountId,
  type BalanceObservation,
  type DatedBalance,
  type Flow,
} from '@varve/core';
import type { Ledger } from './ledger.js';

export interface HouseholdSeries {
  /** Real accounts — everything except a benchmark. */
  readonly tracked: readonly Account[];
  /** The market index carried as an account, if one is tracked. */
  readonly benchmark: Account | undefined;
  /** Every tracked account's balance, summed at every observed date. */
  readonly balances: readonly DatedBalance[];
  /** Flows that genuinely cross the household boundary. */
  readonly externalFlows: readonly Flow[];
  /** The benchmark's own series, for comparison. */
  readonly benchmarkBalances: readonly DatedBalance[];
  readonly observationsByAccount: ReadonlyMap<AccountId, readonly BalanceObservation[]>;
}

export function householdSeries(ledger: Ledger): HouseholdSeries {
  const tracked = ledger.accounts.filter((a) => a.kind !== 'benchmark');
  const benchmark = ledger.accounts.find((a) => a.kind === 'benchmark');
  const trackedIds = new Set<AccountId>(tracked.map((a) => a.id));

  const observationsByAccount = new Map<AccountId, BalanceObservation[]>();
  for (const observation of ledger.observations) {
    const list = observationsByAccount.get(observation.accountId) ?? [];
    list.push(observation);
    observationsByAccount.set(observation.accountId, list);
  }

  // Summed at every date any member was observed, so the combined series keeps
  // the finest granularity available. A closed account contributes zero because
  // the importer writes a closing zero observation — without one, its last
  // known balance would keep answering forever and every later total would
  // double-count a dead account.
  const balances = aggregateBalances(
    new Map(tracked.map((a) => [a.id, observationsByAccount.get(a.id) ?? []])),
  );

  // A transfer between two tracked accounts is not a household event: the money
  // never left. Netting those away is what stops a rollover reading as a
  // contribution, and what lets a year in which every account was replaced still
  // report an honest return.
  const externalFlows = externalFlowsForGroup(
    ledger.flows.filter((f) => trackedIds.has(f.accountId)),
    trackedIds,
  );

  return {
    tracked,
    benchmark,
    balances,
    externalFlows,
    benchmarkBalances: benchmark ? (observationsByAccount.get(benchmark.id) ?? []) : [],
    observationsByAccount,
  };
}
