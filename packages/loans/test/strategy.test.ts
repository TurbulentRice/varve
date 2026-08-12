/**
 * What each strategy actually does with the money.
 *
 * The parity suite proves the port matches the Python. These tests say what the
 * behaviour *is*, so a future change that keeps the schedules identical but
 * breaks the meaning still gets caught.
 */

import { describe, expect, it } from 'vitest';
import { Money, m } from '@varve/core';
import { repay, STRATEGIES } from '../src/strategy.js';
import { loanId, type LoanTerms } from '../src/types.js';

const loan = (title: string, principal: string, annualRate: number, termMonths = 60): LoanTerms => ({
  id: loanId(title),
  title,
  principal: m(principal),
  annualRate,
  termMonths,
});

/**
 * A spread of rates and balances that makes the strategies visibly disagree:
 * the highest rate is not the smallest balance, so avalanche and snowball must
 * pick differently.
 */
const MIXED = [
  loan('Cheap and large', '20000', 0.03),
  loan('Dear and small', '3000', 0.19),
  loan('Middling', '9000', 0.08),
];

const BUDGET = m('1200');

/** The month a given loan hits zero. */
const retiredAt = (result: ReturnType<typeof repay>, title: string) =>
  result.schedules.find((s) => s.terms.title === title)!.installments.length;

describe('every strategy retires every debt', () => {
  for (const strategy of STRATEGIES) {
    it(`${strategy} finishes, and repays exactly what was owed`, () => {
      const result = repay(MIXED, { strategy, budget: BUDGET });

      expect(result.schedules).toHaveLength(MIXED.length);
      expect(result.schedules.every((s) => s.paidOff)).toBe(true);
      expect(result.principalPaid.toString()).toBe(Money.sum(MIXED.map((l) => l.principal)).toString());
    });
  }
});

describe('the ordered strategies pick different targets', () => {
  it('avalanche clears the highest rate first, whatever it costs to hold', () => {
    const result = repay(MIXED, { strategy: 'avalanche', budget: BUDGET });

    // 19% is the most expensive money in the queue, so it goes first.
    expect(retiredAt(result, 'Dear and small')).toBeLessThan(retiredAt(result, 'Middling'));
    expect(retiredAt(result, 'Middling')).toBeLessThan(retiredAt(result, 'Cheap and large'));
  });

  it('snowball clears the smallest balance first, whatever it earns', () => {
    const result = repay(MIXED, { strategy: 'snowball', budget: BUDGET });

    expect(retiredAt(result, 'Dear and small')).toBeLessThan(retiredAt(result, 'Middling'));
    expect(retiredAt(result, 'Middling')).toBeLessThan(retiredAt(result, 'Cheap and large'));
  });

  it('and they disagree when the smallest loan is not the dearest', () => {
    // Same balances, so snowball goes by size and avalanche by rate — and the
    // two orders are opposites.
    const conflicting = [loan('Small but cheap', '4000', 0.03), loan('Big but dear', '16000', 0.2)];
    const budget = m('900');

    const avalanche = repay(conflicting, { strategy: 'avalanche', budget });
    const snowball = repay(conflicting, { strategy: 'snowball', budget });

    expect(retiredAt(avalanche, 'Big but dear')).toBeLessThan(retiredAt(avalanche, 'Small but cheap'));
    expect(retiredAt(snowball, 'Small but cheap')).toBeLessThan(retiredAt(snowball, 'Big but dear'));
  });
});

describe('avalanche earns its reputation', () => {
  it('pays the least interest of the five', () => {
    // A general property again, since §14. It briefly was not: where a targeted
    // loan retired with budget to spare the surplus was discarded rather than
    // redirected, and a spreading strategy could win by wasting less.
    const results = STRATEGIES.map((strategy) => repay(MIXED, { strategy, budget: BUDGET }));
    const avalanche = results.find((r) => r.strategy === 'avalanche')!;

    for (const other of results) {
      expect(
        avalanche.interestPaid.compare(other.interestPaid),
        `avalanche vs ${other.strategy}`,
      ).toBeLessThanOrEqual(0);
    }
  });

  it('is not beaten by blizzard, which re-targets every month and can cost more', () => {
    const avalanche = repay(MIXED, { strategy: 'avalanche', budget: BUDGET });
    const blizzard = repay(MIXED, { strategy: 'blizzard', budget: BUDGET });

    // Worth stating because the README calls blizzard "similar to Avalanche".
    // Ranking by monthly interest *cost* rather than rate lets a large cheap
    // balance out-shout a small dear one, and on this queue that costs about
    // 40% more interest — $2,240 against $1,601.
    expect(avalanche.interestPaid.compare(blizzard.interestPaid)).toBe(-1);
  });
});

