import { describe, expect, it } from 'vitest';
import { Money, m, project } from '@varve/core';
import { mulberry32, standardNormal } from '../src/random.js';
import {
  blockBootstrap,
  bootstrap,
  chanceOfReaching,
  fixed,
  normal,
  observedReturns,
  simulate,
  type SimulationInput,
} from '../src/simulate.js';

const base: Omit<SimulationInput, 'returns'> = {
  startingValue: m('100000'),
  annualContribution: m('10000'),
  years: 20,
  runs: 2_000,
};

describe('randomness', () => {
  it('produces the same sequence for the same seed', () => {
    const a = Array.from({ length: 5 }, mulberry32(42));
    const b = Array.from({ length: 5 }, mulberry32(42));
    expect(a).toEqual(b);
  });

  it('produces different sequences for different seeds', () => {
    expect(Array.from({ length: 5 }, mulberry32(1))).not.toEqual(
      Array.from({ length: 5 }, mulberry32(2)),
    );
  });

  it('stays inside [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 10_000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('draws a standard normal with roughly the right shape', () => {
    const next = standardNormal(mulberry32(3));
    const samples = Array.from({ length: 50_000 }, next);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;

    expect(mean).toBeCloseTo(0, 1);
    expect(Math.sqrt(variance)).toBeCloseTo(1, 1);
  });
});

describe('return models', () => {
  it('resamples only values that were actually observed', () => {
    const observed = [0.1, -0.2, 0.3];
    const draw = bootstrap(observed).sampler(mulberry32(1));
    for (let i = 0; i < 500; i += 1) expect(observed).toContain(draw());
  });

  it('draws contiguous runs when blocking', () => {
    const observed = [0, 1, 2, 3, 4];
    const draw = blockBootstrap(observed, 3).sampler(mulberry32(9));
    const block = [draw(), draw(), draw()];

    // Consecutive in the source series, wrapping at the end.
    const start = observed.indexOf(block[0]!);
    expect(block[1]).toBe(observed[(start + 1) % observed.length]);
    expect(block[2]).toBe(observed[(start + 2) % observed.length]);
  });

  it('refuses to bootstrap from nothing', () => {
    expect(() => bootstrap([])).toThrow(RangeError);
    expect(() => blockBootstrap([0.1], 0)).toThrow(RangeError);
  });

  it('names itself, so a result can say how it was produced', () => {
    expect(simulate({ ...base, returns: bootstrap([0.05]) }).model).toBe('bootstrap');
    expect(simulate({ ...base, returns: blockBootstrap([0.05], 4) }).model).toContain('4');
  });
});

