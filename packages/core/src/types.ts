/**
 * The domain model: observations and flows.
 *
 * The legacy Access schema stored one wide row per (portfolio, year) with the
 * four quarters pivoted into columns. That shape makes granularity part of the
 * schema, hard-blocks daily data from an institution API, and — because it
 * carries an opening balance alongside a closing one — leaves no way to
 * distinguish *money that moved* from *money that grew*. Four rollovers in the
 * source data are silently absorbed into opening balances as a result.
 *
 * Here, an account has two append-only streams:
 *
 *   - {@link BalanceObservation} — "it was worth X on this date"
 *   - {@link Flow}               — "X crossed the boundary on this date"
 *
 * Everything else (returns, gains, totals, rolling averages) is derived. A
 * rollover becomes a matched `transfer_out`/`transfer_in` pair, opening balance
 * is just the previous closing observation, and quarterly hand entry and daily
 * API sync are the same shape at different densities.
 */

import type { Money } from './money.js';
import type { IsoDate } from './time.js';

declare const IdBrand: unique symbol;
type Id<Kind extends string> = string & { readonly [IdBrand]: Kind };

export type HouseholdId = Id<'Household'>;
export type OwnerId = Id<'Owner'>;
export type AccountId = Id<'Account'>;
export type ObservationId = Id<'Observation'>;
export type FlowId = Id<'Flow'>;
export type NoteId = Id<'Note'>;
export type LoanId = Id<'Loan'>;
export type LoanObservationId = Id<'LoanObservation'>;
export type LoanPaymentId = Id<'LoanPayment'>;

export const householdId = (v: string) => v as HouseholdId;
export const ownerId = (v: string) => v as OwnerId;
export const accountId = (v: string) => v as AccountId;
export const observationId = (v: string) => v as ObservationId;
export const flowId = (v: string) => v as FlowId;
export const noteId = (v: string) => v as NoteId;
export const loanId = (v: string) => v as LoanId;
export const loanObservationId = (v: string) => v as LoanObservationId;
export const loanPaymentId = (v: string) => v as LoanPaymentId;

// ------------------------------------------------------------------ entities

/**
 * The unit of sharing. Present from the start because retrofitting a tenant
 * boundary onto a schema that never had one is a rewrite, whereas carrying an
 * unused field is free.
 */
export interface Household {
  readonly id: HouseholdId;
  readonly name: string;
}

export interface Owner {
  readonly id: OwnerId;
  readonly householdId: HouseholdId;
  readonly name: string;
  /** Drives age-based milestones (early Social Security at 62, Medicare at 65). */
  readonly birthYear?: number;
}

export type AccountKind =
  | 'retirement'
  | 'brokerage'
  | 'savings'
  | 'college'
  /**
   * A market index carried as an account, with index levels standing in for
   * balances and no flows.
   *
   * Inherited from the legacy design and worth keeping: benchmark and portfolio
   * returns then run through one code path, on one time axis, with no special
   * casing anywhere downstream.
   */
  | 'benchmark';

export interface Account {
  readonly id: AccountId;
  readonly householdId: HouseholdId;
  readonly name: string;
  /**
   * Owners of this account. One owner is an individual account; several is a
   * joint one. (The legacy data modelled "JOINT" as a pseudo-person, which
   * works but cannot express a joint account's relationship to each real
   * owner's totals.)
   */
  readonly ownerIds: readonly OwnerId[];
  readonly kind: AccountKind;
  readonly active: boolean;
  readonly institution?: string;
  /** Provenance from the Access import, for traceability. */
  readonly legacyPortfolioId?: number;
}

// -------------------------------------------------------------- observations

export type ObservationSource = 'manual' | 'statement' | 'api' | 'legacy-import';

/** "This account was worth this much on this date." */
export interface BalanceObservation {
  readonly id: ObservationId;
  readonly accountId: AccountId;
  readonly asOf: IsoDate;
  readonly amount: Money;
  readonly source: ObservationSource;
}

// --------------------------------------------------------------------- flows

export type FlowKind =
  | 'contribution'
  | 'withdrawal'
  | 'fee'
  | 'dividend'
  | 'transfer_in'
  | 'transfer_out';

/**
 * Money crossing (or moving within) an account on a date.
 *
 * `amount` is signed from the account's point of view: positive adds to the
 * balance, negative subtracts. Contributions and transfers in are positive;
 * withdrawals, fees, and transfers out are negative.
 */
export interface Flow {
  readonly id: FlowId;
  readonly accountId: AccountId;
  readonly occurredOn: IsoDate;
  readonly amount: Money;
  readonly kind: FlowKind;
  /** The other side of a transfer. Set on both halves of the pair. */
  readonly counterpartyAccountId?: AccountId;
  readonly note?: string;
}

// --------------------------------------------------------------------- notes

/**
 * A remark attached to a year of the household's history.
 *
 * The legacy database kept a free-text memo per year, and it turned out to hold
 * real commentary going back to 2007 — quarter-by-quarter observations someone
 * wrote at the time. That is worth more than it looks: numbers record what
 * happened, notes record what the person thought was happening. Carried into
 * the domain rather than left behind in the importer.
 */
export interface Note {
  readonly id: NoteId;
  readonly householdId: HouseholdId;
  /** Calendar year the note describes. */
  readonly year: number;
  readonly text: string;
}

