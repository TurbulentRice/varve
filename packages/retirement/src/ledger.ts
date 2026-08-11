/**
 * The working set a derivation runs over.
 *
 * Everything the retirement views need, already in memory. Separating this from
 * the repository is what keeps the rest of the package pure: `loadLedger` is the
 * only function here that performs I/O, and every derivation below it is a plain
 * function of plain data — testable without a store, runnable in a worker, and
 * reusable against data that arrived some other way.
 *
 * A `Snapshot` from `@varve/store` satisfies this shape structurally, so a
 * document read from disk can be derived from directly without conversion.
 */

import type {
  Account,
  BalanceObservation,
  Flow,
  Household,
  Note,
  Owner,
} from '@varve/core';
import type { Repository } from '@varve/store';

export interface Ledger {
  readonly household: Household;
  readonly owners: readonly Owner[];
  readonly accounts: readonly Account[];
  readonly observations: readonly BalanceObservation[];
  readonly flows: readonly Flow[];
  readonly notes: readonly Note[];
  readonly revision: number;
}

/** Read a whole ledger out of a repository. The one I/O boundary. */
export async function loadLedger(repo: Repository): Promise<Ledger> {
  const [household, owners, accounts, observations, flows, notes, revision] = await Promise.all([
    repo.household(),
    repo.owners(),
    repo.accounts(),
    repo.observations(),
    repo.flows(),
    repo.notes(),
    repo.revision(),
  ]);

  return { household, owners, accounts, observations, flows, notes, revision };
}
