/**
 * In-memory repository.
 *
 * The whole ledger held as arrays. Sufficient for a household — twenty years of
 * quarterly data is a few hundred records — and it is the adapter the UI runs
 * against, with a JSON document as the thing that outlives the process.
 *
 * Everything is stored sorted by date, because every consumer wants it that way
 * and sorting once on write beats sorting on every read.
 */

import { compareDates, type Account, type BalanceObservation, type Flow, type FlowId, type Household, type Loan, type LoanId, type LoanObservation, type LoanPayment, type LoanPaymentId, type Note, type ObservationId, type Owner } from '@varve/core';
import {
  matchesFlow,
  matchesObservation,
  type FlowQuery,
  matchesWindow,
  type LoanObservationQuery,
  type LoanPaymentQuery,
  type ObservationQuery,
  type Repository,
  type Revision,
} from './repository.js';
import { SNAPSHOT_SCHEMA_VERSION, type Snapshot } from './snapshot.js';

export class InMemoryRepository implements Repository {
  #household: Household;
  #owners: Owner[];
  #accounts: Account[];
  #observations: BalanceObservation[];
  #flows: Flow[];
  #notes: Note[];
  #loans: Loan[];
  #loanObservations: LoanObservation[];
  #loanPayments: LoanPayment[];
  #revision: Revision;

  constructor(snapshot: Snapshot) {
    this.#household = snapshot.household;
    this.#owners = [...snapshot.owners];
    this.#accounts = [...snapshot.accounts];
    this.#observations = sortByDate([...snapshot.observations], (o) => o.asOf);
    this.#flows = sortByDate([...snapshot.flows], (f) => f.occurredOn);
    this.#notes = [...snapshot.notes];
    this.#loans = [...snapshot.loans];
    this.#loanObservations = sortByDate([...snapshot.loanObservations], (o) => o.asOf);
    this.#loanPayments = sortByDate([...snapshot.loanPayments], (p) => p.paidOn);
    this.#revision = snapshot.revision;
  }

  // ------------------------------------------------------------------ reads

  async household(): Promise<Household> {
    return this.#household;
  }

  async owners(): Promise<readonly Owner[]> {
    return this.#owners;
  }

  async accounts(): Promise<readonly Account[]> {
    return this.#accounts;
  }

  async observations(query: ObservationQuery = {}): Promise<readonly BalanceObservation[]> {
    return this.#observations.filter((o) => matchesObservation(o, query));
  }

  async flows(query: FlowQuery = {}): Promise<readonly Flow[]> {
    return this.#flows.filter((f) => matchesFlow(f, query));
  }

  async notes(): Promise<readonly Note[]> {
    return this.#notes;
  }

  async revision(): Promise<Revision> {
    return this.#revision;
  }

  // ----------------------------------------------------------------- writes

  async saveAccounts(accounts: readonly Account[]): Promise<Revision> {
    this.#accounts = upsert(this.#accounts, accounts);
    return ++this.#revision;
  }

  async saveObservations(observations: readonly BalanceObservation[]): Promise<Revision> {
    this.#observations = sortByDate(upsert(this.#observations, observations), (o) => o.asOf);
    return ++this.#revision;
  }

  async saveFlows(flows: readonly Flow[]): Promise<Revision> {
    this.#flows = sortByDate(upsert(this.#flows, flows), (f) => f.occurredOn);
    return ++this.#revision;
  }

  async saveNotes(notes: readonly Note[]): Promise<Revision> {
    this.#notes = upsert(this.#notes, notes);
    return ++this.#revision;
  }

  async deleteObservations(ids: readonly ObservationId[]): Promise<Revision> {
    const doomed = new Set<string>(ids);
    this.#observations = this.#observations.filter((o) => !doomed.has(o.id));
    return ++this.#revision;
  }

  async loans(): Promise<readonly Loan[]> {
    return this.#loans;
  }

