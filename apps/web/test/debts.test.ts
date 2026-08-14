/**
 * The Debts page's arithmetic, tested where it lives rather than through a DOM.
 *
 * Properties, not balances (ground rule 1): that shares sum to the whole, that
 * an unrecorded loan reports unknown rather than zero, and that the mismatch the
 * page exists to show — biggest balance is not most expensive — actually comes
 * out of the numbers rather than only out of the prose describing it.
 */

import { describe, expect, it } from 'vitest';
import { isoDate, loanId, loanObservationId, m, type Loan, type LoanObservation } from '@varve/core';
import { loanStates } from '@varve/loans';
import { summariseDebts } from '../src/lib/debts.js';

const HOUSEHOLD = 'hh:1' as Loan['householdId'];

function loan(id: string, ratePercent: number, termMonths = 60): Loan {
  return {
    id: loanId(id),
    householdId: HOUSEHOLD,
    name: id,
    ownerIds: [],
    kind: 'personal',
    annualRate: ratePercent / 100,
    termMonths,
  };
}

function owed(id: string, amount: string, asOf = '2024-01-01'): LoanObservation {
  return {
    id: loanObservationId(`lobs:${id}:${asOf}`),
    loanId: loanId(id),
    asOf: isoDate(asOf),
    amount: m(amount),
    source: 'manual',
  };
}

/** A ledger shaped the way `loanStates` expects, from loose parts. */
function summarise(loans: Loan[], observations: LoanObservation[]) {
  return summariseDebts(loanStates({ loans, loanObservations: observations }), observations);
}

describe('what the position costs', () => {
  it('totals every payable loan into what is owed', () => {
    const summary = summarise(
      [loan('loan:a', 6), loan('loan:b', 12)],
      [owed('loan:a', '10000'), owed('loan:b', '5000')],
    );

    expect(summary.owed.toString()).toBe(m('15000').toString());
    expect(summary.activeCount).toBe(2);
  });

  it('adds the per-loan monthly costs to the headline figure exactly', () => {
    // The tile above the table and the column inside it must agree, or one of
    // them is lying about the same quantity.
    const summary = summarise(
      [loan('loan:a', 6), loan('loan:b', 22)],
      [owed('loan:a', '10000'), owed('loan:b', '3000')],
    );

    const rowTotal = summary.rows
      .flatMap((r) => (r.monthlyCost === null ? [] : [r.monthlyCost]))
      .reduce((a, b) => a.plus(b), m('0'));

    expect(summary.monthlyCost.toString()).toBe(rowTotal.toString());
  });

  it('shows the biggest balance is not always the most expensive', () => {
    // The whole argument of the page, asserted rather than only written in the
    // table note: a small balance at a punitive rate outcosts a large cheap one,
    // which is what the Blizzard strategy exists to exploit (§24.2).
    const summary = summarise(
      [loan('loan:big', 3), loan('loan:small', 24)],
      [owed('loan:big', '20000'), owed('loan:small', '4000')],
    );

    const big = summary.rows.find((r) => r.state.loan.id === loanId('loan:big'))!;
    const small = summary.rows.find((r) => r.state.loan.id === loanId('loan:small'))!;

    expect(big.share! > small.share!).toBe(true);
    expect(small.monthlyCost!.compare(big.monthlyCost!) > 0).toBe(true);
  });
});

