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

  it('agrees on the winner, because avalanche is optimal on both', () => {
    // This asserted the opposite before §14, and the disagreement was an
    // artifact: a retiring loan wasted its surplus, so the cheapest strategy was
    // not the one that targets the dearest debt. With the whole budget spent,
    // avalanche is cheapest and fastest, which is what the theory says.
    const cheapest = compareStrategies(LOANS, { budget: BUDGET, goal: 'interest' }).best;
    const fastest = compareStrategies(LOANS, { budget: BUDGET, goal: 'time' }).best;

    expect(cheapest.strategy).toBe('avalanche');
    expect(fastest.months).toBe(cheapest.months);
  });

  it('still ranks the losers differently, which is why the goal is a choice', () => {
    // The winner agreeing does not make the goal redundant. Blizzard and ice
    // slide tie on months and are far apart on interest, so which of them looks
    // worse depends entirely on what is being asked.
    const byInterest = compareStrategies(LOANS, { budget: BUDGET, goal: 'interest' }).ranked;
    const byTime = compareStrategies(LOANS, { budget: BUDGET, goal: 'time' }).ranked;

    expect(byInterest.map((r) => r.strategy)).not.toEqual(byTime.map((r) => r.strategy));
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
