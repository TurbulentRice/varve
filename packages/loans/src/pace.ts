/**
 * Whether the payments are keeping up with the contract, and what that does to
 * the finish.
 *
 * The question a borrower actually asks, and the one §20 carried for two eras.
 * §25.1 records why the obvious reading of it — replay the contract from
 * origination and compare balances — is not available here: a `Loan` stores
 * `termMonths` as *payments remaining* rather than an original term, there is no
 * origination date, and §13.3 decided deliberately that the form asks only for
 * what a statement tells you. Anchoring an amortization at the oldest
 * observation with today's remaining term would mix a balance from three years
 * ago with a term from last week and produce a plausible wrong answer.
 *
 * So this anchors forwards. The contract *from here* is well defined — this
 * balance, this rate, this many payments left — and what is unknown is whether
 * the borrower is keeping to it. That is recorded, in the payments §16 added.
 *
 * Two measurements, neither a projection of history:
 *
 *   1. the pace actually kept, against the contractual payment;
 *   2. what that pace does to the finish, by playing the current balance forward
 *      twice.
 *
 * Same move as §16.1: the nominal figure says what should happen, the ledger says
 * what did, and where they disagree the ledger is right.
 */

import { Money, daysBetween, type LoanObservation, type LoanPayment } from '@varve/core';
import { divideToCents } from './cents.js';
import { loanCost, projectLoan, type LoanState } from './ledger.js';

/**
 * Days in an average month — 365.25 / 12.
 *
 * A float, and correctly so: this converts an elapsed span into a count of
 * monthly payment slots, which is a rate-shaped question rather than a
 * money-shaped one (ground rule 2). The money that comes out of it is quantized
 * separately, on the cent grid, because a monthly payment is something someone
 * hands over (§11.2).
 */
const DAYS_PER_MONTH = 365.25 / 12;

/**
 * The shortest span that can imply a monthly pace.
 *
 * Two payments eleven days apart imply a monthly figure only if you are willing
 * to multiply by 2.8, which is extrapolation from one point wearing arithmetic's
 * clothes. Ground rule 7: a measurement only tests the distribution it samples,
 * and under a month this one has not sampled a month.
 */
const MIN_MONTHS = 1;

/** Why there is no pace to report. Never guessed around (§25.3). */
export type PaceUnknown =
  /** Two observations are the minimum for anything to be bracketed at all. */
  | 'single-observation'
  /** Bracketed spans exist, and nothing was handed over inside them. */
  | 'no-payments'
  /** Less than a month of record. A monthly figure would be extrapolation. */
  | 'too-short'
  | 'not-observed'
  | 'cleared';

export interface Pace {
  /**
   * What is actually being paid each month, or `null` with a reason.
   *
   * Measured across the observation-bracketed periods `loanCost` produces, so it
   * obeys the same half-open convention (§16.5) and only counts spans where both
   * ends are known.
   */
  readonly actual: Money | null;
  /** Why `actual` is null. `null` when it is not. */
  readonly unknown: PaceUnknown | null;
  /** What the contract asks for from the current balance. */
  readonly contractual: Money;
  /** Months of bracketed record the pace was measured over. */
  readonly monthsMeasured: number;
  /** `actual − contractual`. Positive is ahead. `null` when unmeasured. */
  readonly difference: Money | null;
  /**
   * Ahead, behind, or level — `null` when unmeasured.
   *
   * "Level" is a tolerance rather than an equality, because a payment rounded to
   * the dollar against a contractual figure carrying cents is level in every
   * sense a borrower cares about, and reporting "behind by 40 cents" would be
   * technically true and useless.
   */
  readonly standing: 'ahead' | 'behind' | 'level' | null;
}

