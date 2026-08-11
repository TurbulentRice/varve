/**
 * Amortizing one loan.
 *
 * The whole module rests on {@link payMonth}, which is deliberately small: a
 * balance, a rate and a payment go in, one month's outcome comes out. Both the
 * single-loan schedule below and the multi-loan strategies in `strategy.ts`
 * step through it, so there is exactly one place where interest is charged and
 * exactly one place where the awkward cases live.
 *
 * ## The two awkward cases
 *
 * A payment can be *too large* — more than the balance owed, on the final
 * month — in which case only the balance is repaid and the rest is not taken.
 * And a payment can be *too small* to cover the interest, in which case
 * everything paid goes to interest and the shortfall capitalizes: the balance
 * grows despite money changing hands. Both are inherited from the Python, which
 * gets them right.
 */

import { Money } from '@varve/core';
import { divideToCents, scaleToCents, toCents } from './cents.js';
import type { Installment, LoanTerms, Payment, Schedule, ScheduleAnalysis } from './types.js';

/**
 * Guard against a schedule that never terminates.
 *
 * {@link canAmortize} already rejects a payment that cannot beat the interest,
 * and a payment that beats it once beats it forever, since the balance only
 * falls. But a payment that clears interest by a single cent retires a
 * million-dollar balance at a cent a month, which terminates in theory and
 * hangs in practice. A thousand years is far past any real loan.
 */
const MAX_INSTALLMENTS = 12_000;

/** Monthly rate from the nominal annual one. Simple division, as the Python does. */
export function monthlyRate(annualRate: number): number {
  return annualRate / 12;
}

/** Interest accruing on a balance for one month, rounded to cents. */
export function interestDue(balance: Money, annualRate: number): Money {
  return scaleToCents(balance, monthlyRate(annualRate));
}

/**
 * The payment that retires the principal over the full term.
 *
 * `payment = principal ÷ ((1 + r)ⁿ − 1) / (r(1 + r)ⁿ)`, the standard annuity
 * discount factor. The factor is rate maths and stays a `number`; the crossing
 * back into exact money happens once, in the division.
 */
export function minimumPayment(terms: LoanTerms): Money {
  if (terms.termMonths <= 0) throw new RangeError(`Term must be positive: ${terms.termMonths}`);

  const r = monthlyRate(terms.annualRate);

  // An interest-free loan is a real product, and the discount factor divides by
  // `r`, so the Python raises `DivisionUndefined` on one. The limit as r → 0 is
  // just the principal spread evenly across the term.
  if (r === 0) return divideToCents(terms.principal, terms.termMonths);

  const growth = (1 + r) ** terms.termMonths;
  return divideToCents(terms.principal, (growth - 1) / (r * growth));
}

/**
 * Apply one month's payment.
 *
 * Rounding happens once, on the interest, and the other two amounts follow from
 * it without rounding again. That is exact rather than convenient: half-even is
 * symmetric and both the balance and the payment are already whole cents, so
 * `round(payment − interest)` really is `payment − round(interest)`, and the
 * same holds for the balance carried forward.
 */
export function payMonth(balance: Money, annualRate: number, payment: Money): Payment {
  const accrued = interestDue(balance, annualRate);

  let interest = accrued;
  let principal = payment.minus(accrued);
  let capitalized = Money.zero();

  // Never overpay: the last installment settles the balance and takes no more.
  if (principal.compare(balance) > 0) principal = balance;

  // Computed before the shortfall check, and deliberately so: when principal is
  // negative this *adds* the unpaid interest to the balance, which is what
  // capitalization means.
  const carried = balance.minus(principal);

  if (principal.isNegative()) {
    capitalized = accrued.minus(payment);
    interest = payment;
    principal = Money.zero();
  }

  return { interest, principal, capitalized, balance: carried };
}

export interface AmortizationPlan {
  /** Defaults to {@link minimumPayment}. */
  readonly payment?: Money;
  /** Stop after this many months rather than at payoff. */
  readonly maxMonths?: number;
}

/** Whether a payment can ever retire this balance, or merely service it forever. */
export function canAmortize(balance: Money, annualRate: number, payment: Money): boolean {
  return payment.compare(interestDue(balance, annualRate)) > 0;
}

/**
 * Play a loan out to payoff, or for a fixed number of months.
 *
 * Refuses rather than hangs when the payment cannot beat the interest — unless
 * `maxMonths` is set, which is how a caller asks to watch a balance grow.
 */
export function amortize(terms: LoanTerms, plan: AmortizationPlan = {}): Schedule {
  const payment = toCents(plan.payment ?? minimumPayment(terms));
  const opening = toCents(terms.principal);
  const limit = plan.maxMonths ?? MAX_INSTALLMENTS;

  if (plan.maxMonths === undefined && !opening.isZero() && !canAmortize(opening, terms.annualRate, payment)) {
    throw new RangeError(
      `${terms.title}: a payment of ${payment.format()} never retires ${opening.format()} at ` +
        `${(terms.annualRate * 100).toFixed(3)}% — the interest alone is ` +
        `${interestDue(opening, terms.annualRate).format()} a month`,
    );
  }

  const installments: Installment[] = [];
  let balance = opening;

  for (let month = 1; month <= limit && !balance.isZero(); month += 1) {
    const paid = payMonth(balance, terms.annualRate, payment);
    installments.push({ number: month, ...paid });
    balance = paid.balance;
  }

  if (plan.maxMonths === undefined && !balance.isZero()) {
    throw new RangeError(`${terms.title}: no payoff within ${MAX_INSTALLMENTS} payments`);
  }

  return {
    terms,
    openingBalance: opening,
    installments,
    finalBalance: balance,
    paidOff: balance.isZero(),
  };
}

export function analyzeSchedule(schedule: Schedule): ScheduleAnalysis {
  return analyzeInstallments(schedule.installments);
}

/** Shared with the queue, which wants the same figures totalled across loans. */
export function analyzeInstallments(installments: readonly Installment[]): ScheduleAnalysis {
  const interestPaid = Money.sum(installments.map((i) => i.interest));
  const principalPaid = Money.sum(installments.map((i) => i.principal));
  const totalPaid = interestPaid.plus(principalPaid);

  return {
    months: installments.length,
    interestPaid,
    principalPaid,
    totalPaid,
    capitalized: Money.sum(installments.map((i) => i.capitalized)),
    percentPrincipal: totalPaid.isZero() ? null : principalPaid.ratio(totalPaid),
    principalToInterest: interestPaid.isZero() ? null : principalPaid.ratio(interestPaid),
  };
}
