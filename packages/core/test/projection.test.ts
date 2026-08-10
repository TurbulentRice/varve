import { describe, expect, it } from 'vitest';
import { m, Money } from '../src/money.js';
import { milestonesFor, project, yearReaching } from '../src/projection.js';

const LEGACY = {
  annualReturn: 0.07, // cell AC2
  annualContribution: m('10000'), // cell AD2
} as const;

describe('legacy parity', () => {
  it('reproduces the spreadsheet formula exactly', () => {
    // I(n+1) = I(n) * (1 + AC2) + AD2, with the contribution added at year end.
    const [first] = project(m('100000'), 2025, { ...LEGACY, years: 1 });
    expect(first!.endValue.toString()).toBe('117000.0000');
    expect(first!.growth.toString()).toBe('7000.0000');
    expect(first!.year).toBe(2026);
  });

  it('compounds across years the way the spreadsheet rows do', () => {
    const years = project(m('100000'), 2025, { ...LEGACY, years: 3 });
    expect(years.map((y) => y.endValue.toString())).toEqual([
      '117000.0000',
      '135190.0000',
      '154653.3000',
    ]);
  });
});

describe('contribution timing', () => {
  const base = { ...LEGACY, years: 1 } as const;

  it('gives an up-front contribution a full year of growth', () => {
    const [year] = project(m('100000'), 2025, { ...base, contributionTiming: 'start' });
    expect(year!.growth.toString()).toBe('7700.0000'); // 7000 + 700
  });

  it('gives an even monthly contribution about half', () => {
    const [year] = project(m('100000'), 2025, { ...base, contributionTiming: 'monthly' });
    expect(year!.growth.toString()).toBe('7350.0000');
  });

  it('orders the three timings as expected', () => {
    const at = (timing: 'start' | 'monthly' | 'end') =>
      project(m('100000'), 2025, { ...base, contributionTiming: timing })[0]!.endValue;
    expect(at('start').compare(at('monthly'))).toBe(1);
    expect(at('monthly').compare(at('end'))).toBe(1);
  });
});

describe('accumulation', () => {
  it('tracks contributions and growth separately', () => {
    const years = project(m('0'), 2025, { ...LEGACY, years: 10 });
    const last = years[9]!;

    expect(last.cumulativeContributions.toString()).toBe('100000.0000');
    // Everything above what was put in has to be growth.
    expect(
      last.cumulativeContributions.plus(last.cumulativeGrowth).minus(last.endValue).toString(),
    ).toBe('0.0000');
  });

  it('escalates contributions when asked', () => {
    const years = project(m('0'), 2025, { ...LEGACY, years: 2, contributionGrowth: 0.03 });
    expect(years[0]!.contribution.toString()).toBe('10000.0000');
    expect(years[1]!.contribution.toString()).toBe('10300.0000');
  });

  it('projects nothing for a zero horizon', () => {
    expect(project(m('100000'), 2025, { ...LEGACY, years: 0 })).toEqual([]);
  });

  it('refuses a negative horizon', () => {
    expect(() => project(m('1'), 2025, { ...LEGACY, years: -1 })).toThrow(RangeError);
  });
});

describe('milestones', () => {
  it('finds the year a target is first reached', () => {
    const years = project(m('500000'), 2025, { ...LEGACY, years: 30 });
    const millionth = yearReaching(years, m('1000000'));
    expect(millionth).not.toBeNull();
    expect(millionth!.endValue.compare(m('1000000'))).toBeGreaterThanOrEqual(0);
    // The year before must still be short of it.
    const previous = years[years.indexOf(millionth!) - 1];
    expect(previous!.endValue.compare(m('1000000'))).toBe(-1);
  });

  it('returns null when the target is out of reach', () => {
    const years = project(m('1000'), 2025, { ...LEGACY, years: 2 });
    expect(yearReaching(years, m('99999999'))).toBeNull();
  });

  it('places the ages the legacy sheet flagged', () => {
    const milestones = milestonesFor(1960, 2040);
    const byLabel = new Map(milestones.map((x) => [x.label, x.year]));
    expect(byLabel.get('Early Social Security')).toBe(2022);
    expect(byLabel.get('Medicare')).toBe(2025);
  });

  it('stops at the horizon', () => {
    // The earliest milestone is 59.5, which for a 1960 birth year lands in 2020.
    expect(milestonesFor(1960, 2019)).toHaveLength(0);
    expect(milestonesFor(1960, 2020).map((x) => x.label)).toEqual(['Penalty-free withdrawals']);
  });

  it('keeps milestones in chronological order', () => {
    const years = milestonesFor(1970, 2060).map((x) => x.year);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
  });
});

describe('exactness under compounding', () => {
  it('never accumulates float error across a long horizon', () => {
    const years = project(m('1000000'), 2025, { ...LEGACY, years: 40 });
    for (const year of years) {
      // Every value stays on the 4-decimal grid — no drift, no 0.30000000004.
      expect(year.endValue.toString()).toMatch(/^\d+\.\d{4}$/);
      expect(
        year.startValue.plus(year.contribution).plus(year.growth).minus(year.endValue).toString(),
      ).toBe('0.0000');
    }
    expect(Money.sum(years.map((y) => y.growth)).isPositive()).toBe(true);
  });
});
