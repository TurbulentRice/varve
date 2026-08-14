/**
 * The shaping that used to live in a `useMemo` and could not be tested (§22.4).
 *
 * These assert properties rather than balances, per ground rule 1: that a gap
 * stays a gap, that an unrecorded debt is counted rather than treated as zero,
 * that one moment produces one point. The numbers are small and invented.
 */

import { describe, expect, it } from 'vitest';
import { isoDate, loanId, loanObservationId, m, Money, type LoanObservation } from '@varve/core';
import { householdNetWorth, type AssetYear } from '../src/lib/net-worth.js';

function year(y: number, value: string, recorded = true, asOf?: string): AssetYear {
  return {
    year: y,
    endValue: m(value),
    endValueAsOf: isoDate(asOf ?? `${y}-12-31`),
    recorded,
  };
}

function owed(loan: string, on: string, amount: string): LoanObservation {
  return {
    id: loanObservationId(`lobs:${loan}:${on}`),
    loanId: loanId(loan),
    asOf: isoDate(on),
    amount: m(amount),
    source: 'manual',
  };
}

describe('netting one side against the other', () => {
  it('subtracts what was owed on the same date the balance was true', () => {
    const result = householdNetWorth({
      years: [year(2023, '100000'), year(2024, '120000')],
      loans: [{ id: loanId('loan:a') }],
      loanObservations: [owed('loan:a', '2023-06-01', '30000'), owed('loan:a', '2024-06-01', '20000')],
    });

    expect(result.annual.map((p) => p.net.toString())).toEqual([
      m('70000').toString(),
      m('100000').toString(),
    ]);
  });

  it('carries a debt forward rather than dropping it in a year with no statement', () => {
    // A loan does not stop existing because no statement arrived. The last
    // known balance is the answer until a newer one replaces it.
    const result = householdNetWorth({
      years: [year(2023, '100000'), year(2024, '120000')],
      loans: [{ id: loanId('loan:a') }],
      loanObservations: [owed('loan:a', '2023-06-01', '30000')],
    });

    expect(result.annual[1]!.debts.toString()).toBe(m('30000').toString());
    expect(result.annual[1]!.debtsObserved).toBe(true);
  });

  it('reports nothing owed before the first statement, and says it was not observed', () => {
    // Ground rule 3: the carried-forward zero is the right arithmetic and the
    // wrong thing to call a measurement, so both facts are reported.
    const result = householdNetWorth({
      years: [year(2022, '80000'), year(2023, '100000')],
      loans: [{ id: loanId('loan:a') }],
      loanObservations: [owed('loan:a', '2023-06-01', '30000')],
    });

    expect(result.annual[0]!.debts.isZero()).toBe(true);
    expect(result.annual[0]!.debtsObserved).toBe(false);
    expect(result.annual[1]!.debtsObserved).toBe(true);
  });

  it('goes negative when more is owed than held, rather than clamping at zero', () => {
    const result = householdNetWorth({
      years: [year(2024, '10000')],
      loans: [{ id: loanId('loan:a') }],
      loanObservations: [owed('loan:a', '2024-01-01', '25000')],
    });

    expect(result.annual[0]!.net.isNegative()).toBe(true);
  });
});

describe('several loans', () => {
  it('totals every loan, each at its own most recent statement', () => {
    const result = householdNetWorth({
      years: [year(2024, '100000')],
      loans: [{ id: loanId('loan:a') }, { id: loanId('loan:b') }],
      loanObservations: [
        owed('loan:a', '2024-01-01', '10000'),
        owed('loan:a', '2024-07-01', '9000'),
        owed('loan:b', '2024-03-01', '5000'),
      ],
    });

    // 9,000 from the newer statement for A, 5,000 from B's only one.
    expect(result.annual[0]!.debts.toString()).toBe(m('14000').toString());
  });

  it('treats several statements on one date as one moment, not several', () => {
    // Emitting a point per observation would draw the total after the first
    // statement of the day but before the second — a position nobody held.
    const result = householdNetWorth({
      years: [year(2024, '100000')],
      loans: [{ id: loanId('loan:a') }, { id: loanId('loan:b') }],
      loanObservations: [
        owed('loan:a', '2024-06-30', '10000'),
        owed('loan:b', '2024-06-30', '5000'),
      ],
    });

    expect(result.latest!.debts.toString()).toBe(m('15000').toString());
  });

  it('does not care what order the statements arrive in', () => {
    const ascending = householdNetWorth({
      years: [year(2024, '100000')],
      loans: [{ id: loanId('loan:a') }],
      loanObservations: [owed('loan:a', '2024-01-01', '10000'), owed('loan:a', '2024-07-01', '9000')],
    });
    const shuffled = householdNetWorth({
      years: [year(2024, '100000')],
      loans: [{ id: loanId('loan:a') }],
      loanObservations: [owed('loan:a', '2024-07-01', '9000'), owed('loan:a', '2024-01-01', '10000')],
    });

    expect(shuffled.annual[0]!.debts.toString()).toBe(ascending.annual[0]!.debts.toString());
  });
});

