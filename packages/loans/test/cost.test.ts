/**
 * What a loan actually cost, measured rather than projected.
 *
 * The point of recording payments is not a prettier history — the balances
 * already say what is owed. It is that interest becomes a *measurement*: what
 * was paid, less how far the balance fell. Where that disagrees with the quoted
 * rate, the ledger is right and the rate is a claim.
 */

import { describe, expect, it } from 'vitest';
import {
  householdId,
  isoDate,
  loanId,
  loanObservationId,
  loanPaymentId,
  m,
  ownerId,
  type Loan,
  type LoanObservation,
  type LoanPayment,
} from '@varve/core';
import { loanCost } from '../src/ledger.js';

const HOME = householdId('h');
const L = loanId('l1');

const loan = (rate = 0.12): Loan => ({
  id: L,
  householdId: HOME,
  name: 'Card',
  ownerIds: [ownerId('o1')],
  kind: 'credit-card',
  annualRate: rate,
  termMonths: 24,
});

let seq = 0;
const owed = (when: string, amount: string): LoanObservation => ({
  id: loanObservationId(`o${(seq += 1)}`),
  loanId: L,
  asOf: isoDate(when),
  amount: m(amount),
  source: 'manual',
});
const paid = (when: string, amount: string): LoanPayment => ({
  id: loanPaymentId(`p${(seq += 1)}`),
  loanId: L,
  paidOn: isoDate(when),
  amount: m(amount),
});

describe('interest is what the balance did not explain', () => {
  // $10,000 owed; $1,000 paid; balance ends at $9,100. The lender took $100.
  const cost = loanCost(
    loan(),
    [owed('2026-01-31', '10000'), owed('2026-02-28', '9100')],
    [paid('2026-02-15', '1000')],
  );

  it('charges the difference between what was paid and what came off', () => {
    expect(cost.periods).toHaveLength(1);
    expect(cost.periods[0]!.interestCharged!.format()).toBe('$100.00');
  });

  it('splits the payment without ever storing the split', () => {
    expect(cost.totalPaid.format()).toBe('$1,000.00');
    expect(cost.principalRepaid.format()).toBe('$900.00');
    expect(cost.interestCharged.format()).toBe('$100.00');
  });

  it('reports the rate the lender actually applied', () => {
    // $100 over an average balance of $9,550 across 28 days is about 13.7% a
    // year — visibly more than the 12% quoted, which is the whole point.
    const rate = cost.periods[0]!.effectiveAnnualRate!;
    expect(rate).toBeGreaterThan(0.13);
    expect(rate).toBeLessThan(0.14);
    expect(rate).toBeGreaterThan(loan().annualRate);
  });
});

describe('a period nobody paid into', () => {
  const cost = loanCost(
    loan(),
    [owed('2026-01-31', '10000'), owed('2026-02-28', '10100')],
    [],
  );

  it('refuses to call the balance movement interest', () => {
    // The balance grew by $100 and no payment was recorded. That is probably
    // interest and it is not evidence of interest — guessing is the mistake this
    // exists to avoid. Ground rule 3.
    expect(cost.periods[0]!.interestCharged).toBeNull();
    expect(cost.periods[0]!.effectiveAnnualRate).toBeNull();
  });

  it('leaves it out of the totals rather than counting it as zero', () => {
    expect(cost.interestCharged.isZero()).toBe(true);
    expect(cost.effectiveAnnualRate).toBeNull();
  });
});

describe('a payment recorded after the last balance', () => {
  const cost = loanCost(
    loan(),
    [owed('2026-01-31', '10000'), owed('2026-02-28', '9100')],
    [paid('2026-02-15', '1000'), paid('2026-03-15', '1000')],
  );

  it('does not move what is owed', () => {
    // §16.4: money leaving is evidence about money leaving. What is owed is what
    // the lender says, and the March payment has not been reflected anywhere yet.
    expect(cost.periods).toHaveLength(1);
    expect(cost.periods[0]!.closingBalance.format()).toBe('$9,100.00');
  });

  it('says the balance is stale, so the interface can too', () => {
    expect(cost.balanceStale).toBe(true);
  });

  it('is not stale when the balance is the more recent of the two', () => {
    const fresh = loanCost(
      loan(),
      [owed('2026-01-31', '10000'), owed('2026-03-31', '8100')],
      [paid('2026-02-15', '1000')],
    );
    expect(fresh.balanceStale).toBe(false);
  });
});

