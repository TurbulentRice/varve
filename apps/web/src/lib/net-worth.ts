/**
 * The household's position over time — assets against debts, shaped for the
 * Overview.
 *
 * ## Why this lives in the app rather than a package
 *
 * It has no legal home below this layer. It cannot go in `retirement` or `loans`
 * without making those two packages know about each other, which §17.1 spent a
 * section preventing. It cannot go in `core`, which takes two anonymous series
 * precisely so it stays ignorant of what either side is (§17.2). The app is the
 * only layer that legitimately knows both sides exist, so the shaping belongs
 * here — and being a plain function rather than a `useMemo` is what makes it
 * testable, which is the whole point of moving it (§22.4).
 *
 * ## Two resolutions, deliberately
 *
 * {@link NetWorth.latest} is the full-resolution figure: every date either side
 * moved, so the headline reflects the most recent loan statement even if it
 * landed mid-year. {@link NetWorth.annual} is one point per year for the chart
 * and its table twin.
 *
 * The chart is annualised because the two sides are recorded on different
 * clocks. The asset side has been annual-or-quarterly for twenty years; the debt
 * side is event-dated, whenever a statement arrives. Plotting the union would
 * kink the line at every statement and imply the household's *value* moved on
 * that date, when only what was known about it did. One point per year end, with
 * the debt carried forward to that date, says exactly what is known and nothing
 * more — and matches the year grid every other chart in the app already uses.
 *
 * Gaps are gaps. A year the household recorded no balance is `recorded: false`
 * and the chart breaks its line there rather than bridging it, for the reason
 * ground rule 3 gives.
 */

import {
  Money,
  netWorthNow,
  netWorthSeries,
  type IsoDate,
  type LoanId,
  type LoanObservation,
  type NetWorthPoint,
} from '@varve/core';

/** One year end, with both sides of the position as they stood. */
export interface AnnualNetWorth {
  readonly year: number;
  /** The date the asset figure was true — may precede the year end. */
  readonly asOf: IsoDate;
  readonly assets: Money;
  /** Owed. Positive. */
  readonly debts: Money;
  /** `assets − debts`. Negative when more is owed than held. */
  readonly net: Money;
  /**
   * Whether the household recorded a balance in this year, rather than the
   * figure being the previous year's carried forward. Straight through from
   * {@link YearRow.recorded}, so it means exactly what it means there.
   */
  readonly recorded: boolean;
  /** Whether anything was known about what was owed by this date. */
  readonly debtsObserved: boolean;
}

export interface NetWorth {
  /** The most recent point across both series, or `null` before either exists. */
  readonly latest: NetWorthPoint | null;
  /** One point per recorded-or-carried year, oldest first. */
  readonly annual: readonly AnnualNetWorth[];
  /**
   * Loans in the ledger with no balance recorded.
   *
   * `netWorthSeries` cannot tell "owes nothing" from "owes an unrecorded
   * amount" — both reach it as an empty series — so the count is computed here,
   * where whether any loans exist at all is knowable (§17.2). An unobserved debt
   * subtracts nothing and reports a net worth that is too *high*, which is the
   * flattering direction and so the one worth saying out loud.
   */
  readonly unobservedDebts: number;
}

/**
 * The four fields of a `YearRow` this actually reads.
 *
 * Narrower than `YearRow` on purpose. A `YearRow` structurally satisfies it, so
 * nothing at the call site changes, and stating the real dependency means the
 * tests can build one honestly instead of assembling twenty fields of return
 * arithmetic that this function never looks at.
 */
export interface AssetYear {
  readonly year: number;
  readonly endValue: Money;
  readonly endValueAsOf: IsoDate;
  readonly recorded: boolean;
}

export interface NetWorthInput {
  /** Year-end values, from the derived history. */
  readonly years: readonly AssetYear[];
  /** Every loan in the ledger — only the ids are read, to find unobserved ones. */
  readonly loans: readonly { readonly id: LoanId }[];
  readonly loanObservations: readonly LoanObservation[];
}

/**
 * Total owed at each date any loan was observed, oldest first.
 *
 * One pass rather than the obvious nested one. The version this replaced ran a
 * `filter` and a `sort` over every observation once per date, inside a map over
 * every date — quadratic, rebuilt on each render, and invisible at twenty
 * observations (§22.4). Here each loan's contribution is tracked as it changes
 * and the total is adjusted by the difference, so nothing is re-summed.
 */
function debtSeries(observations: readonly LoanObservation[]): { asOf: IsoDate; amount: Money }[] {
  const ordered = [...observations].sort((a, b) => (a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : 0));

  const latest = new Map<string, Money>();
  let total = Money.zero();
  const series: { asOf: IsoDate; amount: Money }[] = [];

  for (let i = 0; i < ordered.length; i += 1) {
    const observation = ordered[i]!;
    const previous = latest.get(observation.loanId) ?? Money.zero();
    total = total.plus(observation.amount.minus(previous));
    latest.set(observation.loanId, observation.amount);

    // Several loans observed on one date are one moment, not several. Emitting
    // a point per observation would draw intermediate totals that were never
    // true — the position after the first statement of the day but before the
    // second is not a position anyone held.
    const next = ordered[i + 1];
    if (!next || next.asOf !== observation.asOf) series.push({ asOf: observation.asOf, amount: total });
  }

  return series;
}

export function householdNetWorth({ years, loans, loanObservations }: NetWorthInput): NetWorth {
  const assets = years.map((y) => ({ asOf: y.endValueAsOf, amount: y.endValue }));
  const debts = debtSeries(loanObservations);

  const observedLoans = new Set(loanObservations.map((o) => o.loanId));

  // The annual grid asks the debt series what it was worth at each year end,
  // which is `balanceAsOf`'s carry-forward rule — the same one a balance obeys
  // everywhere else. `netWorthSeries` applies it for us by being handed the
  // year-end dates as the asset side.
  const points = netWorthSeries(assets, debts);
  const byDate = new Map(points.map((p) => [p.asOf, p]));

  // Both sides are read as of the date the *asset* figure was true, rather than
  // as of 31 December. That keeps one row describing one moment. A year still in
  // progress reports what was owed when its balance was taken, not what a
  // statement said afterwards; a gap year repeats the previous position whole,
  // which is what a carry-forward is, and is flagged as one rather than being
  // dressed up as a fresh reading.
  const annual = years.map((y): AnnualNetWorth => {
    const point = byDate.get(y.endValueAsOf);

    // Every year-end date was fed in as an asset observation, so a point always
    // exists. The fallback is for the impossible case rather than a real one,
    // and reports zero owed rather than inventing a debt.
    const debtsOwed = point?.debts ?? Money.zero();

    return {
      year: y.year,
      asOf: y.endValueAsOf,
      assets: y.endValue,
      debts: debtsOwed,
      net: y.endValue.minus(debtsOwed),
      recorded: y.recorded,
      debtsObserved: point?.debtsObserved ?? false,
    };
  });

  return {
    latest: netWorthNow(points),
    annual,
    unobservedDebts: loans.filter((l) => !observedLoans.has(l.id)).length,
  };
}