describe('simulation', () => {
  it('reproduces the deterministic projection when the rate never varies', () => {
    // A fixed model has no spread, so every percentile must land on the same
    // value — and that value must match what `project` computes exactly.
    const rate = 0.07;
    const run = simulate({
      ...base,
      years: 10,
      runs: 50,
      returns: fixed(rate),
      contributionTiming: 'end',
    });

    const deterministic = project(m('100000'), 0, {
      annualReturn: rate,
      annualContribution: m('10000'),
      years: 10,
      contributionTiming: 'end',
    });

    const expected = deterministic[9]!.endValue.toNumber();
    expect(run.finalValue.median.toNumber()).toBeCloseTo(expected, 2);
    expect(run.finalValue.p10.toNumber()).toBeCloseTo(expected, 2);
    expect(run.finalValue.p90.toNumber()).toBeCloseTo(expected, 2);
  });

  it('is reproducible for a given seed and different across seeds', () => {
    const returns = bootstrap([0.2, -0.1, 0.15, -0.05]);
    const a = simulate({ ...base, returns, seed: 1 });
    const b = simulate({ ...base, returns, seed: 1 });
    const c = simulate({ ...base, returns, seed: 2 });

    expect(a.finalValue.median.toString()).toBe(b.finalValue.median.toString());
    expect(a.finalValue.median.toString()).not.toBe(c.finalValue.median.toString());
  });

  it('orders its percentiles', () => {
    const run = simulate({ ...base, returns: bootstrap([0.25, -0.15, 0.1]) });
    for (const { band } of run.years) {
      expect(band.p10.compare(band.p25)).toBeLessThanOrEqual(0);
      expect(band.p25.compare(band.median)).toBeLessThanOrEqual(0);
      expect(band.median.compare(band.p75)).toBeLessThanOrEqual(0);
      expect(band.p75.compare(band.p90)).toBeLessThanOrEqual(0);
    }
  });

  it('widens as the horizon lengthens', () => {
    // Uncertainty compounds; a fan chart should visibly fan.
    const run = simulate({ ...base, returns: bootstrap([0.25, -0.15, 0.1]) });
    const spread = (i: number) =>
      run.years[i]!.band.p90.minus(run.years[i]!.band.p10).toNumber();

    expect(spread(19)).toBeGreaterThan(spread(9));
    expect(spread(9)).toBeGreaterThan(spread(0));
  });

  it('returns one band per year', () => {
    const run = simulate({ ...base, years: 7, returns: fixed(0.05) });
    expect(run.years).toHaveLength(7);
    expect(run.years.map((y) => y.year)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('rejects a horizon or run count of nothing', () => {
    expect(() => simulate({ ...base, years: 0, returns: fixed(0.05) })).toThrow(RangeError);
    expect(() => simulate({ ...base, runs: 0, returns: fixed(0.05) })).toThrow(RangeError);
  });

  it('shows sequence risk that a fixed rate cannot', () => {
    // Same average return, but drawn in varying order. The spread between a
    // good sequence and a bad one is the entire point of simulating.
    const swings = [0.4, -0.25, 0.3, -0.2, 0.25, -0.1];
    const average = swings.reduce((a, b) => a + b, 0) / swings.length;

    const varied = simulate({ ...base, returns: bootstrap(swings), seed: 11 });
    const steady = simulate({ ...base, returns: fixed(average), seed: 11 });

    expect(varied.finalValue.p10.compare(steady.finalValue.median)).toBe(-1);
    expect(varied.finalValue.p90.compare(steady.finalValue.median)).toBe(1);
  });

  it('is not distorted by contribution timing beyond what timing implies', () => {
    const returns = fixed(0.08);
    const upFront = simulate({ ...base, returns, contributionTiming: 'start' });
    const atEnd = simulate({ ...base, returns, contributionTiming: 'end' });
    expect(upFront.finalValue.median.compare(atEnd.finalValue.median)).toBe(1);
  });
});

describe('chance of reaching a target', () => {
  const run = simulate({ ...base, returns: bootstrap([0.2, -0.1, 0.15, -0.05]), seed: 5 });

  it('is certain about a target every run cleared', () => {
    expect(chanceOfReaching(run, m('0'))).toBe(1);
  });

  it('is hopeless about a target no run reached', () => {
    expect(chanceOfReaching(run, m('999999999'))).toBe(0);
  });

  it('falls monotonically as the target rises', () => {
    const targets = ['100000', '250000', '500000', '1000000'].map(m);
    const chances = targets.map((t) => chanceOfReaching(run, t));
    for (let i = 1; i < chances.length; i += 1) {
      expect(chances[i]!).toBeLessThanOrEqual(chances[i - 1]!);
    }
  });

  it('agrees with the median at fifty-fifty', () => {
    const chance = chanceOfReaching(run, run.finalValue.median);
    expect(chance).toBeGreaterThan(0.45);
    expect(chance).toBeLessThan(0.55);
  });
});

describe('seeding from observed history', () => {
  const year = (
    twr: number,
    benchmark: number,
    extra: Partial<{ recorded: boolean; partial: boolean; startValue: Money; contributions: Money }> = {},
  ) => ({
    twr,
    benchmark,
    recorded: true,
    partial: false,
    startValue: m('100'),
    contributions: m('0'),
    ...extra,
  });

  const history = {
    years: [
      year(0.1, 0.12),
      year(-0.2, -0.18),
      year(0.15, 0.2),
      // Still in progress: an incomplete year is not a year's return.
      year(0.03, 0.04, { partial: true }),
      // Opened with a transfer — nothing at risk, nothing contributed.
      year(0, 0.05, { startValue: Money.zero(), contributions: Money.zero() }),
      // A gap in the record. Resampling it would feed the simulation a 0% year
      // that nobody ever lived through.
      year(0, 0.06, { recorded: false }),
    ],
  } as unknown as Parameters<typeof observedReturns>[0];

  it('takes the portfolio returns, skipping partial, opening and unrecorded years', () => {
    expect(observedReturns(history)).toEqual([0.1, -0.2, 0.15]);
  });

  it('can take the benchmark instead', () => {
    expect(observedReturns(history, 'benchmark')).toEqual([0.12, -0.18, 0.2]);
  });

  it('feeds straight into a simulation', () => {
    const run = simulate({ ...base, runs: 500, returns: bootstrap(observedReturns(history)) });
    expect(run.finalValue.median.isPositive()).toBe(true);
  });
});

describe('normal model', () => {
  it('centres on the mean it was given', () => {
    const run = simulate({
      startingValue: m('1000'),
      annualContribution: m('0'),
      years: 1,
      runs: 20_000,
      returns: normal(0.07, 0.15),
      seed: 4,
    });
    // One year, no contributions: the median ends near 1000 * 1.07.
    expect(run.finalValue.median.toNumber()).toBeCloseTo(1070, -1);
  });
});
