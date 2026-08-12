/**
 * A loan's balance falling to zero, with the interest underneath it.
 *
 * Two series, and unusually for this codebase that is the right call rather than
 * one too many. The balance alone says when it ends; what it does not show is
 * the thing people find genuinely surprising — that early payments are mostly
 * interest, and the curve only bends once that flips. Drawing cumulative
 * interest beneath the balance puts both on one time axis where the crossing is
 * visible.
 *
 * Same conventions as every other chart here: hand-written SVG over `d3-scale`
 * and `d3-shape`, colours read from the theme tokens rather than hard-coded, and
 * a table twin behind a disclosure so no value is reachable only by hovering.
 */

import { area, line } from 'd3-shape';
import { scaleLinear } from 'd3-scale';
import { useMemo } from 'react';
import type { Schedule } from '@varve/loans';
import { compactNumber } from '../lib/format.js';
import { useMeasure } from './useMeasure.js';

const MARGIN = { top: 16, right: 16, bottom: 30, left: 60 };

export function ScheduleChart({ schedule }: { schedule: Schedule }) {
  const [wrapperRef, size] = useMeasure<HTMLDivElement>();

  const width = Math.max(size.width, 280);
  const height = Math.max(Math.round(width * 0.32), 190);
  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 10);
  const plotHeight = Math.max(height - MARGIN.top - MARGIN.bottom, 10);

  const chart = useMemo(() => {
    // Month zero is the opening balance: the line should start where the debt
    // actually starts, not after the first payment has already moved it.
    const points = [
      { month: 0, balance: schedule.openingBalance.toNumber(), interest: 0 },
      ...schedule.installments.map((i, index) => ({
        month: i.number,
        balance: i.balance.toNumber(),
        interest: schedule.installments
          .slice(0, index + 1)
          .reduce((sum, x) => sum + x.interest.toNumber(), 0),
      })),
    ];

    const lastMonth = points[points.length - 1]?.month ?? 1;
    const top = Math.max(...points.map((p) => p.balance), 1);

    const x = scaleLinear().domain([0, Math.max(lastMonth, 1)]).range([0, plotWidth]);
    const y = scaleLinear().domain([0, top]).nice().range([plotHeight, 0]);

    return {
      points,
      x,
      y,
      lastMonth,
      balancePath:
        line<(typeof points)[number]>()
          .x((p) => x(p.month))
          .y((p) => y(p.balance))(points) ?? '',
      interestPath:
        area<(typeof points)[number]>()
          .x((p) => x(p.month))
          .y0(plotHeight)
          .y1((p) => y(p.interest))(points) ?? '',
      ticks: y.ticks(4),
    };
  }, [schedule, plotWidth, plotHeight]);

  const years = Math.round(chart.lastMonth / 12);

  return (
    <div className="chart" ref={wrapperRef}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Balance falling to zero over ${chart.lastMonth} payments, with interest paid accumulating beneath it`}
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {chart.ticks.map((tick) => (
            <g key={tick} transform={`translate(0,${chart.y(tick)})`}>
              <line className="baseline" x1={0} x2={plotWidth} />
              <text className="tick" x={-10} dy="0.32em" textAnchor="end">
                {compactNumber(tick)}
              </text>
            </g>
          ))}

          {/* Interest sits underneath as a wash of the line's own hue: it is a
              magnitude beneath a magnitude, not a competing category. */}
          <path className="band-inner" d={chart.interestPath} />
          <path className="series-actual" d={chart.balancePath} fill="none" />

          <text className="tick" x={0} y={plotHeight + 20}>
            now
          </text>
          <text className="tick" x={plotWidth} y={plotHeight + 20} textAnchor="end">
            {chart.lastMonth} payments{years >= 2 ? ` · ${years} years` : ''}
          </text>
        </g>
      </svg>

      <div className="chart-key">
        <span className="key-item">
          <span className="key-line" aria-hidden="true" /> balance owed
        </span>
        {/* key-swatch-inner, not band-inner: the latter styles an SVG path and
            has no background, so the swatch rendered invisible. */}
        <span className="key-item">
          <span className="key-swatch key-swatch-inner" aria-hidden="true" /> interest paid so far
        </span>
      </div>
    </div>
  );
}
