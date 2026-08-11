/**
 * The budget is spent, all of it, every month.
 *
 * This is the departure from `financetools` described in §11.5. Cascade and ice
 * slide split the leftover budget across every loan in proportion to something —
 * interest rate, or monthly interest cost — and the Python computes each share
 * independently and rounds it. Three equal shares of $1,000 come to $333.33
 * apiece, which is $999.99: a cent evaporates, every cycle, for the life of the
 * repayment.
 *
 * `Money.allocate` was written for exactly this. It splits by largest remainder,
 * so the parts always sum to the whole and the cent goes to whoever has the
 * strongest claim on it. The budget someone typed is the budget that gets spent.
 */

import { describe, expect, it } from 'vitest';
import { Money, m } from '@varve/core';
import { isWholeCents } from '../src/cents.js';
import { repay, type Strategy } from '../src/strategy.js';
import { loanId, type LoanTerms } from '../src/types.js';

const loan = (title: string, principal: string, annualRate: number): LoanTerms => ({
  id: loanId(title),
  title,
  principal: m(principal),
  annualRate,
  termMonths: 60,
});

/**
 * Three identical loans, so the shares are identical too and a naive split
 * cannot come out even. Each accrues $50 a month, so $150 covers the minimums
 * and $1,000 is left to spread three ways.
 */
const EVENLY_INDIVISIBLE = [
  loan('One', '10000', 0.06),
  loan('Two', '10000', 0.06),
  loan('Three', '10000', 0.06),
];

/** What every loan was actually charged in a given month. */
function spentInMonth(schedules: readonly { installments: readonly { interest: Money; principal: Money }[] }[], month: number): Money {
  return Money.sum(
    schedules.flatMap((s) => {
      const i = s.installments[month - 1];
      return i ? [i.interest.plus(i.principal)] : [];
    }),
  );
}

describe('a remainder that does not divide evenly', () => {
  const budget = m('1150');

  for (const strategy of ['cascade', 'ice-slide'] as const) {
    it(`${strategy} spends the whole budget in the first month`, () => {
      const result = repay(EVENLY_INDIVISIBLE, { strategy, budget });

      // The Python would spend $1,149.99 here and keep doing so.
      expect(spentInMonth(result.schedules, 1).toString()).toBe(budget.toString());
    });

    it(`${strategy} hands the odd cent to one loan rather than losing it`, () => {
      const result = repay(EVENLY_INDIVISIBLE, { strategy, budget });
      const first = result.schedules.map((s) => s.installments[0]!.principal.format());

      // Each pays $50 of interest, so the $1,000 remainder shows up as
      // $333.34 / $333.33 / $333.33 of principal — not three times $333.33.
      expect(first.filter((p) => p === '$333.34')).toHaveLength(1);
      expect(first.filter((p) => p === '$333.33')).toHaveLength(2);
    });
  }
});

describe('the budget is fully spent every month, under every strategy', () => {
  const budget = m('1150');
  const strategies: readonly Strategy[] = ['avalanche', 'blizzard', 'snowball', 'cascade', 'ice-slide'];

  for (const strategy of strategies) {
    it(`${strategy} never spends more or less than it was given`, () => {
      const result = repay(EVENLY_INDIVISIBLE, { strategy, budget });

      // Only up to the month the first loan retires: after that a loan takes
      // less than its share because less is owed, which is the point of a final
      // installment rather than a rounding failure.
      const firstRetirement = Math.min(...result.schedules.map((s) => s.installments.length));

      for (let month = 1; month < firstRetirement; month += 1) {
        expect(spentInMonth(result.schedules, month).toString(), `month ${month}`).toBe(
          budget.toString(),
        );
      }
    });
  }
});

describe('every amount a strategy produces is payable', () => {
  const strategies: readonly Strategy[] = ['avalanche', 'blizzard', 'snowball', 'cascade', 'ice-slide'];

  for (const strategy of strategies) {
    it(`${strategy} lands every figure on the cent grid`, () => {
      // This caught a real bug. `Money.allocate` splits in scale-4 units, so
      // spreading $1,000 three ways produced $333.3334 — a total that adds up
      // and a payment nobody can make. Splitting the cent count fixes it, and
      // this is the assertion that notices if it ever regresses.
      const result = repay(EVENLY_INDIVISIBLE, { strategy, budget: m('1150') });

      for (const schedule of result.schedules) {
        for (const i of schedule.installments) {
          expect(isWholeCents(i.interest), `${schedule.terms.title} interest`).toBe(true);
          expect(isWholeCents(i.principal), `${schedule.terms.title} principal`).toBe(true);
          expect(isWholeCents(i.balance), `${schedule.terms.title} balance`).toBe(true);
        }
      }
    });
  }
});

describe('what each spreading strategy spreads by', () => {
  it('cascade splits in proportion to interest rate', () => {
    const loans = [loan('Low', '10000', 0.04), loan('Mid', '10000', 0.06), loan('High', '10000', 0.1)];
    // $33.33 + $50.00 + $83.33 of interest, then $1,200 to spread 4:6:10.
    const result = repay(loans, { strategy: 'cascade', budget: m('1366.66') });

    const paid = (title: string) => {
      const s = result.schedules.find((x) => x.terms.title === title)!;
      return s.installments[0]!.interest.plus(s.installments[0]!.principal);
    };

    expect(paid('Low').format()).toBe('$273.33'); // 33.33 + 240
    expect(paid('Mid').format()).toBe('$410.00'); // 50.00 + 360
    expect(paid('High').format()).toBe('$683.33'); // 83.33 + 600
  });

  it('ice slide splits in proportion to what each loan costs a month', () => {
    // Same rate throughout, so the split follows the balances rather than the
    // rates — which is exactly what distinguishes it from cascade.
    const loans = [loan('Small', '5000', 0.06), loan('Large', '15000', 0.06)];
    // $25 + $75 of interest, then $900 to spread 25:75.
    const result = repay(loans, { strategy: 'ice-slide', budget: m('1000') });

    const extra = (title: string) => {
      const s = result.schedules.find((x) => x.terms.title === title)!;
      return s.installments[0]!.principal;
    };

    expect(extra('Small').format()).toBe('$225.00');
    expect(extra('Large').format()).toBe('$675.00');
  });
});

describe('a budget that cannot cover the minimums', () => {
  it('says so, with the numbers', () => {
    expect(() => repay(EVENLY_INDIVISIBLE, { strategy: 'avalanche', budget: m('100') })).toThrow(
      RangeError,
    );
    expect(() => repay(EVENLY_INDIVISIBLE, { strategy: 'avalanche', budget: m('100') })).toThrow(
      /cannot cover the interest-only payments on 3 loans/,
    );
  });

  it('refuses a negative budget outright', () => {
    expect(() => repay(EVENLY_INDIVISIBLE, { strategy: 'avalanche', budget: m('-50') })).toThrow(
      RangeError,
    );
  });

  it('refuses to repay nothing', () => {
    expect(() => repay([], { strategy: 'avalanche', budget: m('1000') })).toThrow(RangeError);
  });
});
