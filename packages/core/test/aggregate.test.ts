import { describe, expect, it } from 'vitest';
import { m, Money } from '../src/money.js';
import { isoDate, quarterEnd, yearEnd, type IsoDate } from '../src/time.js';
import {
  aggregateBalances,
  arithmeticMean,
  balanceAsOf,
  externalFlowsForGroup,
  geometricMean,
  rollingAverage,
  summarizeYear,
} from '../src/aggregate.js';
import {
  accountId,
  flowId,
  observationId,
  type BalanceObservation,
  type Flow,
  type FlowKind,
} from '../src/types.js';

const A = accountId('a');
const B = accountId('b');
let seq = 0;

function obs(asOf: IsoDate, amount: string, account = A): BalanceObservation {
  seq += 1;
  return {
    id: observationId(`o${seq}`),
    accountId: account,
    asOf,
    amount: m(amount),
    source: 'manual',
  };
}

function flow(
  occurredOn: IsoDate,
  amount: string,
  kind: FlowKind = 'contribution',
  account = A,
  counterparty?: typeof A,
): Flow {
  seq += 1;
  return {
    id: flowId(`f${seq}`),
    accountId: account,
    occurredOn,
    amount: m(amount),
    kind,
    ...(counterparty ? { counterpartyAccountId: counterparty } : {}),
  };
}

describe('balanceAsOf', () => {
  const history = [
    obs(quarterEnd(2020, 1), '100'),
    obs(quarterEnd(2020, 2), '200'),
    obs(quarterEnd(2020, 3), '300'),
  ];

  it('generalizes the legacy Q4-then-Q3-then-Q2 fallback', () => {
    // The year is incomplete; the answer is the latest quarter that exists.
    const at = balanceAsOf(history, yearEnd(2020));
    expect(at.amount.toString()).toBe('300.0000');
    expect(at.asOf).toBe('2020-09-30');
    expect(at.missing).toBe(false);
  });

  it('reports the date it actually came from, so staleness is visible', () => {
    expect(balanceAsOf(history, isoDate('2020-08-15')).asOf).toBe('2020-06-30');
  });

  it('never looks into the future', () => {
    expect(balanceAsOf(history, isoDate('2020-02-01')).missing).toBe(true);
    expect(balanceAsOf(history, isoDate('2020-02-01')).amount.isZero()).toBe(true);
  });

  it('answers zero once a closing observation exists', () => {
    const closed = [...history, obs(isoDate('2021-01-01'), '0')];
    expect(balanceAsOf(closed, yearEnd(2021)).amount.isZero()).toBe(true);
  });

  it('is order-independent', () => {
    expect(balanceAsOf([...history].reverse(), yearEnd(2020)).amount.toString()).toBe('300.0000');
  });
});

describe('summarizeYear', () => {
  const observations = [
    obs(yearEnd(2019), '10000'),
    obs(quarterEnd(2020, 2), '11000'),
    obs(yearEnd(2020), '13000'),
  ];
  const flows = [flow(isoDate('2020-06-30'), '1000')];

  it('separates the pile growing from the money earning', () => {
    const summary = summarizeYear(observations, flows, 2020);
    expect(summary.totalGain.toString()).toBe('3000.0000');
    expect(summary.organicGain.toString()).toBe('2000.0000');
  });

  it('reports both the trustworthy return and the legacy one', () => {
    const summary = summarizeYear(observations, flows, 2020);
    expect(summary.simpleReturn).toBeCloseTo(0.2, 9); // 2000 / 10000
    expect(summary.twr).toBeLessThan(summary.simpleReturn);
  });

  it('breaks flows out by kind', () => {
    const withFees = [...flows, flow(isoDate('2020-06-30'), '-50', 'fee')];
    const summary = summarizeYear(observations, withFees, 2020);
    expect(summary.byKind.contribution.toString()).toBe('1000.0000');
    expect(summary.byKind.fee.toString()).toBe('-50.0000');
    // Fees are a cost of investing, not money leaving the household.
    expect(summary.netExternalFlow.toString()).toBe('1000.0000');
  });

  it('ignores flows outside the period', () => {
    const straddling = [...flows, flow(yearEnd(2019), '9999'), flow(isoDate('2021-06-30'), '9999')];
    expect(summarizeYear(observations, straddling, 2020).byKind.contribution.toString()).toBe(
      '1000.0000',
    );
  });
});

describe('grouping', () => {
  it('removes both halves of an internal transfer', () => {
    const flows = [
      flow(isoDate('2020-01-01'), '-500', 'transfer_out', A, B),
      flow(isoDate('2020-01-01'), '500', 'transfer_in', B, A),
      flow(isoDate('2020-06-30'), '100', 'contribution', A),
    ];
    const external = externalFlowsForGroup(flows, new Set([A, B]));
    expect(external).toHaveLength(1);
    expect(external[0]!.kind).toBe('contribution');
  });

  it('keeps a transfer whose counterparty is outside the group', () => {
    const flows = [flow(isoDate('2020-01-01'), '-500', 'transfer_out', A, B)];
    expect(externalFlowsForGroup(flows, new Set([A]))).toHaveLength(1);
  });

  it('sums balances across accounts at every observed date', () => {
    const combined = aggregateBalances(
      new Map([
        [A, [obs(yearEnd(2019), '100', A), obs(yearEnd(2020), '150', A)]],
        [B, [obs(yearEnd(2020), '50', B)]],
      ]),
    );
    expect(combined).toHaveLength(2);
    expect(combined[0]!.amount.toString()).toBe('100.0000'); // B not open yet
    expect(combined[1]!.amount.toString()).toBe('200.0000');
  });
});

describe('averaging returns', () => {
  it('shows why the arithmetic mean flatters a volatile series', () => {
    // +50% then -50% leaves you down 25%, but averages to zero.
    expect(arithmeticMean([0.5, -0.5])).toBeCloseTo(0, 12);
    expect(geometricMean([0.5, -0.5])).toBeCloseTo(Math.sqrt(0.75) - 1, 12);
    expect(geometricMean([0.5, -0.5])).toBeLessThan(0);
  });

  it('agrees with itself on a constant series', () => {
    expect(geometricMean([0.07, 0.07, 0.07])).toBeCloseTo(0.07, 12);
    expect(arithmeticMean([0.07, 0.07, 0.07])).toBeCloseTo(0.07, 12);
  });

  it('treats a total loss as unrecoverable', () => {
    expect(geometricMean([-1, 5])).toBe(-1);
  });

  it('withholds a rolling average until the window is full', () => {
    const rolling = rollingAverage([0.1, 0.2, 0.3, 0.4], 3);
    expect(rolling.slice(0, 2)).toEqual([null, null]);
    expect(rolling[2]).toBeCloseTo(geometricMean([0.1, 0.2, 0.3]), 12);
    expect(rolling[3]).toBeCloseTo(geometricMean([0.2, 0.3, 0.4]), 12);
  });

  it('handles empty input', () => {
    expect(geometricMean([])).toBe(0);
    expect(arithmeticMean([])).toBe(0);
    expect(rollingAverage([], 5)).toEqual([]);
  });
});

describe('money aggregation stays exact', () => {
  it('does not drift over hundreds of observations', () => {
    const observations = Array.from({ length: 400 }, (_, i) =>
      obs(isoDate(`20${String(10 + Math.floor(i / 12)).padStart(2, '0')}-01-01`), '0.0001'),
    );
    expect(Money.sum(observations.map((o) => o.amount)).toString()).toBe('0.0400');
  });
});
