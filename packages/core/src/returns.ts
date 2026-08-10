/**
 * Investment return measurement.
 *
 * ## Why not just `(end - start - contributions) / start`
 *
 * That formula — the one the legacy spreadsheet uses — divides by starting
 * capital alone, so money contributed in March is credited with a full year of
 * growth. It amplifies the result in both directions: gains look bigger, losses
 * look deeper.
 *
 * Measured against the real 20-year history, the mean absolute gap versus a
 * proper time-weighted return is 133 basis points, the worst account-year is
 * 3,747 bp, and 34 account-years exceed 100 bp. The median gap is *exactly*
 * zero — with no cash flows, chain-linking telescopes
 * (`V₁/V₀ × V₂/V₁ × V₃/V₂ × V₄/V₃ = V₄/V₀`) and the two agree identically. So
 * the entire error is contribution timing, which means it shows up precisely in
 * the years someone was actually saving.
 *
 * The fix needs sub-annual observations, and the legacy data has had quarterly
 * balances since 2006.
 *
 * {@link simpleOrganicReturn} keeps the old formula available, because
 * reproducing the legacy numbers exactly is how the migration gets validated.
 */

import { Money } from './money.js';
import {
  compareDates,
  daysBetween,
  rangeContains,
  rangeDays,
  type DateRange,
  type IsoDate,
} from './time.js';
import { isExternalFlow, type FeeTreatment, type Flow } from './types.js';

/** Days per year used to annualize. Averages over the leap-year cycle. */
const DAYS_PER_YEAR = 365.25;

/** A dated amount crossing the account boundary. Signed. */
export interface DatedFlow {
  readonly occurredOn: IsoDate;
  readonly amount: Money;
}

/** One measurement interval: two balances and whatever moved between them. */
export interface SubPeriod {
  readonly range: DateRange;
  readonly startValue: Money;
  readonly endValue: Money;
  readonly flows: readonly DatedFlow[];
}

/**
 * Modified Dietz return for a single sub-period.
 *
 * Each flow is weighted by the fraction of the period it was actually invested,
 * `w = (T − d) / T`, so a contribution on the last day contributes nothing to
 * the denominator and one on the first day contributes fully.
 *
 * Returns `0` when no capital was at risk (empty period, or a zero denominator)
 * — there is nothing for a rate to be a rate *of*.
 */
export function modifiedDietz(period: SubPeriod): number {
  const totalDays = rangeDays(period.range);
  if (totalDays <= 0) return 0;

  const netFlow = Money.sum(period.flows.map((f) => f.amount));

  let weighted = Money.zero();
  for (const flow of period.flows) {
    const elapsed = daysBetween(period.range.start, flow.occurredOn);
    const weight = (totalDays - elapsed) / totalDays;
    weighted = weighted.plus(flow.amount.times(weight));
  }

  const gain = period.endValue.minus(period.startValue).minus(netFlow);
  const denominator = period.startValue.plus(weighted);
  if (denominator.isZero()) return 0;

  return gain.ratio(denominator);
}

export interface SubPeriodResult {
  readonly range: DateRange;
  readonly rate: number;
  readonly startValue: Money;
  readonly endValue: Money;
  readonly netFlow: Money;
}

export interface TimeWeightedReturn {
  /** Cumulative return across the whole span. `0.25` is +25%. */
  readonly rate: number;
  /** Geometric mean annual rate. Equals `rate` for a one-year span. */
  readonly annualized: number;
  readonly range: DateRange;
  readonly subPeriods: readonly SubPeriodResult[];
}

/** Just the balances a return calculation needs. */
export interface DatedBalance {
  readonly asOf: IsoDate;
  readonly amount: Money;
}

export interface ReturnOptions {
  /** Whether fees count as a cost of investing (`net`) or an outflow (`gross`). */
  readonly feeTreatment?: FeeTreatment;
}

/**
 * Chain-linked time-weighted return across every observation available.
 *
 * Splits the span at each balance observation, measures each interval with
 * {@link modifiedDietz}, and compounds: `Π(1 + rᵢ) − 1`. Linking is what makes
 * the result independent of *when* money arrived, which is what makes it
 * comparable to a benchmark.
 *
 * More observations means more accuracy — the method converges on true TWR as
 * intervals shrink — but it degrades gracefully to annual data.
 */
