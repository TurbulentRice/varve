import { describe, expect, it } from 'vitest';
import { m, Money } from '../src/money.js';
import { isoDate, midpoint, quarterEnd, yearEnd, type IsoDate } from '../src/time.js';
import {
  annualize,
  chainLink,
  feeDrag,
  modifiedDietz,
  organicGain,
  simpleOrganicReturn,
  timeWeightedReturn,
  totalGain,
  type DatedBalance,
} from '../src/returns.js';
import { accountId, flowId, type Flow, type FlowKind } from '../src/types.js';

const ACCOUNT = accountId('a1');
let sequence = 0;

function flow(occurredOn: IsoDate, amount: string, kind: FlowKind = 'contribution'): Flow {
  sequence += 1;
  return { id: flowId(`f${sequence}`), accountId: ACCOUNT, occurredOn, amount: m(amount), kind };
}

function balance(asOf: IsoDate, amount: string): DatedBalance {
  return { asOf, amount: m(amount) };
}

describe('modified Dietz', () => {
  it('reduces to plain growth when nothing moves', () => {
    const rate = modifiedDietz({
      range: { start: yearEnd(2019), end: yearEnd(2020) },
      startValue: m('1000'),
      endValue: m('1100'),
      flows: [],
    });
    expect(rate).toBeCloseTo(0.1, 12);
  });

  it('weights a contribution by the time it was actually invested', () => {
    const range = { start: yearEnd(2019), end: yearEnd(2020) };
    const halfway = midpoint(range.start, range.end);

    // $100 in at the halfway point earns half a year, so the denominator is
    // 1000 + 50, not 1000 (naive) and not 1100 (fully weighted).
    const rate = modifiedDietz({
      range,
      startValue: m('1000'),
      endValue: m('1200'),
      flows: [{ occurredOn: halfway, amount: m('100') }],
    });
    expect(rate).toBeCloseTo(100 / 1050, 3);
  });

  it('gives a last-day contribution no weight at all', () => {
    const rate = modifiedDietz({
      range: { start: yearEnd(2019), end: yearEnd(2020) },
      startValue: m('1000'),
      endValue: m('1200'),
      flows: [{ occurredOn: yearEnd(2020), amount: m('100') }],
    });
    expect(rate).toBeCloseTo(0.1, 12); // 100 gain on 1000
  });

  it('gives a first-day contribution full weight', () => {
    const start = yearEnd(2019);
    const rate = modifiedDietz({
      range: { start, end: yearEnd(2020) },
      startValue: m('1000'),
      endValue: m('1200'),
      flows: [{ occurredOn: isoDate('2020-01-01'), amount: m('100') }],
    });
    expect(rate).toBeCloseTo(100 / 1100, 2);
    expect(start).toBe('2019-12-31');
  });

  it('returns zero when no capital was ever at risk', () => {
    expect(
      modifiedDietz({
        range: { start: yearEnd(2019), end: yearEnd(2020) },
        startValue: Money.zero(),
        endValue: Money.zero(),
        flows: [],
      }),
    ).toBe(0);
  });
});

describe('the telescoping identity', () => {
  // This is the property that proves the implementation: with no external
  // flows, chain-linking quarterly returns must collapse exactly to the naive
  // annual formula, because V1/V0 * V2/V1 * V3/V2 * V4/V3 = V4/V0.
  it('makes chain-linked TWR equal the simple return when nothing moves', () => {
    const balances = [
      balance(yearEnd(2019), '1000'),
      balance(quarterEnd(2020, 1), '900'),
      balance(quarterEnd(2020, 2), '1150'),
      balance(quarterEnd(2020, 3), '1080'),
      balance(quarterEnd(2020, 4), '1234.5678'),
    ];

    const twr = timeWeightedReturn(balances, []);
    const naive = simpleOrganicReturn(m('1000'), m('1234.5678'), Money.zero());

    expect(twr.rate).toBeCloseTo(naive, 12);
  });

  it('diverges precisely when contributions are involved', () => {
    const balances = [balance(yearEnd(2019), '1000'), balance(yearEnd(2020), '1200')];
    const contributions = [flow(midpoint(yearEnd(2019), yearEnd(2020)), '100')];

    const twr = timeWeightedReturn(balances, contributions);
    const naive = simpleOrganicReturn(m('1000'), m('1200'), m('100'));

    expect(naive).toBeCloseTo(0.1, 12); // (1200 - 1000 - 100) / 1000
    expect(twr.rate).toBeLessThan(naive); // ...but the money was only in for half the year
  });
});

