import { describe, expect, it } from 'vitest';
import { isoDate, m, type DatedBalance } from '../src/index.js';
import { netWorthNow, netWorthSeries } from '../src/aggregate.js';

const at = (when: string, amount: string): DatedBalance => ({
  asOf: isoDate(when),
  amount: m(amount),
});

describe('netting two series against each other', () => {
  const points = netWorthSeries(
    [at('2026-01-31', '100000'), at('2026-03-31', '110000')],
    [at('2026-01-31', '20000'), at('2026-02-28', '18000')],
  );

  it('emits a point wherever either side moved', () => {
    expect(points.map((p) => p.asOf)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('carries the other side forward rather than dropping it', () => {
    // Assets did not move in February; the January figure still applies.
    expect(points[1]!.assets.format()).toBe('$100,000.00');
    expect(points[1]!.debts.format()).toBe('$18,000.00');
    expect(points[1]!.net.format()).toBe('$82,000.00');
  });

  it('nets the two, with the sign in the subtraction', () => {
    expect(points[2]!.net.format()).toBe('$92,000.00');
  });
});

describe('owing more than you hold', () => {
  it('reports a negative net worth rather than clamping it', () => {
    const [only] = netWorthSeries([at('2026-01-31', '5000')], [at('2026-01-31', '19000')]);

    expect(only!.net.isNegative()).toBe(true);
    expect(only!.net.format()).toBe('-$14,000.00');
  });
});

describe('what has and has not been observed', () => {
  it('marks a side unobserved before its first reading', () => {
    // Debts start in March; January and February carry zero, which is the right
    // number to carry and not a measurement.
    const points = netWorthSeries(
      [at('2026-01-31', '100000'), at('2026-02-28', '105000')],
      [at('2026-03-31', '20000')],
    );

    expect(points.map((p) => p.debtsObserved)).toEqual([false, false, true]);
    expect(points.map((p) => p.assetsObserved)).toEqual([true, true, true]);
  });

  it('cannot tell "owes nothing" from "owes an unrecorded amount"', () => {
    // Both arrive as an empty series, and this function has no way to know which
    // it was handed. It says so instead of guessing — the caller knows whether
    // any loans exist, and §17.2 explains why that is the right place for it.
    const points = netWorthSeries([at('2026-01-31', '100000')], []);

    expect(points[0]!.debts.isZero()).toBe(true);
    expect(points[0]!.debtsObserved).toBe(false);
    // The net figure is still emitted, and is still the caller's to caveat.
    expect(points[0]!.net.format()).toBe('$100,000.00');
  });

  it('says nothing at all when neither side has been seen', () => {
    expect(netWorthSeries([], [])).toEqual([]);
    expect(netWorthNow([])).toBeNull();
  });
});

describe('the latest position', () => {
  it('is the most recent point, not the largest', () => {
    const points = netWorthSeries(
      [at('2026-01-31', '200000'), at('2026-06-30', '150000')],
      [at('2026-01-31', '10000')],
    );

    // A fall is still the current position. Reporting the peak would be the
    // same class of flattery as ignoring an unobserved debt.
    expect(netWorthNow(points)!.asOf).toBe('2026-06-30');
    expect(netWorthNow(points)!.net.format()).toBe('$140,000.00');
  });
});

describe('the function is deliberately ignorant of what it nets', () => {
  it('does not care which series is which', () => {
    // Swapping the arguments negates the result exactly. That is the property
    // that guarantees no special case for assets or debts has crept in — and a
    // special case here would be a subtle lie about someone's position.
    const a = [at('2026-01-31', '100000')];
    const b = [at('2026-01-31', '30000')];

    const forward = netWorthSeries(a, b)[0]!;
    const backward = netWorthSeries(b, a)[0]!;

    expect(forward.net.toString()).toBe(backward.net.negate().toString());
  });

  it('handles dates arriving out of order', () => {
    const points = netWorthSeries(
      [at('2026-03-31', '110000'), at('2026-01-31', '100000')],
      [at('2026-02-28', '18000')],
    );

    expect(points.map((p) => p.asOf)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(points[2]!.net.format()).toBe('$92,000.00');
  });

  it('does not duplicate a date both sides share', () => {
    const points = netWorthSeries([at('2026-01-31', '100')], [at('2026-01-31', '40')]);

    expect(points).toHaveLength(1);
    expect(points[0]!.net.format()).toBe('$60.00');
  });
});
