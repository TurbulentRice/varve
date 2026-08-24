/**
 * What the money has been worth, and whose.
 *
 * The chart §31.3 made the point of the Overview: nothing selected plots **net
 * worth**, the household answer; selecting accounts plots one line each. That is
 * a mode change rather than a filter — a household figure is not the same kind
 * of thing as a set of account balances — so the heading says which is on screen
 * instead of letting the reader assume the line means one thing throughout.
 *
 * ## Six hues, assigned in order, never cycled
 *
 * Colours come from `--series-1` … `--series-6`, validated against this
 * project's own surfaces (§31.4). They are assigned by the order accounts appear
 * in the table and follow the account rather than its rank, so deselecting one
 * never repaints the others. A seventh selection is refused by the caller rather
 * than recoloured.
 *
 * ## The two rules that are not negotiable
 *
 * Gaps are drawn as gaps — `defined` breaks the path at any year with no
 * observation, rather than bridging it (ground rule 3). And every value here is
 * in the table below, so nothing is reachable only by hovering (§18.1).
 */

import { line } from 'd3-shape';
import { scaleLinear } from 'd3-scale';
import { useMemo, useState } from 'react';
import { compactNumber, money } from '../lib/format.js';
import type { Money } from '@varve/core';
import { useMeasure } from './useMeasure.js';

export interface SeriesPoint {
  readonly year: number;
  readonly amount: Money;
  /** False where the figure is carried forward rather than observed. */
  readonly recorded: boolean;
}

export interface Series {
  readonly id: string;
  readonly label: string;
  /** 1–6. Fixed per entity, so a changing selection never repaints survivors. */
  readonly slot: number;
  readonly points: readonly SeriesPoint[];
}

const MARGIN = { top: 16, right: 20, bottom: 34, left: 68 };

/** Tick counts that produce readable year labels rather than every year. */
function yearTicks(from: number, to: number, width: number): number[] {
  const span = to - from;
  if (span <= 0) return [from];

  // Roughly one label per 90px, snapped to a step people read easily.
  const wanted = Math.max(Math.floor(width / 90), 2);
  const step = [1, 2, 5, 10, 20, 25, 50].find((s) => span / s <= wanted) ?? 100;

  const ticks: number[] = [];
  // Start on a multiple of the step so labels land on round years.
  for (let year = Math.ceil(from / step) * step; year <= to; year += step) ticks.push(year);

  // Always show where the data actually starts and ends.
  if (ticks[0] !== from) ticks.unshift(from);
  if (ticks[ticks.length - 1] !== to) ticks.push(to);
  return ticks;
}

export function ValueOverTime({ series, caption }: { series: readonly Series[]; caption: string }) {
  const [wrapperRef, size] = useMeasure<HTMLDivElement>();
  const [hoverYear, setHoverYear] = useState<number | null>(null);

  const width = Math.max(size.width, 280);
  const height = Math.max(Math.round(width * 0.32), 220);
  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 10);
  const plotHeight = Math.max(height - MARGIN.top - MARGIN.bottom, 10);

  const chart = useMemo(() => {
    const all = series.flatMap((s) => s.points);
    if (all.length === 0) return null;

    const years = all.map((p) => p.year);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);

    // Only recorded points may set the extent: a carried-forward figure is not a
    // measurement, and letting one size the plot would frame it around a number
    // nobody wrote down.
    const measured = all.filter((p) => p.recorded).map((p) => p.amount.toNumber());
    const highest = Math.max(...measured, 0);
    const lowest = Math.min(...measured, 0);

    const x = scaleLinear()
      .domain([minYear, maxYear === minYear ? minYear + 1 : maxYear])
      .range([0, plotWidth]);
    const y = scaleLinear()
      .domain([lowest, highest === 0 ? 1 : highest])
      .nice()
      .range([plotHeight, 0]);

    const paths = series.map((s) => ({
      ...s,
      d:
        line<SeriesPoint>()
          .defined((p) => p.recorded)
          .x((p) => x(p.year))
          .y((p) => y(p.amount.toNumber()))([...s.points]) ?? '',
    }));

    return {
      paths,
      x,
      y,
      minYear,
      maxYear,
      ticksY: y.ticks(4),
      ticksX: yearTicks(minYear, maxYear, plotWidth),
      crossesZero: lowest < 0,
    };
  }, [series, plotWidth, plotHeight]);

  if (!chart) return null;

  const hovered =
    hoverYear === null
      ? null
      : series
          .map((s) => ({ series: s, point: s.points.find((p) => p.year === hoverYear) }))
          .filter((entry) => entry.point?.recorded);

  return (
    <div className="chart" ref={wrapperRef}>
      {/* A legend for two or more, so identity is never colour alone (§10). One
          series needs none — the heading names the only thing plotted. */}
      {series.length > 1 ? (
        <div className="chart-key">
          {series.map((s) => (
            <span className="key-item" key={s.id}>
              <span className="key-line" style={{ background: `var(--series-${s.slot})` }} />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}

      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${caption}, ${chart.minYear} to ${chart.maxYear}. Full figures in the table below.`}
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
            <line className="zero-rule" x1={0} x2={plotWidth} y1={chart.y(0)} y2={chart.y(0)} />
          ) : null}

          {hoverYear !== null ? (
            <line
              className="crosshair"
              x1={chart.x(hoverYear)}
              x2={chart.x(hoverYear)}
              y1={0}
              y2={plotHeight}
            />
          ) : null}

          {chart.paths.map((s) => (
            <path
              key={s.id}
              className="series-line"
              style={{ stroke: `var(--series-${s.slot})` }}
              d={s.d}
            />
          ))}

          {chart.paths.map((s) =>
            s.points
              .filter((p) => p.recorded)
              .map((p) => (
                <circle
                  key={`${s.id}-${p.year}`}
                  className={hoverYear === p.year ? 'marker marker-active' : 'marker'}
                  style={{ fill: `var(--series-${s.slot})` }}
                  cx={chart.x(p.year)}
                  cy={chart.y(p.amount.toNumber())}
                  r={hoverYear === p.year ? 4.5 : 2.5}
                />
              )),
          )}

          {chart.ticksY.map((tick) => (
            <text key={tick} className="tick" x={-10} y={chart.y(tick)} dy="0.32em" textAnchor="end">
              {compactNumber(tick)}
            </text>
          ))}

          {/* Year labels across the range, not just the ends — the weakness
              §31.3 found carried from one chart into the next. */}
          {chart.ticksX.map((tick, i) => (
            <text
              key={tick}
              className="tick"
              x={chart.x(tick)}
              y={plotHeight + 20}
              textAnchor={i === 0 ? 'start' : i === chart.ticksX.length - 1 ? 'end' : 'middle'}
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

      {hovered && hovered.length > 0 ? (
        <div
          className={`chart-tooltip${chart.x(hoverYear!) > plotWidth * 0.6 ? ' flip' : ''}`}
          style={{ left: MARGIN.left + chart.x(hoverYear!) }}
          role="status"
        >
          <div className="tooltip-year">{hoverYear}</div>
          {hovered.map(({ series: s, point }) => (
            <div className="tooltip-row" key={s.id}>
              <span className="tooltip-label">
                <span className="key-line" style={{ background: `var(--series-${s.slot})` }} />
                {s.label}
              </span>
              <span className="tooltip-value strong">{money(point!.amount)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