describe('a heavily-contributed year', () => {
  // The shape that breaks the legacy formula: a modest starting balance and
  // contributions arriving all year, most of them late. Dividing the gain by
  // starting capital alone credits December's money with a full year of growth.
  const quarters = [
    { end: yearEnd(2019), value: '20000', contribution: null },
    { end: quarterEnd(2020, 1), value: '20000', contribution: '2000' },
    { end: quarterEnd(2020, 2), value: '28000', contribution: '4000' },
    { end: quarterEnd(2020, 3), value: '33000', contribution: '2000' },
    { end: quarterEnd(2020, 4), value: '44000', contribution: '10000' },
  ] as const;

  const balances = quarters.map((q) => balance(q.end, q.value));
  const flows = quarters.flatMap((q, i) =>
    q.contribution ? [flow(midpoint(quarters[i - 1]!.end, q.end), q.contribution)] : [],
  );
  const netFlow = Money.sum(flows.map((f) => f.amount));

  it('reproduces the legacy figure', () => {
    // (44000 - 20000 - 18000) / 20000
    const naive = simpleOrganicReturn(m('20000'), m('44000'), netFlow);
    expect(naive * 100).toBeCloseTo(30.0, 6);
  });

  it('reports the honest figure', () => {
    const twr = timeWeightedReturn(balances, flows);
    expect(twr.rate * 100).toBeCloseTo(21.1, 1);
  });

  it('quantifies the gap', () => {
    const naive = simpleOrganicReturn(m('20000'), m('44000'), netFlow);
    const twr = timeWeightedReturn(balances, flows).rate;
    const basisPoints = (naive - twr) * 10_000;
    expect(basisPoints).toBeGreaterThan(800);
    expect(basisPoints).toBeLessThan(950);
  });
});

describe('gains', () => {
  it('separates progress from performance', () => {
    const start = m('1000');
    const end = m('1200');
    const contributed = m('150');

    expect(totalGain(start, end).toString()).toBe('200.0000'); // the pile grew
    expect(organicGain(start, end, contributed).toString()).toBe('50.0000'); // it earned
  });

  it('treats a zero starting balance as unmeasurable rather than infinite', () => {
    expect(simpleOrganicReturn(Money.zero(), m('100'), m('100'))).toBe(0);
  });
});

describe('annualization', () => {
  it('leaves a one-year return alone', () => {
    expect(annualize(0.1, 365.25)).toBeCloseTo(0.1, 9);
  });

  it('takes the geometric root over multiple years', () => {
    expect(annualize(1.0, 365.25 * 2)).toBeCloseTo(Math.sqrt(2) - 1, 9);
  });

  it('does not produce NaN from a total loss', () => {
    expect(annualize(-1, 730)).toBe(-1);
    expect(annualize(-1.5, 730)).toBe(-1);
  });

  it('compounds a series', () => {
    expect(chainLink([0.1, 0.1])).toBeCloseTo(0.21, 12);
    expect(chainLink([0.5, -0.5])).toBeCloseTo(-0.25, 12); // gains do not offset losses
    expect(chainLink([])).toBe(0);
  });
});

describe('fee treatment', () => {
  const balances = [balance(yearEnd(2019), '10000'), balance(yearEnd(2020), '10800')];
  const fees = [flow(midpoint(yearEnd(2019), yearEnd(2020)), '-100', 'fee')];

  it('keeps fees inside the return by default', () => {
    const net = timeWeightedReturn(balances, fees);
    expect(net.rate).toBeCloseTo(0.08, 9); // what actually happened
  });

  it('adds them back when asked for gross', () => {
    const gross = timeWeightedReturn(balances, fees, { feeTreatment: 'gross' });
    expect(gross.rate).toBeGreaterThan(0.08);
  });

  it('expresses the difference as drag', () => {
    const drag = feeDrag(balances, fees);
    expect(drag.gross).toBeGreaterThan(drag.net);
    expect(drag.drag).toBeCloseTo(drag.gross - drag.net, 12);
    expect(drag.feesPaid.toString()).toBe('100.0000');
  });

  it('ignores reinvested dividends, which are return rather than flow', () => {
    const withDividend = [...balances];
    const dividends = [flow(midpoint(yearEnd(2019), yearEnd(2020)), '500', 'dividend')];
    expect(timeWeightedReturn(withDividend, dividends).rate).toBeCloseTo(0.08, 9);
  });
});

describe('degenerate input', () => {
  it('returns zero for a single observation', () => {
    expect(timeWeightedReturn([balance(yearEnd(2020), '100')], []).rate).toBe(0);
  });

  it('returns zero for no observations', () => {
    expect(timeWeightedReturn([], []).rate).toBe(0);
  });

  it('sorts observations it is handed out of order', () => {
    const ordered = timeWeightedReturn(
      [balance(yearEnd(2019), '1000'), balance(yearEnd(2020), '1100')],
      [],
    );
    const shuffled = timeWeightedReturn(
      [balance(yearEnd(2020), '1100'), balance(yearEnd(2019), '1000')],
      [],
    );
    expect(shuffled.rate).toBeCloseTo(ordered.rate, 12);
  });
});