export interface Finish {
  /** Months to clear at the contractual payment. `null` if not projectable. */
  readonly contractualMonths: number | null;
  /**
   * Months to clear at the measured pace.
   *
   * `null` where the pace is unmeasured *or* where it never clears the balance —
   * {@link neverClears} tells the two apart, because they mean opposite things.
   */
  readonly actualMonths: number | null;
  /**
   * The measured pace does not cover the interest, so the balance never falls.
   *
   * The single most important thing this can say, so it is a flag rather than an
   * absence (§25.3).
   */
  readonly neverClears: boolean;
  /** Months the pace saves against the contract. Negative means it costs. */
  readonly monthsDifference: number | null;
  /** Interest the pace saves against the contract. Negative means it costs. */
  readonly interestDifference: Money | null;
}

export interface SchedulePosition {
  readonly pace: Pace;
  readonly finish: Finish;
}

/**
 * A dollar either way is level.
 *
 * Wide enough to absorb a payment rounded to whole dollars against a contractual
 * figure carrying cents, narrow enough that a real underpayment still reads as
 * one. A tolerance is a judgement, so it is named rather than inlined.
 */
const LEVEL_TOLERANCE = Money.fromString('1');

export function schedulePosition(
  state: LoanState,
  observations: readonly LoanObservation[],
  payments: readonly LoanPayment[],
): SchedulePosition {
  const pace = measurePace(state, observations, payments);
  return { pace, finish: compareFinish(state, pace) };
}

function measurePace(
  state: LoanState,
  observations: readonly LoanObservation[],
  payments: readonly LoanPayment[],
): Pace {
  const base = {
    contractual: state.scheduledPayment,
    actual: null,
    difference: null,
    standing: null,
    monthsMeasured: 0,
  } as const;

  if (!state.observed) return { ...base, unknown: 'not-observed' };
  if (state.balance.isZero()) return { ...base, unknown: 'cleared' };

  // Distinguished from 'no-payments' because they mean opposite things to a
  // reader: one says nothing was paid, the other says nothing can be measured
  // yet even though something was. Collapsing them would tell someone who has
  // recorded a payment that they have not.
  const mine = observations.filter((o) => o.loanId === state.loan.id);
  if (mine.length < 2) return { ...base, unknown: 'single-observation' };

  const cost = loanCost(state.loan, observations, payments);

  // Only periods that actually contain payments say anything about pace. A
  // period with none is a span where nothing was handed over, and averaging it
  // in would report a borrower who paid nothing for a year as merely slow.
  const paying = cost.periods.filter((p) => p.paid.isPositive());
  if (paying.length === 0) return { ...base, unknown: 'no-payments' };

  const months = paying.reduce((sum, p) => sum + daysBetween(p.from, p.to) / DAYS_PER_MONTH, 0);
  if (months < MIN_MONTHS) {
    return { ...base, unknown: 'too-short', monthsMeasured: months };
  }

  const paid = Money.sum(paying.map((p) => p.paid));
  const actual = divideToCents(paid, months);
  const difference = actual.minus(state.scheduledPayment);

  return {
    actual,
    unknown: null,
    contractual: state.scheduledPayment,
    monthsMeasured: months,
    difference,
    standing: difference.abs().compare(LEVEL_TOLERANCE) <= 0
      ? 'level'
      : difference.isPositive()
        ? 'ahead'
        : 'behind',
  };
}

function compareFinish(state: LoanState, pace: Pace): Finish {
  const contractual = projectLoan(state);
  const contractualMonths = contractual?.analysis.months ?? null;

  const empty: Finish = {
    contractualMonths,
    actualMonths: null,
    neverClears: false,
    monthsDifference: null,
    interestDifference: null,
  };

  if (pace.actual === null) return empty;

  const atPace = projectLoan(state, pace.actual);

  // `projectLoan` answers null when a payment cannot retire the balance, which
  // for a *measured* pace means the borrower is not covering the interest. That
  // is a finding, not a gap, so it is reported as one.
  if (!atPace) return { ...empty, neverClears: true };

  const actualMonths = atPace.analysis.months;
  if (contractual === null || contractualMonths === null) return { ...empty, actualMonths };

  return {
    contractualMonths,
    actualMonths,
    neverClears: false,
    monthsDifference: contractualMonths - actualMonths,
    interestDifference: contractual.analysis.interestPaid.minus(atPace.analysis.interestPaid),
  };
}
