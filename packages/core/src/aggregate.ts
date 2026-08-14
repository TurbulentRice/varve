/**
 * Rolling a ledger up into the numbers people actually look at.
 */

import { Money } from './money.js';
import {
  calendarYearRange,
  compareDates,
  rangeContains,
  type DateRange,
  type IsoDate,
} from './time.js';
import {
  simpleOrganicReturn,
  timeWeightedReturn,
  type DatedBalance,
  type ReturnOptions,
} from './returns.js';
import { isExternalFlow, type AccountId, type BalanceObservation, type Flow, type FlowKind } from './types.js';

/** A balance, plus the date it was actually observed. */
export interface BalanceAt {
  readonly amount: Money;
  readonly asOf: IsoDate;
  /** True when no observation existed on or before the requested date. */
  readonly missing: boolean;
}

/**
 * The most recent balance on or before `date`.
 *
 * Takes the minimal `{ asOf, amount }` shape rather than a full observation, so
 * that a synthetic series — a household aggregate, a benchmark, a projection —
 * composes with it just as a stored one does.
 *
 * This generalizes the legacy rule `Q4 ?? Q3 ?? Q2 ?? Q1`, which existed so the
 * current, partial year would report its latest known quarter instead of going
 * blank. Once balances are dated observations, that special case is just "the
 * latest one you have" — and unlike the original, the answer carries the date
 * it came from, so the UI can say *as of June 30* rather than quietly implying
 * the year is complete.
 *
 * A closed account must be recorded with a final zero-balance observation;
 * otherwise its last non-zero balance keeps answering forever.
 */
export function balanceAsOf(observations: readonly DatedBalance[], date: IsoDate): BalanceAt {
  let best: DatedBalance | undefined;
  for (const observation of observations) {
    if (observation.asOf > date) continue;
    if (!best || observation.asOf > best.asOf) best = observation;
  }

  if (!best) return { amount: Money.zero(), asOf: date, missing: true };
  return { amount: best.amount, asOf: best.asOf, missing: false };
}

const FLOW_KINDS: readonly FlowKind[] = [
  'contribution',
  'withdrawal',
  'fee',
  'dividend',
  'transfer_in',
  'transfer_out',
];

export interface PeriodSummary {
  readonly range: DateRange;
  readonly startValue: Money;
  readonly endValue: Money;
  /** Date `endValue` was actually observed — may precede `range.end`. */
  readonly endValueAsOf: IsoDate;

  readonly byKind: Readonly<Record<FlowKind, Money>>;
  /** Sum of flows that cross the boundary, under the chosen fee treatment. */
  readonly netExternalFlow: Money;

  /** Balance change including contributions. A progress measure, not a return. */
  readonly totalGain: Money;
  /** Balance change excluding external flows. The benchmarkable one. */
  readonly organicGain: Money;

  /** Chain-linked time-weighted return. The number to trust. */
  readonly twr: number;
  /** The legacy `(end − start − flows) / start`. Kept for comparison. */
  readonly simpleReturn: number;
}

/**
 * Summarize one account (or one pre-merged group) over a date range.
 */
export function summarizePeriod(
  observations: readonly DatedBalance[],
  flows: readonly Flow[],
  range: DateRange,
  options: ReturnOptions = {},
): PeriodSummary {
  const { feeTreatment = 'net' } = options;

  const start = balanceAsOf(observations, range.start);
  const end = balanceAsOf(observations, range.end);

  // Every flow in range, unfiltered: `byKind` is a report of what happened and
  // must see fees and dividends even though neither is external. The external
  // rule is applied below, where it belongs.
  const within = flows.filter((f) => rangeContains(range, f.occurredOn));

  const byKind = Object.fromEntries(
    FLOW_KINDS.map((kind) => [
      kind,
      Money.sum(within.filter((f) => f.kind === kind).map((f) => f.amount)),
    ]),
  ) as Record<FlowKind, Money>;

  // One definition of external, and it lives in `types.ts`. This used to
  // open-code the same rule by hand, which agreed with `isExternalFlow` for the
  // default treatment and silently ignored the `feeTreatment` option it was
  // handed — so asking for a gross figure returned a gross `twr` beside a net
  // `organicGain`, in one object (§27.2).
  const netExternalFlow = Money.sum(
    within.filter((f) => isExternalFlow(f.kind, feeTreatment)).map((f) => f.amount),
  );

  const spanned = observations
    .filter((o) => o.asOf >= start.asOf && o.asOf <= range.end)
    .map((o): DatedBalance => ({ asOf: o.asOf, amount: o.amount }));

  const twr = timeWeightedReturn(spanned, within, options);

  return {
    range,
    startValue: start.amount,
    endValue: end.amount,
    endValueAsOf: end.asOf,
    byKind,
    netExternalFlow,
    totalGain: end.amount.minus(start.amount),
    organicGain: end.amount.minus(start.amount).minus(netExternalFlow),
    twr: twr.rate,
    simpleReturn: simpleOrganicReturn(start.amount, end.amount, netExternalFlow),
  };
}

/** Summarize a calendar year. */
export function summarizeYear(
  observations: readonly DatedBalance[],
  flows: readonly Flow[],
  year: number,
  options: ReturnOptions = {},
): PeriodSummary {
  return summarizePeriod(observations, flows, calendarYearRange(year), options);
}

// --------------------------------------------------------------- aggregation

/**
 * Drop transfers whose counterparty is inside the same group.
 *
 * A rollover from a 401(k) into an IRA is a real external flow for each account
 * but a non-event for the household — the money never left. Removing internal
 * legs is what lets household-level return stay correct straight through the
 * 2020 consolidation, where ten accounts became six and every per-account
 * return in that year is meaningless.
 *
 * This is the payoff for modelling transfers as first-class matched pairs
 * rather than absorbing them into an opening balance.
 */
