/**
 * The household's net worth over time — the first chart in the app about the
 * household rather than about one module of it.
 *
 * ## One series, not three
 *
 * The obvious version plots assets, debts and the net line between them. It is
 * wrong for an arithmetic reason rather than an aesthetic one: after twenty
 * years of saving, debts are smaller than assets by more than an order of
 * magnitude, so the net line and the assets line sit closer together than the
 * stroke width for most of the plot. That is two entries in a legend and one
 * visible line on the chart — the same defect §18.1 records catching by looking,
 * *a legend with two identical swatches*, reached from the other direction.
 * Drawing debts as a downward area trades that collision for a second one, a
 * series that renders flat on the axis for its whole length.
 *
 * So: one series. The split is not lost — it is in the tiles above this chart
 * and in every column of the table twin below it. One series also means no
 * legend, because the heading names the only thing plotted, and no second
 * categorical hue: this is `--data-line`, the quantity hue §10 already validated
 * against both surfaces.
 *
 * ## Gaps, and the sign
 *
 * A year the household recorded nothing breaks the path rather than bridging it
 * (ground rule 3). Net worth can be negative, so the plot draws a zero rule
 * whenever its domain crosses zero and lets the sign carry the meaning — colour
 * reinforces it and never carries it alone (§10).
 */

import { line } from 'd3-shape';
import { scaleLinear } from 'd3-scale';
import { useMemo, useState } from 'react';
import type { AnnualNetWorth } from '../lib/net-worth.js';
import { compactNumber, longDate, money } from '../lib/format.js';
import { useMeasure } from './useMeasure.js';

const MARGIN = { top: 16, right: 20, bottom: 30, left: 64 };

interface Plotted {
  readonly year: number;
  readonly value: number;
  readonly recorded: boolean;
  readonly point: AnnualNetWorth;
}

