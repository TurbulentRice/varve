/**
 * What the Debts page needs to know, worked out where it can be tested.
 *
 * Same move as `net-worth.ts` and for the same reason (§22.4): the arithmetic on
 * a page is the part worth testing, and inside a component it is reachable only
 * by rendering one. Nothing here is React, and the house has no DOM test stack
 * precisely because keeping the interesting part outside the UI has so far meant
 * never needing one (§12.5).
 *
 * It knows about `LoanState` and no further. Everything it computes comes from
 * `@varve/loans` primitives rather than being re-derived — `interestDue` in
 * particular, which quantizes through `scaleToCents` under the single-rounding
 * argument §11.2 settled. A second implementation of that rule is exactly the
 * kind of thing §11.2 exists to prevent.
 */

import { Money, type LoanObservation } from '@varve/core';
import { interestDue, payable, type LoanState } from '@varve/loans';

export interface DebtRow {
  readonly state: LoanState;
  /** Observed, and still owing — the loans that take part in a comparison. */
  readonly active: boolean;
  /**
   * Interest alone at today's balance: what this loan charges for existing,
   * before a dollar comes off it.
   *
   * `null` rather than zero for a loan that is cleared or never recorded.
   * Ground rule 3 — a loan nobody has entered a balance for does not cost
   * nothing a month, it costs an unknown amount.
   */
  readonly monthlyCost: Money | null;
  /**
   * Share of what is owed, or `null` where there is no answer — an inactive
   * loan, or a household that owes nothing at all. Never 0 as a stand-in.
   */
  readonly share: number | null;
  /**
   * Every balance recorded for this loan, oldest first — what the sparkline
   * draws.
   *
   * Handed over whole rather than reduced to a direction, because the drawing is
   * the point and a single word throws away the shape. Fewer than two and
   * `Sparkline` draws nothing, which is §24.2's objection still standing for a
   * loan with one statement.
   */
  readonly history: readonly LoanObservation[];
}

export interface DebtSummary {
  readonly rows: readonly DebtRow[];
  /** Total across payable loans. Positive. */
  readonly owed: Money;
  /** What the whole position costs a month in interest. */
  readonly monthlyCost: Money;
  readonly activeCount: number;
}

export function summariseDebts(
  states: readonly LoanState[],
  observations: readonly LoanObservation[] = [],
): DebtSummary {
  const active = states.filter(payable);
  const owed = Money.sum(active.map((s) => s.balance));

  const byLoan = new Map<string, LoanObservation[]>();
  for (const observation of observations) {
    const held = byLoan.get(observation.loanId);
    if (held) held.push(observation);
    else byLoan.set(observation.loanId, [observation]);
  }
  for (const held of byLoan.values()) {
    held.sort((a, b) => (a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : 0));
  }

  const rows = states.map((state): DebtRow => {
    const history = byLoan.get(state.loan.id) ?? [];

    if (!payable(state)) {
      return { state, active: false, monthlyCost: null, share: null, history };
    }

    return {
      state,
      active: true,
      monthlyCost: interestDue(state.balance, state.loan.annualRate),
      // `Money.ratio` already answers `null` where there is no ratio, which is
      // the same convention this file follows, so it passes straight through.
      share: state.balance.ratio(owed),
      history,
    };
  });

  return {
    rows,
    owed,
    monthlyCost: Money.sum(
      rows.flatMap((r) => (r.monthlyCost === null ? [] : [r.monthlyCost])),
    ),
    activeCount: active.length,
  };
}
