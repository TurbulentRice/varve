/**
 * One page for where the money is.
 *
 * §31.1 measured what two pages were costing: the same figure appearing as
 * `NET WORTH`, `ASSETS` and `VALUE` across a page break, which is the kind of
 * repetition that makes a reader wonder what distinction they have missed. The
 * accounts table lives here now, and the merge went this way rather than the
 * other because **net worth is assets minus debts** — a household figure
 * spanning both modules (§17.1), which a page called Accounts could not honestly
 * lead with (§31.2).
 *
 * The chart is the thing you do something with. Nothing selected plots net
 * worth; selecting rows in the table plots those accounts, up to six. That is a
 * mode change rather than a filter, so the heading above the chart says which is
 * on screen (§31.3).
 *
 * `PageTitle` is gone from here and everywhere — 61px repeating what the lit
 * navigation item already says. The heading survives for screen readers, and the
 * *as-of* date it used to carry now sits beside the figure it dates (§31.5).
 */

import type { AccountHistory, History } from '@varve/retirement';
import { accountId } from '@varve/core';
import { useMemo, useState } from 'react';
import { ValueOverTime } from '../charts/ValueOverTime.js';
import { NetWorthTable } from '../charts/NetWorthChart.js';
import { AccountsTable } from '../components/AccountsTable.js';
import { Disclosure } from '../components/Disclosure.js';
import { HistoryTable } from '../components/HistoryTable.js';
import { StaleMarker } from '../components/StaleMarker.js';
import { StatTiles } from '../components/StatTiles.js';
import { Tile, Tiles } from '../components/ui.js';
import { longDate, money } from '../lib/format.js';
import type { NetWorth } from '../lib/net-worth.js';
import { MAX_SERIES, overviewSeries, RANGES, type RangeChoice } from '../lib/overview-series.js';
import { navigate } from '../routing/useRoute.js';

export function Overview({
  netWorth,
  history,
  accounts,
  staleYears,
  onRecordDebts,
  onUpdateNumbers,
}: {
  netWorth: NetWorth;
  history: History;
  accounts: readonly AccountHistory[];
  /** Years since the household last recorded a balance. */
  staleYears: number;
  onRecordDebts: () => void;
  onUpdateNumbers: () => void;
}) {
  const { latest, annual, unobservedDebts } = netWorth;

  const [selected, setSelected] = useState<readonly string[]>([]);
  const [range, setRange] = useState<RangeChoice>('all');
  const [tooMany, setTooMany] = useState(false);

  const plotted = useMemo(
    () => overviewSeries({ netWorth: annual, accounts, selected, range }),
    [annual, accounts, selected, range],
  );

  function toggle(id: string) {
    setTooMany(false);
    setSelected((previous) => {
      if (previous.includes(id)) return previous.filter((other) => other !== id);
      if (previous.length >= MAX_SERIES) {
        // Refused rather than recoloured: past six, adjacent hues stop being
        // tellable apart and a generated seventh is the anti-pattern (§31.3).
        setTooMany(true);
        return previous;
      }
      return [...previous, id];
    });
  }

  // Nothing recorded at all. A page of dashes and a chart of one point teaches
  // nothing; saying what is missing and offering the way to fix it does.
  if (!latest || annual.length === 0) {
    return (
      <>
        <h1 className="visually-hidden">Overview</h1>
        <div className="empty">
          <strong>Nothing recorded yet</strong>
          <p>
            Once a balance is entered, this page shows what the household is worth and how that has
            moved.
          </p>
          <button type="button" className="primary" onClick={onUpdateNumbers}>
            Update numbers
          </button>
        </div>
      </>
    );
  }

  const owing = latest.net.isNegative();
  const plottable = plotted.series.some((s) => s.points.filter((p) => p.recorded).length > 1);

  return (
    <>
      <h1 className="visually-hidden">Overview</h1>

      {unobservedDebts > 0 ? (
        <section className="attention" aria-label="Needs attention">
          <div className="attention-item" role="status">
            <div>
              <strong>Net worth is higher than it should be</strong>
              {unobservedDebts === 1
                ? ' One loan has no balance recorded, so it is subtracting nothing.'
                : ` ${unobservedDebts} loans have no balance recorded, so they are subtracting nothing.`}
            </div>
            <button type="button" className="ghost" onClick={onRecordDebts}>
              Record what is owed
            </button>
          </div>
        </section>
      ) : null}

      <Tiles label="Net worth">
        <Tile
          label="Net worth"
          value={money(latest.net)}
          tone={owing ? 'negative' : undefined}
          detail={
            <>
              as of {longDate(latest.asOf)}{' '}
              <StaleMarker years={staleYears} onFix={onUpdateNumbers} />
            </>
          }
        />
        <Tile
          label="Assets"
          value={money(latest.assets)}
          detail={`across ${accounts.filter((a) => !a.closed).length} tracked accounts`}
        />
        <Tile
          label="Debts"
          value={latest.debtsObserved || unobservedDebts === 0 ? money(latest.debts) : '—'}
          detail={
            unobservedDebts > 0
              ? `${unobservedDebts} ${unobservedDebts === 1 ? 'loan has' : 'loans have'} no balance recorded`
              : latest.debtsObserved
                ? 'outstanding across every loan'
                : 'nothing owed'
          }
        />
      </Tiles>

      <div className="chart-head">
        <span className="chart-title">{plotted.caption}</span>
        <div className="chart-actions">
          {selected.length > 0 ? (
            <button type="button" className="chip" onClick={() => setSelected([])}>
              Show net worth
            </button>
          ) : null}
          <div className="segmented" role="group" aria-label="How far back to show">
            {RANGES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                className={range === choice.value ? 'segment current' : 'segment'}
                aria-pressed={range === choice.value}
                onClick={() => setRange(choice.value)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {plottable ? (
        <ValueOverTime series={plotted.series} caption={plotted.caption} />
      ) : (
        <p className="footnote">
          Not enough recorded to draw a line — one point is a reading rather than a trend.
        </p>
      )}

      {tooMany ? (
        <p className="footnote">
          Six accounts at once is the limit: past that, two lines stop being tellable apart by
          colour. Deselect one to add another.
        </p>
      ) : null}

      <StatTiles history={history} />

      <AccountsTable
        accounts={accounts}
        selected={selected}
        onToggle={toggle}
        onOpen={(id) => navigate({ view: 'account', accountId: accountId(id) })}
        onUpdateNumbers={onUpdateNumbers}
      />

      <div className="details">
        <Disclosure summary="Net worth, year by year" hint={`${annual.length} years`}>
          <NetWorthTable points={annual} />
        </Disclosure>

        <Disclosure summary="Every recorded year" hint={`${history.years.length} years`}>
          <HistoryTable years={history.years} />
        </Disclosure>
      </div>
    </>
  );
}
