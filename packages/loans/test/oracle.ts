/**
 * Reading the `financetools` fixture.
 *
 * Only the single-loan suite survives (§15), so this is small: turn a fixture
 * record into `LoanTerms`, and render installments in the fixture's own compact
 * encoding for comparison.
 */

import { Money } from '@varve/core';
import { loanId, type Installment, type LoanTerms } from '../src/types.js';

export interface FixtureTerms {
  readonly title: string;
  readonly principal: string;
  /** Percent, as the Python takes it. */
  readonly annual_rate_percent: string;
  readonly term_months: number;
}

export const toTerms = (t: FixtureTerms): LoanTerms => ({
  id: loanId(t.title),
  title: t.title,
  principal: Money.fromString(t.principal),
  annualRate: Number(t.annual_rate_percent) / 100,
  termMonths: t.term_months,
});

/**
 * Render installments in the fixture's own encoding: `"interest principal
 * balance"`, one string per payment, at two decimal places.
 *
 * Comparing rendered lines rather than field by field means a schedule that
 * drifts reports the payment it drifted at, in context, instead of five hundred
 * separate assertions.
 */
export function renderInstallments(installments: readonly Installment[]): string[] {
  const cents = (amount: Money) => amount.toNumber().toFixed(2);
  return installments.map((i) => `${cents(i.interest)} ${cents(i.principal)} ${cents(i.balance)}`);
}



