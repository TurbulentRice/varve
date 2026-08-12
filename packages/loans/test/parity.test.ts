/**
 * Reconciliation against `financetools`, for one loan at a time.
 *
 * The migration is trusted because recomputed totals match Access's own query
 * exactly, twenty years running (working doc §8.3). This port earned the same
 * standing the same way — and most of that apparatus has since been retired,
 * for reasons §15 sets out. The short version: three deliberate departures left
 * parity speaking to less and less, and the last one (§14) could only keep queue
 * parity alive by writing the same correction a second time in Python, which
 * independently verifies nothing.
 *
 * What is left is the part where `financetools` is still an independent
 * implementation and this port still agrees with it exactly. One loan, played
 * forward: interest on a balance, half-even to the cent, the overpayment clamp
 * on a final installment, and negative amortization when a payment cannot cover
 * the interest. No divergence has ever happened here, and if one ever does it
 * will be an accident rather than a decision — which is exactly what a fixture
 * is good at catching.
 *
 * Multi-loan behaviour is covered by `strategy.test.ts`, `budget.test.ts` and
 * `compare.test.ts`, which assert properties and pinned totals rather than
 * agreement with another program.
 *
 * Regenerate with `pnpm --filter @varve/loans fixtures`.
 */

import { describe, expect, it } from 'vitest';
import { Money } from '@varve/core';
import { amortize, minimumPayment } from '../src/amortize.js';
import fixture from './fixtures/financetools.json' with { type: 'json' };
import { renderInstallments, toTerms } from './oracle.js';

const money = (value: string) => Money.fromString(value);

describe('single-loan schedules, line for line', () => {
  for (const c of fixture.schedules) {
    it(`${c.name}`, () => {
      const schedule = amortize(toTerms(c.terms), {
        payment: money(c.payment),
        ...(c.months_requested === null ? {} : { maxMonths: c.months_requested }),
      });

      expect(renderInstallments(schedule.installments)).toEqual(c.installments);
      expect(schedule.finalBalance.toString()).toBe(money(c.final_balance).toString());
    });
  }

  it('derives the same scheduled payment from the annuity formula', () => {
    for (const c of fixture.schedules) {
      expect(minimumPayment(toTerms(c.terms)).toString()).toBe(money(c.minimum_payment).toString());
    }
  });
});

describe('the fixture itself', () => {
  it('covers the cases that make the arithmetic interesting', () => {
    // A plain amortization, a card at a card's rate, an overpayment, a final
    // stub, a 360-month mortgage, a loan going backwards, and a payment that
    // exactly covers the interest. Losing any of these would quietly narrow
    // what this file proves.
    expect(fixture.schedules.length).toBeGreaterThanOrEqual(7);
    expect(fixture.schedules.reduce((n, s) => n + s.installments.length, 0)).toBeGreaterThan(400);
  });

  it('quotes every rate in two decimal places or fewer', () => {
    // The Python rounds the rate through its money helper, so a third decimal
    // place would make the oracle disagree with the port and be wrong to. §11.3.
    for (const c of fixture.schedules) {
      const rate = Number(c.terms.annual_rate_percent);
      expect(rate * 100).toBe(Math.round(rate * 100));
    }
  });

  it('carries no name that could belong to anyone', () => {
    // Ground rule 1, applied where it is cheap rather than only where critical.
    const titles = fixture.schedules.map((s) => s.terms.title);
    expect(titles.every((t) => /^[A-Za-z0-9 ,\'()-]+$/.test(t))).toBe(true);
  });
});