describe('snowball buys speed with money', () => {
  // Same balances would let snowball and avalanche agree by accident, so this
  // queue deliberately puts the smallest balance on the cheapest rate.
  const conflicting = [loan('Small but cheap', '4000', 0.03), loan('Big but dear', '16000', 0.2)];
  const budget = m('900');

  const avalanche = repay(conflicting, { strategy: 'avalanche', budget });
  const snowball = repay(conflicting, { strategy: 'snowball', budget });

  it('clears the first loan sooner than avalanche does', () => {
    const first = (r: typeof avalanche) => Math.min(...r.schedules.map((s) => s.installments.length));

    // This is the entire case for it: one debt gone, sooner. Whether that is
    // worth paying for is the borrower's call, not the library's.
    expect(first(snowball)).toBeLessThan(first(avalanche));
  });

  it('and pays for it in interest', () => {
    expect(snowball.interestPaid.compare(avalanche.interestPaid)).toBe(1);
  });
});

describe('the budget rolls forward as loans retire', () => {
  it('keeps spending the whole budget once a loan is gone', () => {
    const result = repay(MIXED, { strategy: 'avalanche', budget: BUDGET });

    // A month in which some loan retires spends less, because that loan takes
    // only what it still owes. Every *other* month spends the budget in full —
    // which is the property worth having: a retired loan's minimum goes back
    // into the pot rather than being banked.
    const retirements = new Set(result.schedules.map((s) => s.installments.length));

    for (let month = 1; month <= result.months; month += 1) {
      if (retirements.has(month)) continue;

      const spent = Money.sum(
        result.schedules.flatMap((s) => {
          const i = s.installments[month - 1];
          return i ? [i.interest.plus(i.principal)] : [];
        }),
      );
      expect(spent.toString(), `month ${month}`).toBe(BUDGET.toString());
    }
  });

  it('is what makes the whole thing beat paying each loan separately', () => {
    const together = repay(MIXED, { strategy: 'avalanche', budget: BUDGET });

    // Paying each loan its own share forever, with nothing rolling over: the
    // same money, spent without coordination.
    const separately = MIXED.map((l) => repay([l], { strategy: 'avalanche', budget: m('400') }));
    const separateInterest = Money.sum(separately.map((r) => r.interestPaid));

    expect(together.interestPaid.compare(separateInterest)).toBe(-1);
  });
});

describe('blizzard re-picks its target as the balances move', () => {
  it('can hand the extra payment to a different loan than it started with', () => {
    // Two loans whose monthly interest cost starts close and crosses over. The
    // README calls the result a tooth-like pattern in the payment history.
    const close = [loan('A', '10000', 0.1), loan('B', '11000', 0.09)];
    const result = repay(close, { strategy: 'blizzard', budget: m('900') });

    const extraFor = (title: string, month: number) =>
      result.schedules.find((s) => s.terms.title === title)!.installments[month]!.principal.toNumber();

    // Whoever costs most this month gets the remainder, so across the schedule
    // the larger principal payment changes hands at least once.
    const leader = (month: number) => (extraFor('A', month) > extraFor('B', month) ? 'A' : 'B');
    const leaders = new Set(
      Array.from({ length: Math.min(...result.schedules.map((s) => s.installments.length)) }, (_, i) =>
        leader(i),
      ),
    );

    expect(leaders.size).toBe(2);
  });
});

