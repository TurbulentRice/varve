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

import {
  Money,
  daysBetween,
  type IsoDate,
  type Loan,
  type LoanId,
  type LoanObservation,
  type LoanPayment,
} from '@varve/core';
import { compareStrategies, type Comparison, type ComparisonGoal } from './compare.js';
import { amortize, analyzeSchedule, canAmortize, minimumPayment } from './amortize.js';
import type { MinimumMode } from './strategy.js';
import { loanId as toLoanId, type LoanTerms, type Schedule, type ScheduleAnalysis } from './types.js';

/** Whatever holds loans and their observations. A `Snapshot` satisfies it. */
export interface LoanLedger {
  readonly loans: readonly Loan[];
  readonly loanObservations: readonly LoanObservation[];
  readonly loanPayments?: readonly LoanPayment[];
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

// ------------------------------------------------------ what it actually cost

/**
 * What a loan has cost between two observations of it.
 *
 * The measurement, not the projection. `summarizePeriod` does the equivalent for
 * an account: growth is whatever the balance did that the flows do not explain.
 * Inverted for a debt, the same arithmetic gives the interest actually charged —
 * what was paid, less how far the balance fell.
 *
 * That matters more than it sounds. A quoted APR is not what a lender charges:
 * there are fees, daily rather than monthly compounding, a rate that moved
 * mid-cycle, a payment applied late. The nominal rate says what should have
 * happened. This says what did, and where they disagree this is right. It is the
 * loan-side answer to §3.1, which is the finding the whole project grew from.
 */
export interface LoanPeriod {
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly openingBalance: Money;
  readonly closingBalance: Money;
  /** Everything paid between the two observations. */
  readonly paid: Money;
  /** How far what is owed actually fell. Negative if it grew. */
  readonly balanceReduction: Money;
  /**
   * Paid, less the reduction in the balance.
   *
   * `null` when nothing was paid in the period — a balance that moved on its own
   * says something happened, but not that it was interest, and guessing would be
   * the whole mistake this is here to avoid.
   */
  readonly interestCharged: Money | null;
  /**
   * Interest charged over the balance carried, annualized — the rate the lender
   * actually applied.
   *
   * A `number`, because it is a rate (§11.3). `null` where there is nothing to
   * divide by, or no interest figure to divide.
   */
  readonly effectiveAnnualRate: number | null;
}

export interface LoanCost {
  readonly periods: readonly LoanPeriod[];
  readonly totalPaid: Money;
  /** Summed across every period that could be measured. */
  readonly interestCharged: Money;
  readonly principalRepaid: Money;
  /** Weighted by how long each balance was carried. `null` if never measurable. */
  readonly effectiveAnnualRate: number | null;
  /**
   * Whether a payment has been recorded since the most recent balance.
   *
   * A payment does not move the balance — only an observation does (§16.4) — so
   * this is how the interface knows to say "what is owed is out of date" rather
   * than quietly showing a figure that has been overtaken.
   */
  readonly balanceStale: boolean;
}

const DAYS_PER_YEAR = 365.25;

/**
 * Reconcile a loan's payments against its observed balances.
 *
 * Consecutive observations bracket each period; payments falling inside are what
 * was handed over. Two observations are the minimum for any of this to mean
 * anything, which is the same rule `YearRow.measurable` enforces for accounts and
 * for the same reason.
 */
export function loanCost(
  loan: Loan,
  observations: readonly LoanObservation[],
  payments: readonly LoanPayment[],
): LoanCost {
  const seen = observations
    .filter((o) => o.loanId === loan.id)
    .slice()
    .sort((a, b) => (a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : 0));

  const mine = payments
    .filter((p) => p.loanId === loan.id)
    .slice()
    .sort((a, b) => (a.paidOn < b.paidOn ? -1 : a.paidOn > b.paidOn ? 1 : 0));

  const periods: LoanPeriod[] = [];

  for (let i = 1; i < seen.length; i += 1) {
    const from = seen[i - 1]!;
    const to = seen[i]!;

    // Half-open at the start: a payment on the opening date belongs to the
    // period that closed on it, not the one beginning there.
    const within = mine.filter((p) => p.paidOn > from.asOf && p.paidOn <= to.asOf);
    const paid = Money.sum(within.map((p) => p.amount));
    const balanceReduction = from.amount.minus(to.amount);

    const interestCharged = within.length === 0 ? null : paid.minus(balanceReduction);

    periods.push({
      from: from.asOf,
      to: to.asOf,
      openingBalance: from.amount,
      closingBalance: to.amount,
      paid,
      balanceReduction,
      interestCharged,
      effectiveAnnualRate: annualizedRate(interestCharged, from.amount, to.amount, from.asOf, to.asOf),
    });
  }

  const measured = periods.filter((p) => p.interestCharged !== null);
  const interestCharged = Money.sum(measured.map((p) => p.interestCharged!));
  const totalPaid = Money.sum(periods.map((p) => p.paid));

  const latestObservation = seen[seen.length - 1];
  const latestPayment = mine[mine.length - 1];

  return {
    periods,
    totalPaid,
    interestCharged,
    principalRepaid: totalPaid.minus(interestCharged),
    effectiveAnnualRate: blendedRate(measured),
    balanceStale:
      latestPayment !== undefined &&
      latestObservation !== undefined &&
      latestPayment.paidOn > latestObservation.asOf,
  };
}

/** Interest over the average balance carried, scaled to a year. */
function annualizedRate(
  interest: Money | null,
  opening: Money,
  closing: Money,
  from: IsoDate,
  to: IsoDate,
): number | null {
  if (interest === null) return null;

  const days = daysBetween(from, to);
  if (days <= 0) return null;

  // The mean of the two ends, which is the right denominator for a balance that
  // falls roughly linearly across a month. Nothing finer is justified when the
  // only evidence is two observations.
  const average = opening.plus(closing).dividedBy(2);
  if (!average.isPositive()) return null;

  return interest.ratio(average) * (DAYS_PER_YEAR / days);
}

/** Each period's rate, weighted by how long its balance was actually carried. */
function blendedRate(periods: readonly LoanPeriod[]): number | null {
  const usable = periods.filter((p) => p.effectiveAnnualRate !== null);
  if (usable.length === 0) return null;

  let weighted = 0;
  let total = 0;
  for (const p of usable) {
    const days = daysBetween(p.from, p.to);
    weighted += p.effectiveAnnualRate! * days;
    total += days;
  }
  return total > 0 ? weighted / total : null;
}
