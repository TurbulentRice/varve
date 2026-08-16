/**
 * Making a ledger outlive the process.
 *
 * Deliberately a port rather than a concrete store. `SnapshotStore` is two
 * methods — read the document, write the document — which is the entire surface
 * a browser's local storage, a file on disk, and an HTTP endpoint holding a
 * `jsonb` column all share. Writing the app against the port means adding sync
 * later is a new implementation rather than a change to anything that already
 * works.
 *
 * `PersistingRepository` decorates any repository and writes after each
 * mutation, so nothing above it has to remember to save. That is the property
 * worth having: a "save" someone can forget to call is a data-loss bug waiting
 * for a distraction.
 */

import type { Repository, Revision } from './repository.js';
import { decodeSnapshot, encodeSnapshot, type Snapshot } from './snapshot.js';

export interface SnapshotStore {
  /** The stored document, or `null` if nothing has been written yet. */
  load(): Promise<Snapshot | null>;
  save(snapshot: Snapshot): Promise<void>;
  /** Forget everything. */
  clear(): Promise<void>;
}

/**
 * A store backed by the browser's `localStorage`.
 *
 * Synchronous underneath and small — a household's whole history is well inside
 * the few megabytes browsers allow. It is also the least durable option
 * available: clearing site data erases it. Export is the real backup, which is
 * why the document format is the same thing either way.
 */
export function localSnapshotStore(key = 'varve.ledger'): SnapshotStore {
  const storage = () => {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      // Blocked by privacy settings, or running somewhere without a DOM.
      return null;
    }
  };

  return {
    async load() {
      const text = storage()?.getItem(key);
      return text ? decodeSnapshot(text) : null;
    },
    async save(snapshot) {
      storage()?.setItem(key, encodeSnapshot(snapshot, false));
    },
    async clear() {
      storage()?.removeItem(key);
    },
  };
}

/** Keeps everything, remembers nothing. Useful in tests and previews. */
export function memorySnapshotStore(initial: Snapshot | null = null): SnapshotStore {
  let held = initial;
  return {
    async load() {
      return held;
    },
    async save(snapshot) {
      held = snapshot;
    },
    async clear() {
      held = null;
    },
  };
}

/**
 * A repository that writes itself down after every change.
 *
 * Reads pass straight through. Writes hit the inner repository first and are
 * persisted only if that succeeds, so a rejected write never reaches storage.
 */
export class PersistingRepository implements Repository {
  readonly #inner: Repository;
  readonly #store: SnapshotStore;

  constructor(inner: Repository, store: SnapshotStore) {
    this.#inner = inner;
    this.#store = store;
  }

  // ------------------------------------------------------------------ reads

  household: Repository['household'] = () => this.#inner.household();
  owners: Repository['owners'] = () => this.#inner.owners();
  accounts: Repository['accounts'] = () => this.#inner.accounts();
  observations: Repository['observations'] = (query) => this.#inner.observations(query);
  flows: Repository['flows'] = (query) => this.#inner.flows(query);
  notes: Repository['notes'] = () => this.#inner.notes();
  loans: Repository['loans'] = () => this.#inner.loans();
  loanObservations: Repository['loanObservations'] = (query) => this.#inner.loanObservations(query);
  loanPayments: Repository['loanPayments'] = (query) => this.#inner.loanPayments(query);
  incomeObservations: Repository['incomeObservations'] = () => this.#inner.incomeObservations();
  revision: Repository['revision'] = () => this.#inner.revision();
  export: Repository['export'] = () => this.#inner.export();

  // ----------------------------------------------------------------- writes

  async #persist(revision: Revision): Promise<Revision> {
    await this.#store.save(await this.#inner.export());
    return revision;
  }

  async saveAccounts(...args: Parameters<Repository['saveAccounts']>) {
    return this.#persist(await this.#inner.saveAccounts(...args));
  }

  async saveOwners(...args: Parameters<Repository['saveOwners']>) {
    return this.#persist(await this.#inner.saveOwners(...args));
  }

  async saveObservations(...args: Parameters<Repository['saveObservations']>) {
    return this.#persist(await this.#inner.saveObservations(...args));
  }

  async saveFlows(...args: Parameters<Repository['saveFlows']>) {
    return this.#persist(await this.#inner.saveFlows(...args));
  }

  async saveNotes(...args: Parameters<Repository['saveNotes']>) {
    return this.#persist(await this.#inner.saveNotes(...args));
  }

  async saveLoans(...args: Parameters<Repository['saveLoans']>) {
    return this.#persist(await this.#inner.saveLoans(...args));
  }

  async saveLoanObservations(...args: Parameters<Repository['saveLoanObservations']>) {
    return this.#persist(await this.#inner.saveLoanObservations(...args));
  }

  async saveLoanPayments(...args: Parameters<Repository['saveLoanPayments']>) {
    return this.#persist(await this.#inner.saveLoanPayments(...args));
  }

  async saveIncomeObservations(...args: Parameters<Repository['saveIncomeObservations']>) {
    return this.#persist(await this.#inner.saveIncomeObservations(...args));
  }

  async deleteIncomeObservations(...args: Parameters<Repository['deleteIncomeObservations']>) {
    return this.#persist(await this.#inner.deleteIncomeObservations(...args));
  }

  async deleteLoanPayments(...args: Parameters<Repository['deleteLoanPayments']>) {
    return this.#persist(await this.#inner.deleteLoanPayments(...args));
  }

  async deleteLoans(...args: Parameters<Repository['deleteLoans']>) {
    return this.#persist(await this.#inner.deleteLoans(...args));
  }

  async deleteObservations(...args: Parameters<Repository['deleteObservations']>) {
    return this.#persist(await this.#inner.deleteObservations(...args));
  }

  async deleteFlows(...args: Parameters<Repository['deleteFlows']>) {
    return this.#persist(await this.#inner.deleteFlows(...args));
  }

  async replace(...args: Parameters<Repository['replace']>) {
    return this.#persist(await this.#inner.replace(...args));
  }
}
