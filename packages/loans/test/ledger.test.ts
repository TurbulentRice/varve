import { describe, expect, it } from 'vitest';
import {
  Money,
  householdId,
  isoDate,
  loanId,
  loanObservationId,
  m,
  ownerId,
  type Loan,
  type LoanObservation,
} from '@varve/core';
import {
  compareLedger,
  findLoanState,
  loanState,
  loanStates,
  minimumBudget,
  payable,
  projectLoan,
  type LoanLedger,
} from '../src/ledger.js';

const HOME = householdId('h');

const loan = (id: string, name: string, rate: number, months = 60): Loan => ({
  id: loanId(id),
  householdId: HOME,
  name,
  ownerIds: [ownerId('o1')],
  kind: 'personal',
  annualRate: rate,
  termMonths: months,
});

let seq = 0;
const owed = (id: string, when: string, amount: string): LoanObservation => ({
  id: loanObservationId(`lo${(seq += 1)}`),
  loanId: loanId(id),
  asOf: isoDate(when),
  amount: m(amount),
  source: 'manual',
});

const ledger = (): LoanLedger => ({
  loans: [loan('l1', 'Car', 0.06), loan('l2', 'Card', 0.1899, 24)],
  loanObservations: [
    owed('l1', '2025-01-31', '20000'),
    owed('l1', '2026-01-31', '17000'),
    owed('l2', '2026-01-31', '4000'),
  ],
});

describe('what is owed comes from the latest observation', () => {
  it('takes the most recent, not the first', () => {
    const state = findLoanState(ledger(), loanId('l1'));

    expect(state.balance.toString()).toBe('17000.0000');
    expect(state.asOf).toBe('2026-01-31');
  });

  it('keeps the superseded figure rather than erasing it', () => {
    // A corrected balance sits alongside the old one. A mutable `balance` field
    // would have destroyed the earlier reading — the Q0-as-plug mistake.
    expect(ledger().loanObservations.filter((o) => o.loanId === loanId('l1'))).toHaveLength(2);
  });

  it('does not care what order observations arrive in', () => {
    const scrambled: LoanLedger = {
      loans: [loan('l1', 'Car', 0.06)],
      loanObservations: [owed('l1', '2026-01-31', '17000'), owed('l1', '2025-01-31', '20000')],
    };

    expect(findLoanState(scrambled, loanId('l1')).balance.toString()).toBe('17000.0000');
  });
});

describe('a loan nobody has recorded a balance for', () => {
  const unobserved = loanState(loan('l9', 'New', 0.05), []);

  it('says it is unobserved rather than reporting zero owed', () => {
    // Ground rule 3. Zero owed and nothing known are opposite claims, and only
    // one of them means "paid off".
    expect(unobserved.observed).toBe(false);
    expect(unobserved.asOf).toBeNull();
  });

  it('is left out of a comparison instead of distorting it', () => {
    expect(payable(unobserved)).toBe(false);
  });

  it('has no schedule to project', () => {
    expect(projectLoan(unobserved)).toBeNull();
  });
});

describe('a loan already paid off', () => {
  const cleared = loanState(loan('l3', 'Done', 0.06), [owed('l3', '2026-01-31', '0')]);

  it('is observed, but has nothing left to repay', () => {
    expect(cleared.observed).toBe(true);
    expect(payable(cleared)).toBe(false);
    expect(projectLoan(cleared)).toBeNull();
  });

  it('asks for no payment', () => {
    // Computing an annuity payment on a zero balance is arithmetic with no
    // meaning; the answer is that nothing is due.
    expect(cleared.scheduledPayment.isZero()).toBe(true);
  });
});

describe('the contractual payment', () => {
  it('amortizes what is owed over the months remaining', () => {
    // $17,000 at 6% over 60 months. `termMonths` is what is left, not what was
    // signed — see §13.3 — so this needs no back-calculation.
    const state = findLoanState(ledger(), loanId('l1'));
    expect(state.scheduledPayment.format()).toBe('$328.66');
  });

  it('adds up across a ledger to the smallest workable budget', () => {
    const states = loanStates(ledger());
    const total = Money.sum(states.map((s) => s.scheduledPayment));

    expect(minimumBudget(states).toString()).toBe(total.toString());
  });
});

describe('projecting one loan forward', () => {
  it('retires it, and says what it cost', () => {
    const state = findLoanState(ledger(), loanId('l1'));
    const projected = projectLoan(state)!;

    expect(projected.schedule.paidOff).toBe(true);
    expect(projected.analysis.principalPaid.toString()).toBe(state.balance.toString());
    expect(projected.analysis.interestPaid.isPositive()).toBe(true);
  });

  it('refuses a payment that never retires the debt', () => {
    // $50 against $4,000 at 18.99% does not cover the interest. A null here is
    // what lets the UI say why rather than draw an empty chart.
    const state = findLoanState(ledger(), loanId('l2'));
    expect(projectLoan(state, m('50'))).toBeNull();
  });

  it('finishes sooner when more is paid', () => {
    const state = findLoanState(ledger(), loanId('l1'));
    const contractual = projectLoan(state)!;
    const aggressive = projectLoan(state, m('600'))!;

    expect(aggressive.analysis.months).toBeLessThan(contractual.analysis.months);
    expect(aggressive.analysis.interestPaid.compare(contractual.analysis.interestPaid)).toBe(-1);
  });
});

describe('comparing strategies across a ledger', () => {
  it('ranks all five, cheapest first', () => {
    const comparison = compareLedger(ledger(), { budget: m('900') })!;
    const interest = comparison.ranked.map((r) => r.interestPaid.toNumber());

    expect(comparison.ranked).toHaveLength(5);
    expect(interest).toEqual([...interest].sort((a, b) => a - b));
  });

  it('crowns avalanche, as the theory says it should', () => {
    // This asserted `cascade` for one commit, and the comment explained why:
    // a retiring loan handed back none of its surplus, so avalanche wasted
    // $692.44 in a single month and lost by $17.56. §14 spends the whole budget,
    // and targeting the highest rate is optimal again.
    const comparison = compareLedger(ledger(), { budget: m('900') })!;
    expect(comparison.best.strategy).toBe('avalanche');
  });

  it('leaves unobserved and cleared loans out', () => {
    const mixed: LoanLedger = {
      loans: [...ledger().loans, loan('l8', 'Unknown', 0.05), loan('l7', 'Cleared', 0.05)],
      loanObservations: [...ledger().loanObservations, owed('l7', '2026-01-31', '0')],
    };

    const comparison = compareLedger(mixed, { budget: m('900') })!;
    expect(comparison.best.schedules.map((s) => s.terms.title).sort()).toEqual(['Car', 'Card']);
  });

  it('returns nothing rather than throwing when there is no debt', () => {
    // The state every new ledger starts in. Not an error.
    expect(compareLedger({ loans: [], loanObservations: [] }, { budget: m('900') })).toBeNull();
  });

  it('refuses a budget that cannot cover the minimums, with the numbers', () => {
    expect(() => compareLedger(ledger(), { budget: m('10') })).toThrow(RangeError);
  });
});

describe('listing a ledger', () => {
  it('puts the largest debt first', () => {
    expect(loanStates(ledger()).map((s) => s.loan.name)).toEqual(['Car', 'Card']);
  });

  it('refuses a loan that is not there', () => {
    expect(() => findLoanState(ledger(), loanId('nope'))).toThrow(RangeError);
  });
});