describe('shares', () => {
  it('sum to the whole across payable loans', () => {
    const summary = summarise(
      [loan('loan:a', 6), loan('loan:b', 12), loan('loan:c', 9)],
      [owed('loan:a', '10000'), owed('loan:b', '5000'), owed('loan:c', '5000')],
    );

    const total = summary.rows.reduce((sum, r) => sum + (r.share ?? 0), 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('give one loan the whole of it', () => {
    const summary = summarise([loan('loan:a', 6)], [owed('loan:a', '10000')]);
    expect(summary.rows[0]!.share).toBeCloseTo(1, 10);
  });
});

describe('a loan that is not payable', () => {
  it('reports unknown rather than zero when nothing was ever recorded', () => {
    // Ground rule 3. A loan with no balance entered does not cost nothing a
    // month; it costs an unknown amount, and a zero would read as "cleared".
    const summary = summarise([loan('loan:a', 6), loan('loan:b', 12)], [owed('loan:a', '10000')]);

    const unseen = summary.rows.find((r) => r.state.loan.id === loanId('loan:b'))!;
    expect(unseen.active).toBe(false);
    expect(unseen.monthlyCost).toBeNull();
    expect(unseen.share).toBeNull();
  });

  it('reports unknown for a loan recorded as cleared, and leaves it out of the totals', () => {
    const summary = summarise(
      [loan('loan:a', 6), loan('loan:paid', 12)],
      [owed('loan:a', '10000'), owed('loan:paid', '0')],
    );

    const cleared = summary.rows.find((r) => r.state.loan.id === loanId('loan:paid'))!;
    expect(cleared.active).toBe(false);
    expect(cleared.share).toBeNull();
    expect(summary.owed.toString()).toBe(m('10000').toString());
    expect(summary.activeCount).toBe(1);
  });

  it('still gives it a row, because a debt you cleared is worth seeing', () => {
    const summary = summarise([loan('loan:a', 6), loan('loan:paid', 12)], [owed('loan:a', '10000')]);
    expect(summary.rows).toHaveLength(2);
  });
});

describe('owing nothing at all', () => {
  it('answers null for every share rather than dividing by zero', () => {
    const summary = summarise([loan('loan:a', 6)], []);

    expect(summary.owed.isZero()).toBe(true);
    expect(summary.monthlyCost.isZero()).toBe(true);
    expect(summary.activeCount).toBe(0);
    expect(summary.rows[0]!.share).toBeNull();
  });

  it('summarises an empty ledger without complaint', () => {
    const summary = summarise([], []);

    expect(summary.rows).toEqual([]);
    expect(summary.owed.isZero()).toBe(true);
    expect(summary.activeCount).toBe(0);
  });
});

describe('the balance history each row carries', () => {
  it('gives every loan only its own statements', () => {
    const summary = summarise(
      [loan('loan:a', 6), loan('loan:b', 12)],
      [
        owed('loan:a', '10000', '2024-01-01'),
        owed('loan:a', '9000', '2024-07-01'),
        owed('loan:b', '5000', '2024-03-01'),
      ],
    );

    const a = summary.rows.find((r) => r.state.loan.id === loanId('loan:a'))!;
    const b = summary.rows.find((r) => r.state.loan.id === loanId('loan:b'))!;

    expect(a.history).toHaveLength(2);
    expect(b.history).toHaveLength(1);
    expect(a.history.every((o) => o.loanId === loanId('loan:a'))).toBe(true);
  });

  it('orders them oldest first, whatever order they arrived in', () => {
    // The sparkline reads left to right and has no axis to correct a reversal
    // with, so a mis-ordered series would draw a rising debt as a falling one.
    const summary = summarise(
      [loan('loan:a', 6)],
      [
        owed('loan:a', '9000', '2024-07-01'),
        owed('loan:a', '10000', '2024-01-01'),
        owed('loan:a', '8000', '2025-01-01'),
      ],
    );

    expect(summary.rows[0]!.history.map((o) => o.asOf)).toEqual([
      '2024-01-01',
      '2024-07-01',
      '2025-01-01',
    ]);
  });

  it('carries the history of a loan with no balance recorded as empty, not missing', () => {
    const summary = summarise([loan('loan:a', 6), loan('loan:b', 12)], [owed('loan:a', '10000')]);
    const unseen = summary.rows.find((r) => r.state.loan.id === loanId('loan:b'))!;

    expect(unseen.history).toEqual([]);
  });

  it('keeps a cleared loan its history, because how it got to zero is the story', () => {
    const summary = summarise(
      [loan('loan:paid', 12)],
      [owed('loan:paid', '5000', '2024-01-01'), owed('loan:paid', '0', '2024-12-01')],
    );

    expect(summary.rows[0]!.active).toBe(false);
    expect(summary.rows[0]!.history).toHaveLength(2);
  });
});
