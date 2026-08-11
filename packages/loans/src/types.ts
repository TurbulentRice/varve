/**
 * What a loan is, and what paying one produces.
 *
 * The Python original is object-oriented and mutable: a `Loan` owns a
 * `Payment_History` dict that `pay_month()` appends to, and the queue driver
 * copies loans before wrecking them. That works, but domain packages here are
 * pure (`retirement` is a set of functions from plain data to plain data), so
 * the port inverts the shape. A loan is its terms; paying it produces a
 * schedule; nothing mutates and nothing needs defending with a `branch()`.
 */

import type { Money } from '@varve/core';

declare const IdBrand: unique symbol;
export type LoanId = string & { readonly [IdBrand]: 'Loan' };
export const loanId = (value: string): LoanId => value as LoanId;

export interface LoanTerms {
  readonly id: LoanId;
  readonly title: string;
  /** Balance owed at the start of the schedule. */
  readonly principal: Money;
  /**
   * Nominal annual rate as a fraction: `0.061` is 6.1%.
   *
   * A fraction rather than a percentage, matching `annualReturn: 0.07` in
   * `core/projection.ts`. The Python takes a percentage *and* rounds it through
   * its money helper, so `Loan(1000, 4.875)` quietly becomes a 4.88% loan. A
   * rate has no cent grid; it stays a `number` here, unrounded.
   */
  readonly annualRate: number;
  /** Months the scheduled payment is sized to amortize over. */
  readonly termMonths: number;
}

/** One month's outcome. Every amount is on the cent grid. */
export interface Payment {
  /** Interest actually paid — not necessarily what accrued. See {@link capitalized}. */
  readonly interest: Money;
  /** Principal actually repaid. Never more than the balance owed. */
  readonly principal: Money;
  /**
   * Interest that accrued, went unpaid, and joined the balance.
   *
   * Non-zero only when a payment fails to cover the month's interest. The
   * Python models this correctly — the balance grows — but records only the
   * interest *paid*, so the shortfall becomes invisible the moment it is
   * absorbed. Naming it changes no number and makes a balance that grows while
   * money is being paid legible instead of inferred.
   */
  readonly capitalized: Money;
  /** Balance carried forward after this payment. */
  readonly balance: Money;
}

export interface Installment extends Payment {
  /** 1-based. */
  readonly number: number;
}

export interface Schedule {
  readonly terms: LoanTerms;
  readonly openingBalance: Money;
  readonly installments: readonly Installment[];
  readonly finalBalance: Money;
  readonly paidOff: boolean;
}

export interface ScheduleAnalysis {
  /** Number of payments made. */
  readonly months: number;
  readonly interestPaid: Money;
  readonly principalPaid: Money;
  readonly totalPaid: Money;
  /** Interest that accrued unpaid and joined the balance. Usually zero. */
  readonly capitalized: Money;
  /**
   * Share of everything paid that went to principal, as a fraction.
   *
   * `null` when nothing has been paid, rather than the Python's `0` — no
   * payments is not the same as a payment that achieved nothing.
   */
  readonly percentPrincipal: number | null;
  /**
   * Principal repaid per dollar of interest.
   *
   * `null` when no interest was paid at all, which the Python cannot express:
   * it divides by interest and raises on an interest-free loan.
   */
  readonly principalToInterest: number | null;
}
