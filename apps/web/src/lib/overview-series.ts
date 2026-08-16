/**
 * What the Overview's chart plots, given what is selected.
 *
 * The branch §31.3 describes — nothing selected means net worth, a selection
 * means one line per account — decided here rather than in a render, for the
 * reason `net-worth.ts` and `debts.ts` both give (§22.4): the interesting part is
 * a function of data and the framework part is glue.
 */

import type { Money } from '@varve/core';
import type { AccountHistory } from '@varve/retirement';
import type { AnnualNetWorth } from './net-worth.js';
import type { Series, SeriesPoint } from '../charts/ValueOverTime.js';

/**
 * How many accounts may be plotted at once.
 *
 * Six categorical hues is where adjacent slots stop being tellable apart, and a
 * seventh generated colour is the anti-pattern rather than the fallback. The
 * caller refuses the seventh selection with a reason; nothing here silently
 * drops or recolours one (§31.3).
 */
export const MAX_SERIES = 6;

/** Year ranges offered, in years back from the latest recorded one. */
export type RangeChoice = 'all' | '10' | '5';

export const RANGES: readonly { value: RangeChoice; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: '10', label: '10 years' },
  { value: '5', label: '5 years' },
];

export interface OverviewSeriesInput {
  readonly netWorth: readonly AnnualNetWorth[];
  readonly accounts: readonly AccountHistory[];
  /** Account ids currently selected. Empty means net worth. */
  readonly selected: readonly string[];
  readonly range: RangeChoice;
}

export interface OverviewSeries {
  readonly series: readonly Series[];
  /** What the chart is showing, for its heading — the mode is never implied. */
  readonly caption: string;
  /** True when the plot is a household figure rather than account balances. */
  readonly isNetWorth: boolean;
}

/**
 * Colour slot for an account, fixed by its position in the full list.
 *
 * Follows the entity, not its rank among the selected: deselecting one account
 * must not repaint the others, which is the recolour-on-filter anti-pattern and
 * the reason somebody who learned "the IRA is orange" stops trusting the chart.
 */
function slotFor(accounts: readonly AccountHistory[], id: string): number {
  const index = accounts.findIndex((a) => a.account.id === id);
  return (index % MAX_SERIES) + 1;
}

/** Clip a series to the chosen range, counted back from its own last year. */
function withinRange(points: readonly SeriesPoint[], range: RangeChoice): SeriesPoint[] {
  if (range === 'all' || points.length === 0) return [...points];
  const last = Math.max(...points.map((p) => p.year));
  const from = last - Number(range) + 1;
  return points.filter((p) => p.year >= from);
}

export function overviewSeries(input: OverviewSeriesInput): OverviewSeries {
  const { netWorth, accounts, selected, range } = input;

  if (selected.length === 0) {
    const points: SeriesPoint[] = netWorth.map((p) => ({
      year: p.year,
      amount: p.net,
      recorded: p.recorded,
    }));

    return {
      series: [{ id: 'net-worth', label: 'Net worth', slot: 1, points: withinRange(points, range) }],
      caption: 'Net worth',
      isNetWorth: true,
    };
  }

  const chosen = accounts.filter((a) => selected.includes(a.account.id)).slice(0, MAX_SERIES);

  return {
    series: chosen.map((account): Series => ({
      id: account.account.id,
      label: account.account.name,
      slot: slotFor(accounts, account.account.id),
      points: withinRange(
        account.years.map((y): SeriesPoint => ({
          year: y.year,
          amount: y.endValue as Money,
          recorded: y.recorded,
        })),
        range,
      ),
    })),
    caption:
      chosen.length === 1 ? `${chosen[0]!.account.name}` : `${chosen.length} accounts`,
    isNetWorth: false,
  };
}
