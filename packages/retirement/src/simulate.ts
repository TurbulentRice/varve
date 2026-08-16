/**
 * Monte Carlo projection.
 *
 * The deterministic projection in `@varve/core` answers "what if every year is
 * average?" — and no year is average. The failure it cannot show is
 * sequence-of-returns risk: the same average return produces very different
 * outcomes depending on *when* the bad years land, and a bad run early is far
 * more damaging than the same run late. This dataset contains its own example,
 * with 2022 arriving between −29% and −30%.
 *
 * The output is a range rather than a number, because a range is the honest
 * answer and, usefully, also the more legible one. "Nine times in ten you land
 * between X and Y" is a sentence anyone can act on; a single projected balance
 * looks like a promise.
 *
 * ## Why this runs in floats
 *
 * `Money` is exact because recorded balances are facts, and a cent lost to
 * rounding is a cent that never comes back. A simulated future is not a fact —
 * it is a draw from a distribution whose uncertainty is measured in tens of
 * percent. Exact decimal arithmetic buys nothing against that, and costs
 * roughly an order of magnitude of speed across the hundreds of thousands of
 * iterations a run takes.
 *
 * So the inner loop is ordinary floating point, and results convert back to
 * `Money` at the boundary. Same principle as rates being plain numbers: exact
 * money for what happened, floats for what might.
 */

import { Money, type ContributionTiming } from '@varve/core';
import { mulberry32, randomInt, standardNormal, type Rng } from './random.js';
import type { History } from './history.js';

/** Draws one year's return. */
export interface ReturnModel {
  readonly name: string;
  /** Build a sampler bound to a generator. Called once per simulation. */
  sampler(rng: Rng): () => number;
}

/**
 * Resample observed returns, one year at a time.
 *
 * Makes no assumption about the shape of the distribution — no bell curve that
 * quietly understates how bad a bad year gets. The tails it produces are tails
 * that actually happened.
 *
 * What it does discard is order: each year is drawn independently, so runs of
 * good or bad years appear only by chance. {@link blockBootstrap} keeps them.
 */
export function bootstrap(samples: readonly number[]): ReturnModel {
  if (samples.length === 0) throw new RangeError('Bootstrap needs at least one observed return');
  return {
    name: 'bootstrap',
    sampler: (rng) => () => samples[randomInt(rng, samples.length)]!,
  };
}

/**
 * Resample contiguous runs of observed returns.
 *
 * Markets are not independent year to year, and sequence is exactly what
 * sequence-of-returns risk is about. Drawing blocks preserves the clustering
 * that single-year resampling averages away, at the cost of fewer effectively
 * independent samples.
 */
export function blockBootstrap(samples: readonly number[], blockYears = 3): ReturnModel {
  if (samples.length === 0) throw new RangeError('Bootstrap needs at least one observed return');
  if (blockYears < 1) throw new RangeError('Block length must be at least one year');

  return {
    name: `block-bootstrap(${blockYears})`,
    sampler: (rng) => {
      let block: number[] = [];
      let cursor = 0;

      return () => {
        if (cursor >= block.length) {
          // Wrap at the end of the series so every start point is equally
          // likely; otherwise later years are systematically under-sampled.
          const start = randomInt(rng, samples.length);
          block = Array.from(
            { length: blockYears },
            (_, i) => samples[(start + i) % samples.length]!,
          );
          cursor = 0;
        }
        return block[cursor++]!;
      };
    },
  };
}

/**
 * Draw from a normal distribution.
 *
 * Familiar and easy to reason about, and it understates tail risk: real market
 * returns produce extreme years more often than a bell curve predicts. Offered
 * for comparison against {@link bootstrap} rather than as the default.
 */
export function normal(mean: number, standardDeviation: number): ReturnModel {
  return {
    name: `normal(${mean}, ${standardDeviation})`,
    sampler: (rng) => {
      const next = standardNormal(rng);
      return () => mean + standardDeviation * next();
    },
  };
}

/** A fixed rate every year — the deterministic projection, as a model. */
export function fixed(rate: number): ReturnModel {
  return { name: `fixed(${rate})`, sampler: () => () => rate };
}

// ------------------------------------------------------------------- running

const TIMING_WEIGHT: Record<ContributionTiming, number> = {
  start: 1,
  end: 0,
  monthly: 0.5,
};

export interface SimulationInput {
  readonly startingValue: Money;
  readonly annualContribution: Money;
  /**
   * One contribution per projected year, overriding `annualContribution` and
   * `contributionGrowth` when present.
   *
   * Exists because two people do not retire in the same year, so a household's
   * saving steps down rather than growing smoothly (§28.4). Shorter than `years`
   * is read as zero thereafter — a schedule that runs out has said everything it
   * has to say.
   */
  readonly contributionSchedule?: readonly Money[];
  readonly years: number;
  readonly returns: ReturnModel;
  /** Applied to the contribution each year, e.g. `0.03` to track raises. */
  readonly contributionGrowth?: number;
  /** Defaults to `'monthly'`, which is how most people actually contribute. */
  readonly contributionTiming?: ContributionTiming;
  /** Defaults to 10,000. */
  readonly runs?: number;
  /** Fixed by default, so the same inputs always give the same picture. */
  readonly seed?: number;
}