export function timeWeightedReturn(
  balances: readonly DatedBalance[],
  flows: readonly Flow[],
  options: ReturnOptions = {},
): TimeWeightedReturn {
  const { feeTreatment = 'net' } = options;

  const sorted = [...balances].sort((a, b) => compareDates(a.asOf, b.asOf));
  if (sorted.length < 2) {
    const only = sorted[0]?.asOf;
    const range: DateRange = { start: only ?? ('1970-01-01' as IsoDate), end: only ?? ('1970-01-01' as IsoDate) };
    return { rate: 0, annualized: 0, range, subPeriods: [] };
  }

  const external = flows.filter((f) => isExternalFlow(f.kind, feeTreatment));

  const subPeriods: SubPeriodResult[] = [];
  let factor = 1;

  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1]!;
    const current = sorted[i]!;
    const range: DateRange = { start: previous.asOf, end: current.asOf };

    const within = external
      .filter((f) => rangeContains(range, f.occurredOn))
      .map((f) => ({ occurredOn: f.occurredOn, amount: f.amount }));

    const rate = modifiedDietz({
      range,
      startValue: previous.amount,
      endValue: current.amount,
      flows: within,
    });

    factor *= 1 + rate;
    subPeriods.push({
      range,
      rate,
      startValue: previous.amount,
      endValue: current.amount,
      netFlow: Money.sum(within.map((f) => f.amount)),
    });
  }

  const range: DateRange = { start: sorted[0]!.asOf, end: sorted[sorted.length - 1]!.asOf };
  const rate = factor - 1;

  return { rate, annualized: annualize(rate, rangeDays(range)), range, subPeriods };
}

/**
 * Convert a cumulative return over `days` into a geometric annual rate.
 *
 * A total loss (`rate ≤ -100%`) annualizes to `-100%`; there is no meaningful
 * root of a non-positive growth factor.
 */
export function annualize(rate: number, days: number): number {
  if (days <= 0) return 0;
  const growth = 1 + rate;
  if (growth <= 0) return -1;
  return growth ** (DAYS_PER_YEAR / days) - 1;
}

/** Compound a series of period returns: `Π(1 + rᵢ) − 1`. */
export function chainLink(rates: readonly number[]): number {
  return rates.reduce((acc, r) => acc * (1 + r), 1) - 1;
}

// ------------------------------------------------------------- money measures

/**
 * Change in balance *including* contributions.
 *
 * The legacy spreadsheet's "TOTAL gain". A progress measure, not a return —
 * it answers "how much bigger is the pile?", so it must never be compared
 * against a benchmark.
 */
export function totalGain(startValue: Money, endValue: Money): Money {
  return endValue.minus(startValue);
}

/**
 * Change in balance *excluding* external flows.
 *
 * The legacy spreadsheet's "ORGANIC gain" — "the rate at which your savings
 * actually changed". This is the measure worth benchmarking.
 */
export function organicGain(
  startValue: Money,
  endValue: Money,
  netExternalFlow: Money,
): Money {
  return endValue.minus(startValue).minus(netExternalFlow);
}

/**
 * The legacy annual formula: `(end − start − flows) / start`.
 *
 * Retained deliberately. It is the wrong way to measure return (see the module
 * note), but reproducing it exactly is how the migration proves it did not
 * silently change anyone's history — and the gap against
 * {@link timeWeightedReturn} is itself worth surfacing to the user.
 */
export function simpleOrganicReturn(
  startValue: Money,
  endValue: Money,
  netExternalFlow: Money,
): number {
  if (startValue.isZero()) return 0;
  return organicGain(startValue, endValue, netExternalFlow).ratio(startValue);
}

// ------------------------------------------------------------------ fee drag

export interface FeeDrag {
  /** Return actually experienced, after costs. */
  readonly net: number;
  /** Return the account would have produced with fees added back. */
  readonly gross: number;
  /** `gross − net`: the annual cost of ownership, as a rate. */
  readonly drag: number;
  /** Fees paid over the span. */
  readonly feesPaid: Money;
}

/**
 * What fees cost, expressed as return foregone rather than dollars spent.
 *
 * Running the same time-weighted calculation twice — once treating fees as a
 * cost of investing, once as an outflow — isolates their effect. Fees compound
 * against a portfolio exactly the way returns compound for it, and a rate makes
 * that visible in a way a running total never does.
 */
export function feeDrag(
  balances: readonly DatedBalance[],
  flows: readonly Flow[],
): FeeDrag {
  const net = timeWeightedReturn(balances, flows, { feeTreatment: 'net' });
  const gross = timeWeightedReturn(balances, flows, { feeTreatment: 'gross' });
  const feesPaid = Money.sum(flows.filter((f) => f.kind === 'fee').map((f) => f.amount)).abs();

  return {
    net: net.annualized,
    gross: gross.annualized,
    drag: gross.annualized - net.annualized,
    feesPaid,
  };
}