export function externalFlowsForGroup(
  flows: readonly Flow[],
  group: ReadonlySet<AccountId>,
): Flow[] {
  return flows.filter((flow) => {
    const isTransfer = flow.kind === 'transfer_in' || flow.kind === 'transfer_out';
    if (!isTransfer) return true;
    const counterparty = flow.counterpartyAccountId;
    return !(counterparty && group.has(counterparty));
  });
}

/**
 * Combine several accounts into one synthetic balance series.
 *
 * Balances are summed at every date any member was observed, so the series
 * keeps the finest granularity available across the group.
 */
export function aggregateBalances(
  observationsByAccount: ReadonlyMap<AccountId, readonly BalanceObservation[]>,
): DatedBalance[] {
  const dates = new Set<IsoDate>();
  for (const observations of observationsByAccount.values()) {
    for (const observation of observations) dates.add(observation.asOf);
  }

  return [...dates]
    .sort(compareDates)
    .map((asOf) => ({
      asOf,
      amount: Money.sum(
        [...observationsByAccount.values()].map((obs) => balanceAsOf(obs, asOf).amount),
      ),
    }));
}

// ----------------------------------------------------------------- averaging

/**
 * Arithmetic mean of a return series.
 *
 * What the legacy spreadsheet's `AVERAGE` columns compute. Kept for parity, but
 * see {@link geometricMean}: the arithmetic mean of volatile returns always
 * overstates what was actually earned, because it ignores that a 50% loss needs
 * a 100% gain to undo. Report it only where the legacy view is being
 * reproduced.
 */
export function arithmeticMean(rates: readonly number[]): number {
  if (rates.length === 0) return 0;
  return rates.reduce((a, b) => a + b, 0) / rates.length;
}

/**
 * Geometric mean of a return series — the constant rate that would have
 * produced the same final balance.
 *
 * The honest answer to "what did this average?". A total loss in any period
 * collapses the whole series to −100%, which is correct: it is unrecoverable.
 */
export function geometricMean(rates: readonly number[]): number {
  if (rates.length === 0) return 0;
  let product = 1;
  for (const rate of rates) {
    const growth = 1 + rate;
    if (growth <= 0) return -1;
    product *= growth;
  }
  return product ** (1 / rates.length) - 1;
}

/**
 * Trailing-window averages, aligned to the input series.
 *
 * Entries before a full window are `null` rather than a partial average, so a
 * "10-year average" never silently reports three years of data. The legacy
 * spreadsheet averages whatever it has; this is the deliberate departure.
 */
export function rollingAverage(
  rates: readonly number[],
  window: number,
  mean: (r: readonly number[]) => number = geometricMean,
): (number | null)[] {
  if (window <= 0) throw new RangeError('Window must be positive');
  return rates.map((_, i) => (i + 1 < window ? null : mean(rates.slice(i + 1 - window, i + 1))));
}

// ----------------------------------------------------------------- net worth

/**
 * One moment, with both sides of the household's position.
 *
 * `assets` and `debts` are both positive quantities: the sign lives in the
 * subtraction, not in the numbers, so neither series has to remember which kind
 * of thing it is.
 */
export interface NetWorthPoint {
  readonly asOf: IsoDate;
  readonly assets: Money;
  /** Owed. Positive. */
  readonly debts: Money;
  /** `assets − debts`. Negative when more is owed than held. */
  readonly net: Money;
  /**
   * Whether that side had actually been observed by this date.
   *
   * A carried-forward zero is not a measurement, and the distinction matters
   * asymmetrically: an unobserved debt subtracts nothing and reports a net worth
   * that is too *high*, which is the flattering direction and the worst way to
   * be wrong about this.
   *
   * This function cannot tell "owes nothing" from "owes an unrecorded amount" —
   * both arrive as an empty series — so it reports what it saw and leaves the
   * meaning to a caller that knows whether any debts exist at all. See §17.2.
   */
  readonly assetsObserved: boolean;
  readonly debtsObserved: boolean;
}

/**
 * Net two series of dated amounts against each other.
 *
 * Deliberately ignorant of what either side is. It has no idea one came from
 * investment accounts and the other from loans, which is what keeps `retirement`
 * and `loans` from having to know about each other (§17.1) — and what stops this
 * growing a special case for either, in the one place where a special case would
 * be a subtle lie.
 *
 * A point is emitted at every date either side moved, with the other side
 * carried forward from its last known value, which is the same rule
 * {@link balanceAsOf} applies within a single series.
 */
export function netWorthSeries(
  assets: readonly DatedBalance[],
  debts: readonly DatedBalance[],
): NetWorthPoint[] {
  const dates = [...new Set([...assets, ...debts].map((b) => b.asOf))].sort();

  return dates.map((asOf) => {
    const held = balanceAsOf(assets, asOf);
    const owed = balanceAsOf(debts, asOf);

    // `balanceAsOf` returns zero before the first observation, which is the
    // right carried-forward value and the wrong thing to call a measurement.
    const assetsObserved = assets.some((b) => b.asOf <= asOf);
    const debtsObserved = debts.some((b) => b.asOf <= asOf);

    return {
      asOf,
      assets: held.amount,
      debts: owed.amount,
      net: held.amount.minus(owed.amount),
      assetsObserved,
      debtsObserved,
    };
  });
}

/** The most recent point, or `null` where neither side has been observed. */
export function netWorthNow(points: readonly NetWorthPoint[]): NetWorthPoint | null {
  return points.length === 0 ? null : points[points.length - 1]!;
}
