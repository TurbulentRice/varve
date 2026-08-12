/**
 * The seam between what is stored and what is calculated.
 *
 * Everything else in this package is a pure function over {@link LoanTerms}:
 * a principal, a rate, a term. The ledger stores something slightly different —
 * a {@link Loan} carrying identity and contract, and a stream of
 * {@link LoanObservation}s saying what was owed when. This turns one into the
 * other, and it is the only place in the package that knows the ledger exists.
 *
 * That split is deliberate and mirrors `retirement`: `loadLedger` is the only
 * function there that touches a repository, and every derivation below it is a
 * function of plain data. Here there is no repository at all — a caller hands in
 * the records it already has.
 *
 * ## Balance owed is derived, never stored
 *
 * The shortcut would be a mutable `balance` field on the loan. That is the
 * period-snapshot model Decision 1 rejected, and it drifts exactly the way `Q0`
 * did (§3.3). What is owed now is the most recent observation, and a correction
 * next month sits alongside the old figure rather than erasing it.
 */

import { Money, type IsoDate, type Loan, type LoanId, type LoanObservation } from '@varve/core';
import { compareStrategies, type Comparison, type ComparisonGoal } from './compare.js';
import { amortize, analyzeSchedule, canAmortize, minimumPayment } from './amortize.js';
import type { MinimumMode } from './strategy.js';
import { loanId as toLoanId, type LoanTerms, type Schedule, type ScheduleAnalysis } from './types.js';

/** Whatever holds loans and their observations. A `Snapshot` satisfies it. */
export interface LoanLedger {
  readonly loans: readonly Loan[];
  readonly loanObservations: readonly LoanObservation[];
}

export interface LoanState {
  readonly loan: Loan;
  /** Outstanding balance, from the most recent observation. */
  readonly balance: Money;
  /**
   * When that balance was true, or `null` if the loan has never been observed.
   *
   * Worth surfacing rather than hiding: a payoff projection from a balance six
   * months stale is a different claim from one made this morning, and only the
   * date says which you are looking at.
   */
  readonly asOf: IsoDate | null;
  /** Whether anything is actually known about what is owed. */
  readonly observed: boolean;
  /** The contractual payment that retires this balance over the remaining term. */
  readonly scheduledPayment: Money;
  readonly terms: LoanTerms;
}

/**
 * Resolve one loan against its observations.
 *
 * An unobserved loan reports a zero balance and `observed: false` rather than
 * guessing. Ground rule 3: missing is not zero, so the caller is told which it
 * is instead of being handed a number that looks like an answer.
 */
export function loanState(loan: Loan, observations: readonly LoanObservation[]): LoanState {
  const mine = observations
    .filter((o) => o.loanId === loan.id)
    .slice()
    .sort((a, b) => (a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : 0));

  const latest = mine[mine.length - 1];
  const balance = latest?.amount ?? Money.zero();

  const terms: LoanTerms = {
    id: toLoanId(loan.id),
    title: loan.name,
    principal: balance,
    annualRate: loan.annualRate,
    termMonths: loan.termMonths,
  };

  return {
    loan,
    balance,
    asOf: latest?.asOf ?? null,
    observed: latest !== undefined,
    scheduledPayment: balance.isZero() ? Money.zero() : minimumPayment(terms),
    terms,
  };
}

/** Every loan in a ledger, resolved. Largest balance first. */
export function loanStates(ledger: LoanLedger): LoanState[] {
  return ledger.loans
    .map((loan) => loanState(loan, ledger.loanObservations))
    .sort((a, b) => b.balance.compare(a.balance));
}

export function findLoanState(ledger: LoanLedger, id: LoanId): LoanState {
  const loan = ledger.loans.find((l) => l.id === id);
  if (!loan) throw new RangeError(`No loan ${id}`);
  return loanState(loan, ledger.loanObservations);
}

export interface LoanProjection {
  readonly state: LoanState;
  readonly schedule: Schedule;
  readonly analysis: ScheduleAnalysis;
}

/**
 * Play one loan forward at a given payment, or at its contractual one.
 *
 * Returns `null` where there is nothing to project — an unobserved loan, a
 * cleared balance, or a payment too small to ever retire it. A caller can then
 * say *why* there is no schedule, which is more useful than an empty table.
 */
export function projectLoan(state: LoanState, payment?: Money): LoanProjection | null {
  if (!state.observed || state.balance.isZero()) return null;

  const amount = payment ?? state.scheduledPayment;
  if (!canAmortize(state.balance, state.loan.annualRate, amount)) return null;

  const schedule = amortize(state.terms, { payment: amount });
  return { state, schedule, analysis: analyzeSchedule(schedule) };
}

export interface RepaymentPlanInput {
  readonly budget: Money;
  readonly minimum?: MinimumMode;
  readonly goal?: ComparisonGoal;
}

/** The smallest budget that covers every loan's contractual payment. */
export function minimumBudget(states: readonly LoanState[]): Money {
  return Money.sum(states.filter(payable).map((s) => s.scheduledPayment));
}

/** Loans that can take part in a comparison: observed, and still owing. */
export function payable(state: LoanState): boolean {
  return state.observed && state.balance.isPositive();
}

/**
 * Compare every strategy across a ledger's payable loans.
 *
 * `null` when there is nothing to compare — no loans, or none with a balance.
 * Comparing zero loans is not an error worth throwing over; it is the state
 * every new ledger starts in.
 */
export function compareLedger(
  ledger: LoanLedger,
  plan: RepaymentPlanInput,
): Comparison | null {
  const states = loanStates(ledger).filter(payable);
  if (states.length === 0) return null;

  return compareStrategies(
    states.map((s) => s.terms),
    {
      budget: plan.budget,
      ...(plan.minimum === undefined ? {} : { minimum: plan.minimum }),
      ...(plan.goal === undefined ? {} : { goal: plan.goal }),
    },
  );
}