export function NetWorthChart({ points }: { points: readonly AnnualNetWorth[] }) {
  const [wrapperRef, size] = useMeasure<HTMLDivElement>();
  const [hoverYear, setHoverYear] = useState<number | null>(null);

  const width = Math.max(size.width, 280);
  const height = Math.max(Math.round(width * 0.34), 200);
  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 10);
  const plotHeight = Math.max(height - MARGIN.top - MARGIN.bottom, 10);

  const chart = useMemo(() => {
    const plotted: Plotted[] = points.map((p) => ({
      year: p.year,
      value: p.net.toNumber(),
      recorded: p.recorded,
      point: p,
    }));

    const years = plotted.map((p) => p.year);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);

    // Only recorded points may set the extent. A carried-forward figure is not
    // a measurement, and letting one stretch the axis would size the plot around
    // a number nobody wrote down.
    const measured = plotted.filter((p) => p.recorded).map((p) => p.value);
    const highest = Math.max(...measured, 0);
    const lowest = Math.min(...measured, 0);

    const x = scaleLinear()
      .domain([minYear, maxYear === minYear ? minYear + 1 : maxYear])
      .range([0, plotWidth]);
    // The domain always includes zero, so the height of the line reads as an
    // amount rather than as a difference from an arbitrary floor.
    const y = scaleLinear()
      .domain([lowest, highest === 0 ? 1 : highest])
      .nice()
      .range([plotHeight, 0]);

    const path =
      line<Plotted>()
        .defined((p) => p.recorded)
        .x((p) => x(p.year))
        .y((p) => y(p.value))(plotted) ?? '';

    return {
      plotted,
      x,
      y,
      minYear,
      maxYear,
      path,
      ticksY: y.ticks(4),
      // Only worth a rule when the data actually straddles it; otherwise the
      // baseline already is zero and a second line on top of it is noise.
      crossesZero: lowest < 0,
    };
  }, [points, plotWidth, plotHeight]);

  const hovered = hoverYear === null ? null : chart.plotted.find((p) => p.year === hoverYear) ?? null;

  return (
    <div className="chart" ref={wrapperRef}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Net worth from ${chart.minYear} to ${chart.maxYear}. Full figures in the table below.`}
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {chart.ticksY.map((tick) => (
            <line
              key={tick}
              className="grid"
              x1={0}
              x2={plotWidth}
              y1={chart.y(tick)}
              y2={chart.y(tick)}
            />
          ))}

          {chart.crossesZero ? (
            <line
              className="zero-rule"
              x1={0}
              x2={plotWidth}
              y1={chart.y(0)}
              y2={chart.y(0)}
            />
          ) : null}

          <path className="series-actual" d={chart.path} />

          {chart.plotted
            .filter((p) => p.recorded)
            .map((p) => (
              <circle
                key={p.year}
                className={hovered?.year === p.year ? 'marker marker-active' : 'marker'}
                cx={chart.x(p.year)}
                cy={chart.y(p.value)}
                r={hovered?.year === p.year ? 5 : 3}
              />
            ))}

          {chart.ticksY.map((tick) => (
            <text key={tick} className="tick" x={-10} y={chart.y(tick)} dy="0.32em" textAnchor="end">
              {compactNumber(tick)}
            </text>
          ))}
          {[chart.minYear, chart.maxYear].map((tick, i) => (
            <text
              key={tick}
              className="tick"
              x={chart.x(tick)}
              y={plotHeight + 18}
              textAnchor={i === 0 ? 'start' : 'end'}
            >
              {tick}
            </text>
          ))}
          <line className="baseline" x1={0} x2={plotWidth} y1={plotHeight} y2={plotHeight} />

          <rect
            className="hit"
            width={plotWidth}
            height={plotHeight}
            onPointerMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const year = Math.round(chart.x.invert(event.clientX - rect.left));
              setHoverYear(Math.min(Math.max(year, chart.minYear), chart.maxYear));
            }}
            onPointerLeave={() => setHoverYear(null)}
          />
        </g>
      </svg>

      {hovered ? (
        <div
          className={`chart-tooltip${chart.x(hovered.year) > plotWidth * 0.6 ? ' flip' : ''}`}
          style={{ left: MARGIN.left + chart.x(hovered.year) }}
          role="status"
        >
          <div className="tooltip-year">{hovered.year}</div>
          {hovered.recorded ? (
            <>
              <div className="tooltip-row">
                <span className="tooltip-label">Net worth</span>
                <span className="tooltip-value strong">{money(hovered.point.net)}</span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">Assets</span>
                <span className="tooltip-value">{money(hovered.point.assets)}</span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">Debts</span>
                <span className="tooltip-value">
                  {hovered.point.debtsObserved ? money(hovered.point.debts) : '—'}
                </span>
              </div>
            </>
          ) : (
            <div className="tooltip-row">
              <span className="tooltip-label">No record</span>
              <span className="tooltip-value">{longDate(hovered.point.asOf)}</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The table twin.
 *
 * Not optional. Every chart in this app has one so that no value is reachable
 * only by hovering (§18.1) — and here it is also where the assets-and-debts
 * split the chart deliberately does not draw is written down in full.
 */
export function NetWorthTable({ points }: { points: readonly AnnualNetWorth[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">Assets</th>
            <th scope="col">Debts</th>
            <th scope="col">Net worth</th>
          </tr>
        </thead>
        <tbody>
          {[...points].reverse().map((p) => (
            <tr key={p.year} className={p.recorded ? undefined : 'unrecorded'}>
              <th scope="row" className="year">
                {p.year}
                {!p.recorded ? (
                  <span
                    className="flag gap"
                    title="No balance was recorded in this year — the position shown is the last one before it, carried forward."
                  >
                    no record
                  </span>
                ) : null}
              </th>
              <td className="num">{money(p.assets)}</td>
              <td className="num muted">{p.debtsObserved ? money(p.debts) : '—'}</td>
              <td className={`num strong ${p.net.isNegative() ? 'negative' : ''}`}>
                {money(p.net)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="table-note">
        <strong>Assets</strong> is every tracked account at that year&rsquo;s close.{' '}
        <strong>Debts</strong> is what was owed on the same date, carried forward from the last
        statement — a dash means nothing had been recorded yet, which makes net worth look higher
        than it was. <em>No record</em> marks a year with no balance entered; that row repeats the
        position before it and is drawn as a gap rather than a flat year.
      </p>
    </div>
  );
}
