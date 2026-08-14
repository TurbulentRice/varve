/**
 * Whether the payments are keeping up, and what that does to the finish.
 *
 * The measurements are the easy half. Most of what is asserted here is what the
 * function *refuses* to answer (§25.3), because every one of those cases is a
 * way a plausible implementation would return a confident wrong number: a pace
 * inferred from eleven days, a borrower who paid nothing averaged in as merely
 * slow, or a payment that never covers the interest reported as a blank rather
 * than as the warning it is.
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
import { loanState } from '../src/ledger.js';
import { schedulePosition } from '../src/pace.js';

const HOME = householdId('h');
const L = loanId('l1');

const loan = (rate = 0.06, termMonths = 24): Loan => ({
  id: L,
  householdId: HOME,
  name: 'Car',
  ownerIds: [ownerId('o1')],
  kind: 'auto',
  annualRate: rate,
  termMonths,
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

function position(
  observations: LoanObservation[],
  payments: LoanPayment[],
  l: Loan = loan(),
) {
  return schedulePosition(loanState(l, observations), observations, payments);
}

describe('the pace actually kept', () => {
  it('averages what was paid over the months the record brackets', () => {
    // Six months of record, $600 a month handed over.
    const { pace } = position(
      [owed('2026-01-01', '10000'), owed('2026-07-01', '6600')],
      [
        paid('2026-02-01', '600'),
        paid('2026-03-01', '600'),
        paid('2026-04-01', '600'),
        paid('2026-05-01', '600'),
        paid('2026-06-01', '600'),
        paid('2026-07-01', '600'),
      ],
    );

    expect(pace.unknown).toBeNull();
    // 181 days is 5.95 months, so $3,600 over it is a shade above $600.
    expect(pace.monthsMeasured).toBeCloseTo(5.95, 1);
    expect(pace.actual!.toNumber()).toBeCloseTo(605, 0);
  });

  it('reports ahead when the pace beats the contract', () => {
    const { pace } = position(
      [owed('2026-01-01', '10000'), owed('2026-07-01', '5000')],
      [paid('2026-04-01', '3000'), paid('2026-07-01', '3000')],
    );

    expect(pace.standing).toBe('ahead');
    expect(pace.difference!.isPositive()).toBe(true);
  });

  it('reports behind when it does not', () => {
    const { pace } = position(
      [owed('2026-01-01', '10000'), owed('2026-07-01', '9800')],
      [paid('2026-04-01', '150'), paid('2026-07-01', '150')],
    );

    expect(pace.standing).toBe('behind');
    expect(pace.difference!.isNegative()).toBe(true);
  });

  it('calls a near-miss level rather than reporting a shortfall in cents', () => {
    // The contractual payment carries cents; a borrower paying round dollars is
    // level in every sense they care about, and "behind by 40 cents" is
    // technically true and useless.
    const observations = [owed('2026-01-01', '10000'), owed('2026-04-02', '9000')];
    const state = loanState(loan(), observations);
    const contractual = state.scheduledPayment.toNumber();

    const months = 91 / (365.25 / 12);
    const { pace } = position(
      observations,
      [paid('2026-04-02', String((contractual * months).toFixed(2)))],
    );

    expect(pace.standing).toBe('level');
  });
});

describe('what it refuses to answer', () => {
  it('says nothing was paid rather than calling it a pace of zero', () => {
    const { pace } = position(
      [owed('2026-01-01', '10000'), owed('2026-07-01', '10000')],
      [],
    );

    expect(pace.actual).toBeNull();
    expect(pace.unknown).toBe('no-payments');
    expect(pace.standing).toBeNull();
  });

  it('refuses a monthly figure from less than a month of record', () => {
    // Ground rule 7. Two payments eleven days apart imply a monthly pace only
    // if you are willing to multiply by 2.8.
    const { pace } = position(
      [owed('2026-01-01', '10000'), owed('2026-01-12', '9700')],
      [paid('2026-01-05', '150'), paid('2026-01-12', '150')],
    );

    expect(pace.actual).toBeNull();
    expect(pace.unknown).toBe('too-short');
    expect(pace.monthsMeasured).toBeGreaterThan(0);
  });

  it('refuses when there is only one observation, so nothing brackets a span', () => {
    // The same two-observation minimum §16 enforces, and for the same reason
    // `YearRow.measurable` does: one reading says what is owed and nothing
    // about what happened.
    const { pace } = position([owed('2026-01-01', '10000')], [paid('2026-02-01', '600')]);

    expect(pace.unknown).toBe('single-observation');
  });

  it('tells a single observation apart from having paid nothing', () => {
    // A payment was recorded in the case above. Reporting it as 'no-payments'
    // would tell someone who has entered one that they have not — the two
    // unknowns mean opposite things to a reader.
    const paidNothing = position(
      [owed('2026-01-01', '10000'), owed('2026-07-01', '10000')],
      [],
    );

    expect(paidNothing.pace.unknown).toBe('no-payments');
  });

  it('refuses for a loan nobody has recorded a balance for', () => {
    const { pace } = position([], []);

    expect(pace.unknown).toBe('not-observed');
    expect(pace.actual).toBeNull();
  });

  it('refuses for a loan already cleared', () => {
    const { pace } = position(
      [owed('2026-01-01', '10000'), owed('2026-07-01', '0')],
      [paid('2026-07-01', '10200')],
    );

    expect(pace.unknown).toBe('cleared');
  });

  it('leaves a period with no payments out rather than averaging it in', () => {
    // A year of paying nothing is not a slow pace, it is a gap. Averaging it in
    // would report someone who stopped paying entirely as merely behind.
    const withGap = position(
      [owed('2026-01-01', '10000'), owed('2026-07-01', '10400'), owed('2027-01-01', '7000')],
      [paid('2026-09-01', '2000'), paid('2027-01-01', '2000')],
    );
    const withoutGap = position(
      [owed('2026-07-01', '10400'), owed('2027-01-01', '7000')],
      [paid('2026-09-01', '2000'), paid('2027-01-01', '2000')],
    );

    expect(withGap.pace.actual!.toString()).toBe(withoutGap.pace.actual!.toString());
  });
});

describe('what the pace does to the finish', () => {
  it('clears sooner and cheaper when paying above the contract', () => {
    const observations = [owed('2026-01-01', '10000'), owed('2026-07-01', '6000')];
    const { pace, finish } = position(
      observations,
      [paid('2026-04-01', '2100'), paid('2026-07-01', '2100')],
    );

    expect(pace.standing).toBe('ahead');
    expect(finish.actualMonths!).toBeLessThan(finish.contractualMonths!);
    expect(finish.monthsDifference!).toBeGreaterThan(0);
    expect(finish.interestDifference!.isPositive()).toBe(true);
  });

  it('takes longer and costs more when paying below it', () => {
    const { pace, finish } = position(
      [owed('2026-01-01', '10000'), owed('2026-07-01', '9000')],
      [paid('2026-04-01', '700'), paid('2026-07-01', '700')],
    );

    expect(pace.standing).toBe('behind');
    expect(finish.actualMonths!).toBeGreaterThan(finish.contractualMonths!);
    // Negative means the pace costs rather than saves — the sign carries it.
    expect(finish.monthsDifference!).toBeLessThan(0);
    expect(finish.interestDifference!.isNegative()).toBe(true);
  });

  it('says a pace that never covers the interest never clears, rather than going blank', () => {
    // The most important thing this can report, so it is a flag and not an
    // absence. $20 a month against $10,000 at 24% does not touch the balance.
    const { finish } = position(
      [owed('2026-01-01', '10000'), owed('2026-07-01', '10800')],
      [paid('2026-04-01', '60'), paid('2026-07-01', '60')],
      loan(0.24),
    );

    expect(finish.neverClears).toBe(true);
    expect(finish.actualMonths).toBeNull();
    expect(finish.contractualMonths).not.toBeNull();
  });

  it('still reports the contractual finish when the pace is unmeasured', () => {
    // Not knowing the pace says nothing about the contract, which is knowable
    // from the balance alone.
    const { pace, finish } = position(
      [owed('2026-01-01', '10000'), owed('2026-07-01', '10000')],
      [],
    );

    expect(pace.actual).toBeNull();
    expect(finish.contractualMonths).toBe(24);
    expect(finish.actualMonths).toBeNull();
    expect(finish.neverClears).toBe(false);
  });
});
