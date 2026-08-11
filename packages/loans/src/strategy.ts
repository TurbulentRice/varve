/**
 * Repayment strategies: one budget, several loans, five ways to spend it.
 *
 * Every strategy is the same loop. Each month, cover a minimum on every loan,
 * then spend what is left — the only question is *where*. Ordered strategies
 * pile the remainder onto one target and differ in how they pick it; unordered
 * ones spread it across all loans in proportion to something. Once a loan is
 * retired it stops consuming its minimum, so the budget freed up rolls into the
 * rest. That rolling is what makes any of this beat paying minimums forever.
 *
 * The names are the original author's and are kept verbatim, for the same
 * reason "organic gain" was: they are good, and they are what RepayMint's
 * interface already says.
 *
 *   avalanche   target the highest rate        — provably least interest
 *   blizzard    target the largest monthly interest cost, re-picked every month
 *   snowball    target the smallest balance    — motivational, not cheap
 *   cascade     spread in proportion to rate
 *   ice slide   spread in proportion to monthly interest cost
 */

import { Money } from '@varve/core';
import { analyzeInstallments, interestDue, minimumPayment, payMonth } from './amortize.js';
import { allocateCents, toCents } from './cents.js';
import type { Installment, LoanTerms, Schedule } from './types.js';

export type Strategy = 'avalanche' | 'blizzard' | 'snowball' | 'cascade' | 'ice-slide';

/** Every strategy, in the order the Python's `finish()` runs them. */
export const STRATEGIES: readonly Strategy[] = [
  'avalanche',
  'cascade',
  'blizzard',
  'ice-slide',
  'snowball',
];

/** What each loan must be paid before the remainder is allocated. */
export type MinimumMode =
  /** Service the interest and nothing more, so only the target amortizes. */
  | 'interest-only'
  /** The contractual payment that retires each loan over its own term. */
  | 'scheduled'
  /** An equal share of the budget, regardless of loan. */
  | 'even-split';

export interface RepaymentPlan {
  readonly strategy: Strategy;
  readonly budget: Money;
  /** Defaults to `'interest-only'`, as the Python does. */
  readonly minimum?: MinimumMode;
}

export interface Repayment {
  readonly strategy: Strategy;
  readonly minimum: MinimumMode;
  readonly budget: Money;
  /** Largest starting balance first — the ordering the Python settles on. */
  readonly schedules: readonly Schedule[];
  /** Months until the last loan is retired. */
  readonly months: number;
  /** Installments made across every loan. */
  readonly payments: number;
  readonly interestPaid: Money;
  readonly principalPaid: Money;
  readonly totalPaid: Money;
  readonly capitalized: Money;
  readonly percentPrincipal: number | null;
}

/** A loan mid-repayment. Local mutable state inside an otherwise pure function. */
interface Active {
  readonly terms: LoanTerms;
  /** The contractual payment, fixed at the outset from the original principal. */
  readonly scheduled: Money;
  balance: Money;
  readonly installments: Installment[];
}

export function repay(loans: readonly LoanTerms[], plan: RepaymentPlan): Repayment {
  const minimum = plan.minimum ?? 'interest-only';
  const budget = toCents(plan.budget);

  if (loans.length === 0) throw new RangeError('Nothing to repay: no loans given');
  if (budget.isNegative()) throw new RangeError(`Budget cannot be negative: ${budget.format()}`);

  let active: Active[] = loans.map((terms) => ({
    terms,
    // Fixed from the original principal rather than recomputed as the balance
    // falls: a contractual payment does not shrink because you are ahead.
    scheduled: minimumPayment(terms),
    balance: toCents(terms.principal),
    installments: [],
  }));

  const retired: Active[] = [];

  // Avalanche and snowball rank once — their keys are the starting rate and
  // balance, which do not reorder as loans are paid. Blizzard ranks by monthly
  // interest cost, which every payment changes, so it re-picks each month. That
  // is the source of the tooth-like pattern in its payment histories.
  if (plan.strategy === 'avalanche' || plan.strategy === 'snowball') {
    active = prioritize(active, plan.strategy);
  }

  while (active.length > 0) {
    while (active.every((loan) => !loan.balance.isZero())) {
      if (plan.strategy === 'blizzard') active = prioritize(active, plan.strategy);

      const payments = distribute(active, plan.strategy, minimum, budget);

      active.forEach((loan, i) => {
        const paid = payMonth(loan.balance, loan.terms.annualRate, payments[i]!);
        loan.installments.push({ number: loan.installments.length + 1, ...paid });
        loan.balance = paid.balance;
      });
    }

    // A month can retire more than one loan; all of them leave together, and
    // the budget they were consuming is free from the next month on.
    retired.push(...active.filter((loan) => loan.balance.isZero()));
    active = active.filter((loan) => !loan.balance.isZero());
  }

  const schedules = retired
    .slice()
    .sort((a, b) => b.terms.principal.compare(a.terms.principal))
    .map(
      (loan): Schedule => ({
        terms: loan.terms,
        openingBalance: toCents(loan.terms.principal),
        installments: loan.installments,
        finalBalance: loan.balance,
        paidOff: true,
      }),
    );

  const totals = analyzeInstallments(schedules.flatMap((s) => s.installments));

  return {
    strategy: plan.strategy,
    minimum,
    budget,
    schedules,
    months: Math.max(...schedules.map((s) => s.installments.length)),
    payments: totals.months,
    interestPaid: totals.interestPaid,
    principalPaid: totals.principalPaid,
    totalPaid: totals.totalPaid,
    capitalized: totals.capitalized,
    percentPrincipal: totals.percentPrincipal,
  };
}