/**
 * How fees are treated when measuring return.
 *
 * `net` (the default) leaves fees inside the return, answering "what did this
 * account actually earn me?". `gross` treats them as external outflows and adds
 * them back, answering "what would it have earned without costs?".
 *
 * The difference between the two *is* the fee drag — which is why this is a
 * parameter rather than two separate calculations.
 */
export type FeeTreatment = 'net' | 'gross';

/**
 * Whether a flow crosses the account boundary, and so must be neutralized when
 * measuring return.
 *
 * Contributions, withdrawals, and transfers are external: they change the
 * balance without the account having earned anything. Reinvested dividends are
 * internal — that *is* the earning. (A dividend paid out to a bank account is a
 * `withdrawal`, not a `dividend`.)
 */
export function isExternalFlow(kind: FlowKind, feeTreatment: FeeTreatment = 'net'): boolean {
  switch (kind) {
    case 'contribution':
    case 'withdrawal':
    case 'transfer_in':
    case 'transfer_out':
      return true;
    case 'fee':
      return feeTreatment === 'gross';
    case 'dividend':
      return false;
  }
}

/** Sign each kind is expected to carry, or `0` where either is legitimate. */
const EXPECTED_SIGN: Record<FlowKind, -1 | 0 | 1> = {
  contribution: 1,
  transfer_in: 1,
  dividend: 1,
  withdrawal: -1,
  transfer_out: -1,
  fee: -1,
};

/** Problems that make a flow incoherent, as human-readable messages. */
export function validateFlow(flow: Flow): string[] {
  const problems: string[] = [];

  const expected = EXPECTED_SIGN[flow.kind];
  const actual = flow.amount.isZero() ? 0 : flow.amount.isPositive() ? 1 : -1;
  if (expected !== 0 && actual !== 0 && actual !== expected) {
    problems.push(
      `${flow.kind} should be ${expected > 0 ? 'positive' : 'negative'}, got ${flow.amount}`,
    );
  }

  const isTransfer = flow.kind === 'transfer_in' || flow.kind === 'transfer_out';
  if (!isTransfer && flow.counterpartyAccountId) {
    problems.push(`counterpartyAccountId is only meaningful on transfers, not ${flow.kind}`);
  }
  // A transfer with no counterparty is legitimate: the other side may simply not
  // be tracked — an employer plan rolled in before records began, or an account
  // whose destination is known only to the person who moved the money. Such
  // halves still net to zero across a household, so totals stay correct; only
  // per-account attribution is left incomplete.

  return problems;
}

// --------------------------------------------------------------------- loans

export type LoanKind = 'mortgage' | 'auto' | 'student' | 'credit-card' | 'personal';

/**
 * Money owed, with the contract governing it.
 *
 * A loan is *not* an account with a negative balance, and §13.1 of the working
 * doc argues that at length. The short version: interest is a cost rather than a
 * return, a loan carries a contract no asset account has, and "paid off" means
 * the opposite of "closed". Every derivation in `retirement` assumes growth is
 * good, so a loan wearing an `Account` would make each of them produce a
 * plausible-looking wrong answer.
 *
 * What it *does* share is the record shape. Terms live here; what is owed lives
 * in {@link LoanObservation}, exactly as an account's value lives in a
 * {@link BalanceObservation}. A mutable `balance` field would be the
 * period-snapshot model Decision 1 rejected, and would drift the way `Q0` did.
 *
 * ## Why `termMonths` is what remains, not what was signed
 *
 * Nobody reliably remembers what they borrowed or when. Everyone can read what
 * they owe, the rate, and how many payments are left off a statement. Those three
 * map onto `LoanTerms` in `@varve/loans` with no conversion and no arithmetic
 * that could be wrong. See §13.3.
 */
export interface Loan {
  readonly id: LoanId;
  readonly householdId: HouseholdId;
  readonly name: string;
  /** Who owes it. One owner is an individual debt; several is a joint one. */
  readonly ownerIds: readonly OwnerId[];
  readonly kind: LoanKind;
  /** Nominal annual rate as a fraction: `0.061` is 6.1%. Never a percentage. */
  readonly annualRate: number;
  /** Payments **remaining**, not the original term. */
  readonly termMonths: number;
  readonly institution?: string;
}

/**
 * "This much was paid against the loan on this date." Always positive.
 *
 * Deliberately *not* split into interest and principal. A statement prints the
 * split, which is a standing invitation to store it — declined for the reason
 * §3.3 gives: a stored split is derivable state that can drift from the balances
 * it is supposed to agree with, which is exactly what `Q0` was.
 *
 * The split falls out of the observations either side. Storing less makes the
 * model say more, because the interest figure then cannot silently disagree with
 * what was owed.
 *
 * A payment does not move the balance. Only an observation does that. Money
 * leaving is evidence about money leaving; what is now owed is what the lender
 * says it is, and deriving one from the other would put the model back in the
 * business of guessing. See §16.4.
 */
export interface LoanPayment {
  readonly id: LoanPaymentId;
  readonly loanId: LoanId;
  readonly paidOn: IsoDate;
  /** What left the account. Positive. */
  readonly amount: Money;
  readonly note?: string;
}

/** "This much was still owed on this date." Always positive. */
export interface LoanObservation {
  readonly id: LoanObservationId;
  readonly loanId: LoanId;
  readonly asOf: IsoDate;
  /** Outstanding balance. Positive — the sign lives in the type, not the number. */
  readonly amount: Money;
  readonly source: ObservationSource;
}