describe('several periods', () => {
  const cost = loanCost(
    loan(),
    [
      owed('2026-01-31', '10000'),
      owed('2026-02-28', '9100'),
      owed('2026-03-31', '8150'),
      owed('2026-04-30', '7200'),
    ],
    [paid('2026-02-15', '1000'), paid('2026-03-15', '1000'), paid('2026-04-15', '1000')],
  );

  it('measures each one against the balances either side of it', () => {
    expect(cost.periods).toHaveLength(3);
    expect(cost.periods.map((p) => p.interestCharged!.format())).toEqual([
      '$100.00',
      '$50.00',
      '$50.00',
    ]);
  });

  it('adds up to what was paid', () => {
    expect(cost.totalPaid.format()).toBe('$3,000.00');
    expect(cost.interestCharged.plus(cost.principalRepaid).toString()).toBe(
      cost.totalPaid.toString(),
    );
  });

  it('blends the rate by how long each balance was carried', () => {
    // Between the highest and lowest period rate, not outside them.
    const rates = cost.periods.map((p) => p.effectiveAnnualRate!);
    expect(cost.effectiveAnnualRate).toBeGreaterThanOrEqual(Math.min(...rates));
    expect(cost.effectiveAnnualRate).toBeLessThanOrEqual(Math.max(...rates));
  });

  it('assigns a payment on an observation date to the period it closes', () => {
    // Half-open at the start. A payment made on the day a statement is cut
    // belongs to the month that just ended, not the one beginning.
    const onBoundary = loanCost(
      loan(),
      [owed('2026-01-31', '10000'), owed('2026-02-28', '9000'), owed('2026-03-31', '8000')],
      [paid('2026-02-28', '1100')],
    );

    expect(onBoundary.periods[0]!.paid.format()).toBe('$1,100.00');
    expect(onBoundary.periods[1]!.paid.isZero()).toBe(true);
  });
});

describe('too little to measure', () => {
  it('says nothing from a single observation', () => {
    // One balance says what is owed and nothing about what it did — the same
    // rule `YearRow.measurable` enforces for accounts.
    const cost = loanCost(loan(), [owed('2026-01-31', '10000')], [paid('2026-02-15', '1000')]);

    expect(cost.periods).toHaveLength(0);
    expect(cost.effectiveAnnualRate).toBeNull();
    expect(cost.interestCharged.isZero()).toBe(true);
  });

  it('says nothing from no observations at all', () => {
    const cost = loanCost(loan(), [], []);
    expect(cost.periods).toHaveLength(0);
    expect(cost.balanceStale).toBe(false);
  });
});

describe('a lender charging more than the sticker rate', () => {
  it('shows it, which is the entire reason to record payments', () => {
    // Quoted 5%. $2,000 paid across a year, balance down only $1,200: $800 of
    // interest on an average balance near $19,400 is about 4.1%... except the
    // quote was 5%, so this lender charged *less*. Either way, the ledger knows
    // and the rate alone never would.
    const cost = loanCost(
      loan(0.05),
      [owed('2025-12-31', '20000'), owed('2026-12-31', '18800')],
      [paid('2026-06-30', '2000')],
    );

    const effective = cost.effectiveAnnualRate!;
    expect(cost.interestCharged.format()).toBe('$800.00');
    expect(effective).toBeGreaterThan(0.04);
    expect(effective).toBeLessThan(0.045);
    // The measured rate and the quoted rate are different claims, and this is
    // the first thing in the codebase able to tell them apart.
    expect(Math.abs(effective - 0.05)).toBeGreaterThan(0.005);
  });
});