export interface Band {
  readonly p10: Money;
  readonly p25: Money;
  readonly median: Money;
  readonly p75: Money;
  readonly p90: Money;
}

export interface SimulationYear {
  readonly year: number;
  readonly band: Band;
}

export interface Simulation {
  readonly runs: number;
  readonly model: string;
  /** Percentile bands per year — the shape a fan chart draws. */
  readonly years: readonly SimulationYear[];
  readonly finalValue: Band & { readonly mean: Money };
  /**
   * Every run's ending balance, ascending. Raw, and kept because it is what
   * {@link chanceOfReaching} needs to answer questions the bands cannot.
   */
  readonly endingValues: readonly number[];
}

const DEFAULT_RUNS = 10_000;
const DEFAULT_SEED = 0x5eed;

export function simulate(input: SimulationInput): Simulation {
  const {
    startingValue,
    annualContribution,
    contributionSchedule,
    years,
    returns,
    contributionGrowth = 0,
    contributionTiming = 'monthly',
    runs = DEFAULT_RUNS,
    seed = DEFAULT_SEED,
  } = input;

  if (years < 1) throw new RangeError('Simulation needs at least one year');
  if (runs < 1) throw new RangeError('Simulation needs at least one run');

  const weight = TIMING_WEIGHT[contributionTiming];
  const start = startingValue.toNumber();

  /**
   * Contributions, resolved to one float per year before any run begins.
   *
   * Both paths collapse here — the scalar compounds its growth rate, the
   * schedule is read straight across — so the inner loop indexes an array
   * instead of carrying a running multiply. Same work, one shape, and the
   * sanctioned float loop (ground rule 2) is no less honest for it.
   */
  const contributions = new Float64Array(years);
  if (contributionSchedule) {
    for (let year = 0; year < years; year += 1) {
      contributions[year] = contributionSchedule[year]?.toNumber() ?? 0;
    }
  } else {
    let running = annualContribution.toNumber();
    for (let year = 0; year < years; year += 1) {
      contributions[year] = running;
      running *= 1 + contributionGrowth;
    }
  }

  const rng = mulberry32(seed);
  const nextReturn = returns.sampler(rng);

  // Laid out year-major: percentiles are computed per year, and sorting a
  // contiguous row beats gathering a column out of every run.
  const byYear: Float64Array[] = Array.from({ length: years }, () => new Float64Array(runs));

  for (let run = 0; run < runs; run += 1) {
    let balance = start;

    for (let year = 0; year < years; year += 1) {
      const rate = nextReturn();
      const contribution = contributions[year]!;
      // Contributions earn a fraction of the year's return according to when
      // they land — the same weighting the deterministic projection applies.
      balance += contribution + balance * rate + contribution * rate * weight;
      byYear[year]![run] = balance;
    }
  }

  for (const row of byYear) row.sort();

  const ending = byYear[years - 1]!;
  const mean = ending.reduce((a, b) => a + b, 0) / runs;

  return {
    runs,
    model: returns.name,
    years: byYear.map((row, i) => ({ year: i + 1, band: bandOf(row) })),
    finalValue: { ...bandOf(ending), mean: Money.fromNumber(mean) },
    endingValues: Array.from(ending),
  };
}

/**
 * How often a run ended at or above `target`.
 *
 * The "am I going to be all right?" question, and the reason the raw ending
 * values are kept. A probability is a far more useful answer than a projected
 * balance, because it admits it is a probability.
 */
export function chanceOfReaching(simulation: Simulation, target: Money): number {
  const goal = target.toNumber();
  const values = simulation.endingValues;

  // Ascending, so binary search for the first run that cleared the target.
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (values[mid]! < goal) low = mid + 1;
    else high = mid;
  }
  return (values.length - low) / values.length;
}

// --------------------------------------------------------------- from history

/**
 * The household's own annual returns, as simulation input.
 *
 * Twenty years of a real portfolio is a small sample and a biased one — it is
 * the returns of accounts that happened to be held, over a period that happened
 * to occur. It is also honest in a way a textbook assumption is not, and it is
 * *theirs*.
 */
export function observedReturns(
  history: History,
  source: 'portfolio' | 'benchmark' = 'portfolio',
): number[] {
  return history.years
    .filter(
      (y) =>
        y.recorded &&
        !y.partial &&
        (!y.startValue.isZero() || !y.contributions.isZero()),
    )
    .map((y) => (source === 'benchmark' ? y.benchmark : y.twr))
    .filter((r): r is number => r !== null);
}

function percentile(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

function bandOf(sorted: Float64Array): Band {
  return {
    p10: Money.fromNumber(percentile(sorted, 0.1)),
    p25: Money.fromNumber(percentile(sorted, 0.25)),
    median: Money.fromNumber(percentile(sorted, 0.5)),
    p75: Money.fromNumber(percentile(sorted, 0.75)),
    p90: Money.fromNumber(percentile(sorted, 0.9)),
  };
}