describe('the minimum a loan must be paid', () => {
  it('interest-only leaves every non-target balance exactly where it was', () => {
    const result = repay(MIXED, { strategy: 'avalanche', budget: BUDGET, minimum: 'interest-only' });
    const untargeted = result.schedules.find((s) => s.terms.title === 'Cheap and large')!;

    // Avalanche targets the 19% loan first, so the cheap one is serviced and
    // nothing more: interest paid, principal untouched.
    expect(untargeted.installments[0]!.principal.isZero()).toBe(true);
    expect(untargeted.installments[0]!.balance.toString()).toBe(untargeted.openingBalance.toString());
  });

  it('scheduled minimums amortize every loan, so all of them shrink', () => {
    const result = repay(MIXED, { strategy: 'avalanche', budget: BUDGET, minimum: 'scheduled' });

    for (const schedule of result.schedules) {
      expect(schedule.installments[0]!.principal.isPositive(), schedule.terms.title).toBe(true);
    }
  });

  it('costs less to service interest than to amortize everything, under avalanche', () => {
    const serviced = repay(MIXED, { strategy: 'avalanche', budget: BUDGET, minimum: 'interest-only' });
    const amortizing = repay(MIXED, { strategy: 'avalanche', budget: BUDGET, minimum: 'scheduled' });
    const split = repay(MIXED, { strategy: 'avalanche', budget: BUDGET, minimum: 'even-split' });

    // Counterintuitive, and the reason `interest-only` is the default. The same
    // budget is spent either way; what changes is where the surplus goes.
    // Holding the cheap balances still sends every spare dollar at the dearest
    // debt, whereas scheduled minimums divert some of it into paying down 3%
    // money early. $1,601 against $1,715, and $1,832 for an even split.
    expect(serviced.interestPaid.compare(amortizing.interestPaid)).toBe(-1);
    expect(amortizing.interestPaid.compare(split.interestPaid)).toBe(-1);
  });

  it('an even split ignores the loans entirely and divides the budget', () => {
    const result = repay(MIXED, { strategy: 'cascade', budget: m('1200'), minimum: 'even-split' });

    // $1,200 across three loans is $400 each, and nothing is left to spread.
    for (const schedule of result.schedules) {
      const first = schedule.installments[0]!;
      expect(first.interest.plus(first.principal).format()).toBe('$400.00');
    }
  });
});

describe('a single loan in a queue', () => {
  it('behaves like the loan on its own', () => {
    const one = [loan('Only', '10000', 0.06)];
    const result = repay(one, { strategy: 'avalanche', budget: m('500') });

    expect(result.schedules).toHaveLength(1);
    expect(result.months).toBe(result.payments);
    // The whole budget goes to the one loan: $50 interest, $450 principal.
    expect(result.schedules[0]!.installments[0]!.principal.format()).toBe('$450.00');
  });
});

/**
 * Pinned totals for a full queue run.
 *
 * This is what replaces the queue half of the parity fixture (§15.2). Every
 * other test here asserts a *property* — the budget is spent, avalanche wins,
 * the split follows the rates — and properties do not notice a cent of drift in
 * the driver. A figure does.
 *
 * These are not sacred numbers. If one moves, that is the question being asked:
 * *why*, and is the new number better? Ground rule 5. Update them deliberately,
 * with the reason in the commit, and never to make a red suite go green.
 */
describe('what this queue actually costs, to the cent', () => {
  const expected: Record<string, { interest: string; months: number; payments: number }> = {
    avalanche: { interest: '$1,536.03', months: 28, payments: 42 },
    cascade: { interest: '$1,623.11', months: 29, payments: 48 },
    blizzard: { interest: '$2,234.65', months: 29, payments: 82 },
    'ice-slide': { interest: '$1,892.19', months: 29, payments: 80 },
    snowball: { interest: '$1,536.03', months: 28, payments: 42 },
  };

  for (const strategy of STRATEGIES) {
    it(`${strategy} costs exactly what it costs`, () => {
      const result = repay(MIXED, { strategy, budget: BUDGET });
      const want = expected[strategy]!;

      expect(result.interestPaid.format()).toBe(want.interest);
      expect(result.months).toBe(want.months);
      expect(result.payments).toBe(want.payments);
    });
  }

  it('repays the debt and not a cent more, whichever way round', () => {
    const owed = Money.sum(MIXED.map((l) => l.principal));
    for (const strategy of STRATEGIES) {
      const result = repay(MIXED, { strategy, budget: BUDGET });
      expect(result.principalPaid.toString(), strategy).toBe(owed.toString());
    }
  });
});