/**
 * Rank loans so the *last* is the one to target.
 *
 * Last rather than first because that is where the Python puts the remainder,
 * and the ordering is load-bearing: it decides which loan gets the money.
 */
function prioritize(loans: readonly Active[], strategy: Strategy): Active[] {
  const ranked = loans.slice();

  switch (strategy) {
    case 'avalanche':
      // Highest rate last, breaking ties on the larger balance — between two
      // loans at the same rate, the big one costs more to leave alone.
      ranked.sort((a, b) =>
        a.terms.annualRate - b.terms.annualRate || a.balance.compare(b.balance),
      );
      break;
    case 'blizzard':
      // Compared as floats rather than through the cent grid deliberately: two
      // loans whose interest rounds to the same cent are still ordered by what
      // they actually cost, which is what the Python's full-precision compare
      // does.
      ranked.sort((a, b) => monthlyCost(a) - monthlyCost(b));
      break;
    case 'snowball':
      // Smallest balance last: retire whole loans fastest.
      ranked.sort((a, b) => b.balance.compare(a.balance));
      break;
    default:
      break;
  }

  return ranked;
}

function monthlyCost(loan: Active): number {
  return loan.balance.toNumber() * (loan.terms.annualRate / 12);
}

/**
 * Work out what each loan is paid this month.
 *
 * Minimums first, then the remainder — piled on the target, or spread.
 */
function distribute(
  loans: readonly Active[],
  strategy: Strategy,
  minimum: MinimumMode,
  budget: Money,
): Money[] {
  const payments = loans.map((loan) => {
    switch (minimum) {
      case 'interest-only':
        return interestDue(loan.balance, loan.terms.annualRate);
      case 'scheduled':
        return loan.scheduled;
      case 'even-split':
        // Divides by what is *still* outstanding, so the share grows as loans retire.
        return toCents(budget.dividedBy(loans.length));
    }
  });

  const remainder = budget.minus(Money.sum(payments));
  if (remainder.isNegative()) {
    throw new RangeError(
      `A budget of ${budget.format()} cannot cover the ${minimum} payments on ` +
        `${loans.length} loan${loans.length === 1 ? '' : 's'}, which come to ` +
        `${Money.sum(payments).format()}`,
    );
  }

  if (strategy !== 'cascade' && strategy !== 'ice-slide') {
    // Ordered: everything left goes to the loan `prioritize` put last.
    payments[payments.length - 1] = payments[payments.length - 1]!.plus(remainder);
    return payments;
  }

  const weights = loans.map((loan) =>
    strategy === 'cascade' ? loan.terms.annualRate : monthlyCost(loan),
  );

  // A departure from the Python, and a deliberate one. It computes each share
  // independently and rounds each, so the shares need not sum to the remainder
  // and a cent appears or evaporates every cycle. `allocateCents` splits by
  // largest remainder, which preserves the total exactly — the budget someone
  // typed is the budget that gets spent.
  //
  // Weights sum to zero only if every rate is zero, which is a real if unusual
  // queue of interest-free loans. Splitting evenly is the sensible reading; the
  // Python divides by zero.
  const total = weights.reduce((a, b) => a + b, 0);
  const shares = allocateCents(remainder, total > 0 ? weights : weights.map(() => 1));

  return payments.map((payment, i) => payment.plus(shares[i]!));
}