  async loanObservations(query: LoanObservationQuery = {}): Promise<readonly LoanObservation[]> {
    return this.#loanObservations.filter(
      (o) =>
        (query.loanId === undefined || o.loanId === query.loanId) &&
        matchesWindow(o.asOf, query),
    );
  }

  async loanPayments(query: LoanPaymentQuery = {}): Promise<readonly LoanPayment[]> {
    return this.#loanPayments.filter(
      (p) =>
        (query.loanId === undefined || p.loanId === query.loanId) && matchesWindow(p.paidOn, query),
    );
  }

  async saveLoanPayments(payments: readonly LoanPayment[]): Promise<Revision> {
    this.#loanPayments = sortByDate(upsert(this.#loanPayments, payments), (p) => p.paidOn);
    return ++this.#revision;
  }

  async deleteLoanPayments(ids: readonly LoanPaymentId[]): Promise<Revision> {
    const doomed = new Set<string>(ids);
    this.#loanPayments = this.#loanPayments.filter((p) => !doomed.has(p.id));
    return ++this.#revision;
  }

  async saveLoans(loans: readonly Loan[]): Promise<Revision> {
    this.#loans = upsert(this.#loans, loans);
    return ++this.#revision;
  }

  async saveLoanObservations(observations: readonly LoanObservation[]): Promise<Revision> {
    this.#loanObservations = sortByDate(upsert(this.#loanObservations, observations), (o) => o.asOf);
    return ++this.#revision;
  }

  async deleteLoans(ids: readonly LoanId[]): Promise<Revision> {
    const doomed = new Set<string>(ids);
    this.#loans = this.#loans.filter((l) => !doomed.has(l.id));
    // A loan's observations are meaningless without it, and leaving them makes
    // the document grow every time one is removed and re-added.
    this.#loanObservations = this.#loanObservations.filter((o) => !doomed.has(o.loanId));
    this.#loanPayments = this.#loanPayments.filter((p) => !doomed.has(p.loanId));
    return ++this.#revision;
  }

  async deleteFlows(ids: readonly FlowId[]): Promise<Revision> {
    const doomed = new Set<string>(ids);
    this.#flows = this.#flows.filter((f) => !doomed.has(f.id));
    return ++this.#revision;
  }

  // -------------------------------------------------------------- documents

  async export(): Promise<Snapshot> {
    return {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      revision: this.#revision,
      exportedAt: new Date().toISOString(),
      household: this.#household,
      owners: this.#owners,
      accounts: this.#accounts,
      observations: this.#observations,
      flows: this.#flows,
      notes: this.#notes,
      loans: this.#loans,
      loanObservations: this.#loanObservations,
      loanPayments: this.#loanPayments,
    };
  }

  async replace(snapshot: Snapshot): Promise<Revision> {
    this.#household = snapshot.household;
    this.#owners = [...snapshot.owners];
    this.#accounts = [...snapshot.accounts];
    this.#observations = sortByDate([...snapshot.observations], (o) => o.asOf);
    this.#flows = sortByDate([...snapshot.flows], (f) => f.occurredOn);
    this.#notes = [...snapshot.notes];
    this.#loans = [...snapshot.loans];
    this.#loanObservations = sortByDate([...snapshot.loanObservations], (o) => o.asOf);
    this.#loans = [...snapshot.loans];
    this.#loanObservations = sortByDate([...snapshot.loanObservations], (o) => o.asOf);
    this.#loanPayments = sortByDate([...snapshot.loanPayments], (p) => p.paidOn);
    this.#loanPayments = sortByDate([...snapshot.loanPayments], (p) => p.paidOn);
    this.#revision = snapshot.revision;
    return this.#revision;
  }
}

/** Insert or replace by `id`, preserving the order of existing entries. */
function upsert<T extends { id: string }>(existing: readonly T[], incoming: readonly T[]): T[] {
  if (incoming.length === 0) return [...existing];

  const byId = new Map(incoming.map((item) => [item.id, item]));
  const merged = existing.map((item) => byId.get(item.id) ?? item);
  for (const item of existing) byId.delete(item.id);
  return [...merged, ...byId.values()];
}

function sortByDate<T>(items: T[], dateOf: (item: T) => string): T[] {
  return items.sort((a, b) => compareDates(dateOf(a) as never, dateOf(b) as never));
}
