/**
 * One screen, one headline: what the household is worth, and how that got here.
 *
 * The organising rule from §19.1 is that this page answers **where am I**, and
 * only that. No simulator — the projection is the loudest thing the app can draw
 * and the only part that is not true yet, so it has its own room (§19.2). What
 * is left is a figure, its history, and anything that wants attention.
 *
 * The chart is one series and the reasoning is in `NetWorthChart` (§22.3): the
 * assets-and-debts split lives in the tiles above it and in every column of the
 * table twin below, which is also what keeps every value reachable without a
 * cursor (§18.1).
 */

import type { NetWorth } from '../lib/net-worth.js';
import { NetWorthChart, NetWorthTable } from '../charts/NetWorthChart.js';
import { Disclosure } from '../components/Disclosure.js';
import { PageTitle, Tile, Tiles } from '../components/ui.js';
import { longDate, money } from '../lib/format.js';

export function Overview({
  netWorth,
  staleYears,
  onRecordDebts,
  onUpdateNumbers,
}: {
  netWorth: NetWorth;
  /** Years since the household last recorded a balance. */
  staleYears: number;
  onRecordDebts: () => void;
  onUpdateNumbers: () => void;
}) {
  const { latest, annual, unobservedDebts } = netWorth;

  // Nothing recorded at all. A page of dashes and a chart of one point teaches
  // nothing; saying what is missing and offering the way to fix it does.
  if (!latest || annual.length === 0) {
    return (
      <>
        <PageTitle title="Overview" />
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
  // Only recorded years are plottable. One point draws no line, and a chart of a
  // single dot is a stat tile wearing an axis.
  const plottable = annual.filter((p) => p.recorded).length;

  return (
    <>
      <PageTitle
        title="Overview"
        subtitle={`Everything held, less everything owed · as of ${longDate(latest.asOf)}`}
      />

      <Attention
        unobservedDebts={unobservedDebts}
        staleYears={staleYears}
        onRecordDebts={onRecordDebts}
        onUpdateNumbers={onUpdateNumbers}
      />

      <Tiles label="Net worth">
        <Tile
          label="Net worth"
          value={money(latest.net)}
          tone={owing ? 'negative' : undefined}
          detail={owing ? 'owed beyond what is held' : 'everything held, less everything owed'}
        />
        <Tile label="Assets" value={money(latest.assets)} detail="across every tracked account" />
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

      {plottable > 1 ? (
        <>
          <NetWorthChart points={annual} />
          <ChartCaption latest={latest.asOf} lastPlotted={annual.at(-1)?.asOf ?? latest.asOf} />
        </>
      ) : null}

      <div className="details">
        <Disclosure summary="Net worth, year by year" hint={`${annual.length} years`} open>
          <NetWorthTable points={annual} />
        </Disclosure>
      </div>
    </>
  );
}

/**
 * Why the line does not end where the headline does.
 *
 * Found by looking, which is what ground rule 5 is for. A loan statement that
 * arrives after the last balance was taken moves the figure above and not the
 * chart: the figure is the latest thing known about either side, while the chart
 * is on the annual grid and the newest year end predates the statement. So the
 * last point can sit *above* the headline by the whole of a debt.
 *
 * The tempting fix is to backdate the debt to the last year end. That would be a
 * lie — nothing was known to be owed then — and it is the flattering-direction
 * kind of lie this app keeps catching itself in (§17.2). Saying it costs one
 * line and stays true.
 */
function ChartCaption({ latest, lastPlotted }: { latest: string; lastPlotted: string }) {
  if (latest === lastPlotted) return null;

  return (
    <p className="chart-caption">
      The line ends at {longDate(lastPlotted)}, the last balance recorded. The figures above are as
      of {longDate(latest)}, which includes anything recorded about what is owed since.
    </p>
  );
}

/**
 * What wants doing, and nothing else.
 *
 * §19.2 asked for a strip of things needing attention. The discipline that makes
 * one useful is that it is empty when nothing is wrong — a panel that always has
 * something in it is decoration, and gets read as decoration on the day it
 * matters.
 *
 * Both conditions here are cases where the number above is wrong in the
 * *flattering* direction, which is the worst way for this app to be wrong: an
 * unrecorded debt subtracts nothing (§17.2), and a stale balance reports a
 * position that has since moved.
 */
function Attention({
  unobservedDebts,
  staleYears,
  onRecordDebts,
  onUpdateNumbers,
}: {
  unobservedDebts: number;
  staleYears: number;
  onRecordDebts: () => void;
  onUpdateNumbers: () => void;
}) {
  const stale = staleYears >= 2;
  if (unobservedDebts === 0 && !stale) return null;

  return (
    <section className="attention" aria-label="Needs attention">
      {unobservedDebts > 0 ? (
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
      ) : null}

      {stale ? (
        <div className="attention-item" role="status">
          <div>
            <strong>These figures are {staleYears} years old</strong> The last balance recorded was
            in {new Date().getUTCFullYear() - staleYears}, so everything here describes then rather
            than now.
          </div>
          <button type="button" className="ghost" onClick={onUpdateNumbers}>
            Update numbers
          </button>
        </div>
      ) : null}
    </section>
  );
}
