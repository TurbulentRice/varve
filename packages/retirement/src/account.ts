/**
 * A single account's history.
 *
 * Where the household view answers "how are we doing?", this answers "which of
 * these is actually working?" — and it is where the migration's correction bites
 * hardest. The household's contributions are small against its balance, so the
 * legacy method was only mildly wrong there. A single account being funded from
 * a low base is the pathological case: the worst year in the source data reads
 * as a 51% loss under the old formula and a 13% loss under a correct one.
 *
 * The one inversion from the household view: **transfers count here**. Money
 * rolled from a 401(k) into an IRA never left the household, but it very much
 * left the 401(k), and treating it as growth in the receiving account is exactly
 * the error the ledger was reshaped to prevent.
 */

import {
  Money,
  type Account,
  type AccountId,
  type BalanceObservation,
  type DatedBalance,
  type Owner,
} from '@varve/core';
import type { Ledger } from './ledger.js';
import { summarizeSeries, type SeriesSummary } from './series.js';

export interface AccountHistory extends SeriesSummary {
  readonly account: Account;
  readonly owners: readonly Owner[];
  /** First and last year with a balance of its own. */
  readonly firstYear: number | null;
  readonly lastYear: number | null;
  /**
   * Closed, in the sense that matters: it holds nothing now.
   *
   * Read from the balance rather than the `active` flag, because a flag is a
   * claim and a zero balance is a fact — and the importer writes a closing zero
   * precisely so a departed account stops answering.
   */
  readonly closed: boolean;
  /** This account's share of the household today, 0–1. */
  readonly shareOfHousehold: number;
}

export function deriveAccountHistory(
  ledger: Ledger,
  id: AccountId,
  householdValue?: Money,
): AccountHistory {
  const account = ledger.accounts.find((a) => a.id === id);
  if (!account) throw new RangeError(`No such account: ${id}`);

  const balances: BalanceObservation[] = ledger.observations
    .filter((o) => o.accountId === id)
    .slice()
    .sort((a, b) => (a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : 0));

  const flows = ledger.flows.filter((f) => f.accountId === id);

  const benchmark = ledger.accounts.find((a) => a.kind === 'benchmark');
  const benchmarkBalances: DatedBalance[] = benchmark
    ? ledger.observations.filter((o) => o.accountId === benchmark.id)
    : [];

  const summary = summarizeSeries({
    balances,
    // Every flow crossing this account's boundary is external to it, transfers
    // included. Nothing is netted away at this level.
    externalFlows: flows.filter((f) => f.kind !== 'fee' && f.kind !== 'dividend'),
    allFlows: flows,
    benchmarkBalances,
    notes: new Map(),
  });

  const recorded = summary.years.filter((y) => y.recorded);
  const total = householdValue?.toNumber() ?? 0;

  return {
    ...summary,
    account,
    owners: ledger.owners.filter((o) => account.ownerIds.includes(o.id)),
    firstYear: recorded[0]?.year ?? null,
    lastYear: recorded[recorded.length - 1]?.year ?? null,
    closed: summary.currentValue.isZero(),
    shareOfHousehold: total > 0 ? summary.currentValue.toNumber() / total : 0,
  };
}

/**
 * Every account that holds money, largest first.
 *
 * The benchmark is left out: it is an index carried as an account so the return
 * calculations have one code path, not something anyone owns.
 */
export function deriveAccountHistories(ledger: Ledger, householdValue: Money): AccountHistory[] {
  return ledger.accounts
    .filter((a) => a.kind !== 'benchmark')
    .map((a) => deriveAccountHistory(ledger, a.id, householdValue))
    .sort((a, b) => {
      // Open accounts first, then by size. A closed account is history; it
      // should not sit above something that still holds money.
      if (a.closed !== b.closed) return a.closed ? 1 : -1;
      return b.currentValue.compare(a.currentValue);
    });
}
