import { describe, expect, it } from 'vitest';
import { m } from '@varve/core';
import { compareStrategies } from '../src/compare.js';
import { STRATEGIES } from '../src/strategy.js';
import { loanId, type LoanTerms } from '../src/types.js';

const loan = (title: string, principal: string, annualRate: number): LoanTerms => ({
  id: loanId(title),
  title,
  principal: m(principal),
  annualRate,
  termMonths: 60,
});

const LOANS = [
  loan('Cheap and large', '20000', 0.03),
  loan('Dear and small', '3000', 0.19),
  loan('Middling', '9000', 0.08),
];

const BUDGET = m('1200');

describe('running every strategy against the same debt', () => {
  const comparison = compareStrategies(LOANS, { budget: BUDGET });

  it('runs all five', () => {
    expect(comparison.ranked).toHaveLength(STRATEGIES.length);
    expect(new Set(comparison.ranked.map((r) => r.strategy))).toEqual(new Set(STRATEGIES));
  });

  it('ranks by interest paid, cheapest first, by default', () => {
    const interest = comparison.ranked.map((r) => r.interestPaid.toNumber());
    expect(interest).toEqual([...interest].sort((a, b) => a - b));
    expect(comparison.best.strategy).toBe('avalanche');
  });

  it('says what the choice is worth', () => {
    // The gap between the best and worst strategy — the number that tells
    // someone whether this decision deserves any of their attention.
    const interest = comparison.ranked.map((r) => r.interestPaid.toNumber());
    expect(comparison.spread.toNumber()).toBeCloseTo(interest.at(-1)! - interest[0]!, 4);
    expect(comparison.spread.isPositive()).toBe(true);
  });
});

describe('ranking by something other than money', () => {
  it('puts the soonest finish first when the goal is time', () => {
    const byTime = compareStrategies(LOANS, { budget: BUDGET, goal: 'time' });
    const months = byTime.ranked.map((r) => r.months);

    expect(months).toEqual([...months].sort((a, b) => a - b));
  });

  it('puts the fewest payments first when the goal is payments', () => {
    const byPayments = compareStrategies(LOANS, { budget: BUDGET, goal: 'payments' });
    const counts = byPayments.ranked.map((r) => r.payments);

    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  it('can disagree with itself about what is best', () => {
    // Cheapest and fastest are not the same strategy here, which is the reason
    // a comparison exists rather than a single recommendation.
    const cheapest = compareStrategies(LOANS, { budget: BUDGET, goal: 'interest' }).best;
    const fastest = compareStrategies(LOANS, { budget: BUDGET, goal: 'time' }).best;

    expect(cheapest.strategy).not.toBe(fastest.strategy);
    expect(fastest.months).toBeLessThanOrEqual(cheapest.months);
    expect(fastest.interestPaid.compare(cheapest.interestPaid)).toBe(1);
  });
});

describe('narrowing the field', () => {
  it('compares only the strategies asked for', () => {
    const comparison = compareStrategies(LOANS, {
      budget: BUDGET,
      strategies: ['avalanche', 'snowball'],
    });

    expect(comparison.ranked.map((r) => r.strategy)).toEqual(['avalanche', 'snowball']);
  });

  it('carries the minimum through to every strategy it runs', () => {
    const comparison = compareStrategies(LOANS, { budget: BUDGET, minimum: 'scheduled' });

    expect(comparison.ranked.every((r) => r.minimum === 'scheduled')).toBe(true);
  });

  it('handles a single strategy without pretending to compare', () => {
    const comparison = compareStrategies(LOANS, { budget: BUDGET, strategies: ['avalanche'] });

    expect(comparison.best.strategy).toBe('avalanche');
    expect(comparison.spread.isZero()).toBe(true);
  });
});
