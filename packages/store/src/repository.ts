/**
 * The storage boundary.
 *
 * ## Why this is async when the data fits in memory
 *
 * It does not need to be, today. The in-memory adapter resolves immediately and
 * a JSON file loads in one read. But `async` is the one property that cannot be
 * retrofitted cheaply: once every component, hook, and loader in an application
 * is written against a synchronous API, making it asynchronous later touches all
 * of them. A remote store, an encrypted store, or an IndexedDB store are each
 * unavoidably async, and any of those would otherwise mean rewriting the
 * consumers rather than adding an adapter.
 *
 * Costing a few `await`s now to keep that door open is a good trade.
 *
 * ## Why reads take queries
 *
 * Same reasoning. `observations()` returning everything invites callers to
 * filter in application code, and once they do, a backing store that *could*
 * filter efficiently has no way to be told. Filters exist in the signature from
 * the start so that a future adapter can push them down; the memory adapter
 * simply applies them itself.
 *
 * ## Writes return a revision
 *
 * Every mutation returns the new revision number. Nothing consumes it yet. It is
 * there so optimistic concurrency and delta sync stay possible without changing
 * this interface.
 */

import type {
  Account,
  AccountId,
  BalanceObservation,
  Flow,
  FlowId,
  FlowKind,
  Household,
  IncomeObservation,
  IncomeObservationId,
  IsoDate,
  Loan,
  LoanId,
  LoanObservation,
  LoanObservationId,
  LoanPayment,
  LoanPaymentId,
  Note,
  ObservationId,
  Owner,
} from '@varve/core';
import type { Snapshot } from './snapshot.js';

/** Half-open by convention: `from` inclusive, `to` inclusive. Both optional. */
export interface DateWindow {
  readonly from?: IsoDate;
  readonly to?: IsoDate;
}

export interface ObservationQuery extends DateWindow {
  readonly accountId?: AccountId;
  readonly accountIds?: readonly AccountId[];
}

export interface FlowQuery extends DateWindow {
  readonly accountId?: AccountId;
  readonly accountIds?: readonly AccountId[];
  readonly kinds?: readonly FlowKind[];
}

export interface LoanObservationQuery extends DateWindow {
  readonly loanId?: LoanId;
}

export interface LoanPaymentQuery extends DateWindow {
  readonly loanId?: LoanId;
}

/** A monotonic counter identifying a committed state of the store. */
export type Revision = number;

export interface Repository {
  // ------------------------------------------------------------------ reads
  household(): Promise<Household>;
  owners(): Promise<readonly Owner[]>;
  accounts(): Promise<readonly Account[]>;
  observations(query?: ObservationQuery): Promise<readonly BalanceObservation[]>;
  flows(query?: FlowQuery): Promise<readonly Flow[]>;
  notes(): Promise<readonly Note[]>;
  loans(): Promise<readonly Loan[]>;
  loanObservations(query?: LoanObservationQuery): Promise<readonly LoanObservation[]>;
  loanPayments(query?: LoanPaymentQuery): Promise<readonly LoanPayment[]>;
  incomeObservations(): Promise<readonly IncomeObservation[]>;
  revision(): Promise<Revision>;

  // ----------------------------------------------------------------- writes
  /** Insert or replace by id. Returns the revision after the write. */
  /**
   * Insert or replace owners by id.
   *
   * The odd one out: every other write here appends a dated record, and this
   * overwrites a property. That is the record-versus-property distinction §23.3
   * settled, showing up as two kinds of write rather than two shapes of data
   * (§29.4).
   */
  saveOwners(owners: readonly Owner[]): Promise<Revision>;
  saveAccounts(accounts: readonly Account[]): Promise<Revision>;
  saveObservations(observations: readonly BalanceObservation[]): Promise<Revision>;
  saveFlows(flows: readonly Flow[]): Promise<Revision>;
  saveNotes(notes: readonly Note[]): Promise<Revision>;
  saveLoans(loans: readonly Loan[]): Promise<Revision>;
  saveLoanObservations(observations: readonly LoanObservation[]): Promise<Revision>;
  saveLoanPayments(payments: readonly LoanPayment[]): Promise<Revision>;
  /** What a person earns, as of a date. Upserted by id like everything else. */
  saveIncomeObservations(observations: readonly IncomeObservation[]): Promise<Revision>;

  deleteObservations(ids: readonly ObservationId[]): Promise<Revision>;
  deleteFlows(ids: readonly FlowId[]): Promise<Revision>;
  /** Removes the loan and everything recorded about it — none of it means anything alone. */
  deleteLoans(ids: readonly LoanId[]): Promise<Revision>;
  deleteLoanPayments(ids: readonly LoanPaymentId[]): Promise<Revision>;
  deleteIncomeObservations(ids: readonly IncomeObservationId[]): Promise<Revision>;

  // -------------------------------------------------------------- documents
  /** The whole ledger, ready to serialize. */
  export(): Promise<Snapshot>;
  /** Replace everything. Used by import and by a future sync pulling remote state. */
  replace(snapshot: Snapshot): Promise<Revision>;
}

// ------------------------------------------------------------------ matching

/** Shared filter logic, so every adapter agrees on what a query means. */
export function matchesWindow(date: IsoDate, window: DateWindow): boolean {
  if (window.from && date < window.from) return false;
  if (window.to && date > window.to) return false;
  return true;
}

export function matchesObservation(
  observation: BalanceObservation,
  query: ObservationQuery,
): boolean {
  if (query.accountId && observation.accountId !== query.accountId) return false;
  if (query.accountIds && !query.accountIds.includes(observation.accountId)) return false;
  return matchesWindow(observation.asOf, query);
}

export function matchesFlow(flow: Flow, query: FlowQuery): boolean {
  if (query.accountId && flow.accountId !== query.accountId) return false;
  if (query.accountIds && !query.accountIds.includes(flow.accountId)) return false;
  if (query.kinds && !query.kinds.includes(flow.kind)) return false;
  return matchesWindow(flow.occurredOn, query);
}
