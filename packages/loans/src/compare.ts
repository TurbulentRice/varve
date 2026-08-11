/**
 * Running every strategy against the same debt.
 *
 * The interesting output of this library is not any one schedule but the
 * comparison: the same loans and the same budget, five ways, ranked by what the
 * borrower actually cares about. Avalanche wins on interest almost always, but
 * "almost" is doing real work — with a large budget against small loans the
 * orderings converge and the answer stops being obvious, which is exactly when
 * someone wants to see the table.
 */

import { Money } from '@varve/core';
import { repay, STRATEGIES, type MinimumMode, type Repayment, type Strategy } from './strategy.js';
import type { LoanTerms } from './types.js';

export type ComparisonGoal =
  /** Least interest paid. The default, and usually the one that matters. */
  | 'interest'
  /** Soonest the last loan is retired. */
  | 'time'
  /** Fewest individual payments. */
  | 'payments';

export interface Comparison {
  readonly goal: ComparisonGoal;
  /** Best first, by {@link goal}. */
  readonly ranked: readonly Repayment[];
  readonly best: Repayment;
  /** What the worst strategy costs in interest over the best. */
  readonly spread: Money;
}

export interface ComparisonPlan {
  readonly budget: Money;
  readonly minimum?: MinimumMode;
  /** Defaults to `'interest'`. */
  readonly goal?: ComparisonGoal;
  /** Defaults to all five. */
  readonly strategies?: readonly Strategy[];
}

export function compareStrategies(
  loans: readonly LoanTerms[],
  plan: ComparisonPlan,
): Comparison {
  const goal = plan.goal ?? 'interest';
  const strategies = plan.strategies ?? STRATEGIES;

  const results = strategies.map((strategy) =>
    repay(loans, {
      strategy,
      budget: plan.budget,
      ...(plan.minimum === undefined ? {} : { minimum: plan.minimum }),
    }),
  );

  // Stable, so strategies that tie on the goal stay in the order they were run.
  const ranked = results.slice().sort((a, b) => rank(a, goal) - rank(b, goal));

  const interest = results.map((r) => r.interestPaid);

  return {
    goal,
    ranked,
    best: ranked[0]!,
    spread: interest.reduce((a, b) => Money.max(a, b)).minus(interest.reduce((a, b) => Money.min(a, b))),
  };
}

function rank(result: Repayment, goal: ComparisonGoal): number {
  switch (goal) {
    case 'interest':
      return result.interestPaid.toNumber();
    case 'time':
      return result.months;
    case 'payments':
      return result.payments;
  }
}
