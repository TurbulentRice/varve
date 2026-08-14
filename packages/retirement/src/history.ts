/**
 * The year-by-year view of a household's savings.
 *
 * Reproduces what the legacy spreadsheet showed — value, contributions, fees,
 * what was earned — alongside the two figures it could not: a correct
 * time-weighted return, and the gap between that and what it used to report.
 */

import type { Account, Owner } from '@varve/core';
import { householdSeries } from './household.js';
import type { Ledger } from './ledger.js';
import { summarizeSeries, type SeriesSummary } from './series.js';

export type { YearRow } from './series.js';

export interface History extends SeriesSummary {
  readonly householdName: string;
  readonly owners: readonly Owner[];
  readonly accounts: readonly Account[];
  readonly revision: number;
}

/**
 * Derive the household history. Pure: no I/O, no store, no clock.
 *
 * Accepts anything with the shape of a {@link Ledger}, which a `Snapshot` read
 * from disk satisfies directly.
 */
export function deriveHistory(ledger: Ledger): History {
  const series = householdSeries(ledger);

  return {
    householdName: ledger.household.name,
    owners: ledger.owners,
    accounts: ledger.accounts,
    revision: ledger.revision,
    ...summarizeSeries({
      balances: series.balances,
      flows: series.externalFlows,
      allFlows: ledger.flows,
      benchmarkBalances: series.benchmarkBalances,
      notes: new Map(ledger.notes.map((n) => [n.year, n.text])),
    }),
  };
}
