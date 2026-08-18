/**
 * What the Overview's chart plots, given what is selected.
 *
 * The branch is small; what is worth pinning is the behaviour around it. That
 * selecting rows changes the *mode* rather than filtering one — net worth is not
 * an account balance — and that colour follows the account rather than its rank
 * among the chosen, because a chart that repaints its survivors when one is
 * removed teaches a reader not to trust it.
 */

import { describe, expect, it } from 'vitest';
import { isoDate, m } from '@varve/core';
import type { AnnualNetWorth } from '../src/lib/net-worth.js';
import { MAX_SERIES, overviewSeries, type PlottableAccount } from '../src/lib/overview-series.js';

/**
 * Built against `PlottableAccount` rather than cast to `AccountHistory`.
 *
 * The first draft cast an incomplete object and CI caught it — which was the
 * right outcome, because a cast would have meant this fixture stopped noticing
 * if the real shape moved underneath it (§31.9).
 */
function account(id: string, name: string, years: number[]): PlottableAccount {
  return {
    account: { id, name },
    years: years.map((year, i) => ({
      year,
      endValue: m(String((i + 1) * 1000)),
      recorded: true,
    })),
  };
}

const netWorth: AnnualNetWorth[] = [2020, 2021, 2022, 2023].map((year, i) => ({
  year,
  asOf: isoDate(`${year}-12-31`),
  assets: m(String((i + 1) * 10_000)),
  debts: m('0'),
  net: m(String((i + 1) * 10_000)),
  recorded: true,
  debtsObserved: false,
}));

const ACCOUNTS = [
  account('acct:1', 'Ada IRA', [2020, 2021, 2022, 2023]),
  account('acct:2', 'Ben IRA', [2020, 2021, 2022, 2023]),
  account('acct:3', 'Joint', [2020, 2021, 2022, 2023]),
];

describe('nothing selected', () => {
  it('plots net worth, and says so', () => {
    // The household answer, not the sum of the accounts — those differ the
    // moment a loan exists, which is why the caption names the mode (§31.3).
    const out = overviewSeries({ netWorth, accounts: ACCOUNTS, selected: [], range: 'all' });

    expect(out.isNetWorth).toBe(true);
    expect(out.caption).toBe('Net worth');
    expect(out.series).toHaveLength(1);
    expect(out.series[0]!.points.map((p) => p.amount.format())).toEqual([
      '$10,000.00',
      '$20,000.00',
      '$30,000.00',
      '$40,000.00',
    ]);
  });
});

describe('accounts selected', () => {
  it('plots one line each, and stops calling it net worth', () => {
    const out = overviewSeries({
      netWorth,
      accounts: ACCOUNTS,
      selected: ['acct:1', 'acct:2'],
      range: 'all',
    });

    expect(out.isNetWorth).toBe(false);
    expect(out.caption).toBe('2 accounts');
    expect(out.series.map((s) => s.label)).toEqual(['Ada IRA', 'Ben IRA']);
  });

  it('names the account when only one is chosen', () => {
    const out = overviewSeries({ netWorth, accounts: ACCOUNTS, selected: ['acct:2'], range: 'all' });
    expect(out.caption).toBe('Ben IRA');
  });

  it('keeps a colour with its account when another is deselected', () => {
    // Recolour-on-filter is the anti-pattern: somebody who learned "the Joint
    // account is green" must not find it blue because a sibling went away.
    const three = overviewSeries({
      netWorth,
      accounts: ACCOUNTS,
      selected: ['acct:1', 'acct:2', 'acct:3'],
      range: 'all',
    });
    const one = overviewSeries({ netWorth, accounts: ACCOUNTS, selected: ['acct:3'], range: 'all' });

    const joint = three.series.find((s) => s.id === 'acct:3')!;
    expect(one.series[0]!.slot).toBe(joint.slot);
    expect(joint.slot).toBe(3);
  });

  it('never asks for a slot past the six that were validated', () => {
    const many = Array.from({ length: 9 }, (_, i) => account(`acct:${i}`, `A${i}`, [2020, 2021]));
    const out = overviewSeries({
      netWorth,
      accounts: many,
      selected: many.map((a) => a.account.id),
      range: 'all',
    });

    expect(out.series).toHaveLength(MAX_SERIES);
    for (const s of out.series) {
      expect(s.slot).toBeGreaterThanOrEqual(1);
      expect(s.slot).toBeLessThanOrEqual(MAX_SERIES);
    }
  });
});

describe('how far back to show', () => {
  it('keeps everything on "all"', () => {
    const out = overviewSeries({ netWorth, accounts: ACCOUNTS, selected: [], range: 'all' });
    expect(out.series[0]!.points).toHaveLength(4);
  });

  it('counts back from the last recorded year, not from today', () => {
    // A ledger that stopped in 2023 should still show its own last five years
    // rather than five years of nothing ending now.
    const out = overviewSeries({ netWorth, accounts: ACCOUNTS, selected: [], range: '5' });

    expect(out.series[0]!.points.map((p) => p.year)).toEqual([2020, 2021, 2022, 2023]);
  });

  it('clips to the window when there is more history than the window', () => {
    const long = Array.from({ length: 12 }, (_, i) => ({
      ...netWorth[0]!,
      year: 2012 + i,
      asOf: isoDate(`${2012 + i}-12-31`),
    }));
    const out = overviewSeries({ netWorth: long, accounts: ACCOUNTS, selected: [], range: '5' });

    expect(out.series[0]!.points.map((p) => p.year)).toEqual([2019, 2020, 2021, 2022, 2023]);
  });

  it('applies the window to each account independently', () => {
    // Accounts start and end in different years, so a window counted from one
    // account's last year would cut another's short.
    const mixed = [
      account('acct:1', 'Old', [2015, 2016, 2017, 2018, 2019, 2020]),
      account('acct:2', 'New', [2021, 2022, 2023]),
    ];
    const out = overviewSeries({
      netWorth,
      accounts: mixed,
      selected: ['acct:1', 'acct:2'],
      range: '5',
    });

    expect(out.series[0]!.points.map((p) => p.year)).toEqual([2016, 2017, 2018, 2019, 2020]);
    expect(out.series[1]!.points.map((p) => p.year)).toEqual([2021, 2022, 2023]);
  });
});

describe('an empty ledger', () => {
  it('produces a series with no points rather than throwing', () => {
    const out = overviewSeries({ netWorth: [], accounts: [], selected: [], range: 'all' });

    expect(out.series).toHaveLength(1);
    expect(out.series[0]!.points).toEqual([]);
  });
});