describe('a loan with nothing recorded against it', () => {
  it('is counted, because it subtracts nothing and flatters the total', () => {
    // The distinction `core` cannot make and this layer can (§17.2): an empty
    // debt series means "owes nothing" or "owes an unrecorded amount", and only
    // a caller that knows loans exist can tell which.
    const result = householdNetWorth({
      years: [year(2024, '100000')],
      loans: [{ id: loanId('loan:a') }, { id: loanId('loan:b') }],
      loanObservations: [owed('loan:a', '2024-01-01', '10000')],
    });

    expect(result.unobservedDebts).toBe(1);
    expect(result.annual[0]!.debts.toString()).toBe(m('10000').toString());
  });

  it('counts none when every loan has been seen', () => {
    const result = householdNetWorth({
      years: [year(2024, '100000')],
      loans: [{ id: loanId('loan:a') }],
      loanObservations: [owed('loan:a', '2024-01-01', '10000')],
    });

    expect(result.unobservedDebts).toBe(0);
  });
});

describe('a year with no balance recorded', () => {
  it('stays a gap rather than becoming a flat year', () => {
    // The chart breaks its line here. A line drawn through it would assert a
    // path nobody observed, which is the same mistake as reporting the year at
    // 0% (ground rule 3).
    const result = householdNetWorth({
      // 2024 has no balance of its own: the figure and its date are 2023's,
      // carried forward, which is what `deriveHistory` produces.
      years: [year(2023, '100000'), year(2024, '100000', false, '2023-12-31')],
      loans: [],
      loanObservations: [],
    });

    expect(result.annual.map((p) => p.recorded)).toEqual([true, false]);
  });

  it('repeats the position before it whole, rather than mixing two dates', () => {
    const result = householdNetWorth({
      years: [year(2023, '100000'), year(2024, '100000', false, '2023-12-31')],
      loans: [{ id: loanId('loan:a') }],
      loanObservations: [
        owed('loan:a', '2023-06-01', '30000'),
        // Arrived after the last balance was taken. Pairing it with a stale
        // asset figure would report a position that was never held.
        owed('loan:a', '2024-06-01', '20000'),
      ],
    });

    expect(result.annual[1]!.debts.toString()).toBe(m('30000').toString());
    expect(result.annual[1]!.net.toString()).toBe(result.annual[0]!.net.toString());
  });
});

describe('the headline figure keeps its full resolution', () => {
  it('reflects a statement that arrived after the last balance was taken', () => {
    // The chart is annualised because the two sides run on different clocks
    // (§22.3). The figure is not: it is the latest thing known about either.
    const result = householdNetWorth({
      years: [year(2024, '100000')],
      loans: [{ id: loanId('loan:a') }],
      loanObservations: [owed('loan:a', '2025-03-01', '20000')],
    });

    expect(result.latest!.asOf).toBe('2025-03-01');
    expect(result.latest!.debts.toString()).toBe(m('20000').toString());
    // ...while the annual grid still reports the year as it stood at its close.
    expect(result.annual[0]!.debts.isZero()).toBe(true);
  });

  it('is null when neither side has anything', () => {
    const result = householdNetWorth({ years: [], loans: [], loanObservations: [] });

    expect(result.latest).toBeNull();
    expect(result.annual).toEqual([]);
    expect(result.unobservedDebts).toBe(0);
  });
});

describe('assets alone', () => {
  it('reports net worth as the assets when nothing is owed', () => {
    const result = householdNetWorth({
      years: [year(2024, '100000')],
      loans: [],
      loanObservations: [],
    });

    expect(result.annual[0]!.net.toString()).toBe(m('100000').toString());
    expect(result.annual[0]!.debts.toString()).toBe(Money.zero().toString());
    expect(result.annual[0]!.debtsObserved).toBe(false);
  });
});
