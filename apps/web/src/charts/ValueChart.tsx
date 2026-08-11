/**
 * One account's value over time.
 *
 * A plain line, deliberately. The account view already carries what was paid in
 * and what was earned as figures; drawing a second series here would put two
 * quantities on one plot to say something the tiles say more precisely.
 *
 * Gaps in the record are drawn as gaps. A line running straight through a year
 * nobody recorded asserts a path that was never observed, which is the same
 * mistake as reporting that year at 0%.
 */

import { line } from 'd3-shape';
import { scaleLinear } from 'd3-scale';
import { useMemo, useState } from 'react';
import { compactNumber } from '../lib/format.js';
import { useMeasure } from './useMeasure.js';

export interface ValuePoint {
  readonly year: number;
  readonly value: number;
  /** False where the balance is carried forward rather than observed. */
  readonly recorded: boolean;
}

const MARGIN = { top: 16, right: 16, bottom: 30, left: 60 };

export function ValueChart({ points }: { points: readonly ValuePoint[] }) {
  const [wrapperRef, size] = useMeasure<HTMLDivElement>();
  const [hoverYear, setHoverYear] = useState<number | null>(null);

  const width = Math.max(size.width, 280);
  const height = Math.max(Math.round(width * 0.3), 180);
  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 10);
  const plotHeight = Math.max(height - MARGIN.top - MARGIN.bottom, 10);

  const chart = useMemo(() => {
    const years = points.map((p) => p.year);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const maxValue = Math.max(...points.map((p) => p.value), 1);

    const x = scaleLinear()
      .domain([minYear, maxYear === minYear ? minYear + 1 : maxYear])
      .range([0, plotWidth]);
    const y = scaleLinear().domain([0, maxValue]).nice().range([plotHeight, 0]);

    // `defined` breaks the path at unrecorded years rather than bridging them.
    const path =
      line<ValuePoint>()
        .defined((p) => p.recorded)
        .x((p) => x(p.year))
        .y((p) => y(p.value))(points as ValuePoint[]) ?? '';

    return { x, y, minYear, maxYear, path, ticksY: y.ticks(4) };
  }, [points, plotWidth, plotHeight]);

  const hovered = hoverYear === null ? null : points.find((p) => p.year === hoverYear) ?? null;

  return (
    <div className="chart chart-compact" ref={wrapperRef}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Value from ${chart.minYear} to ${chart.maxYear}. Full figures in the table below.`}
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

          <path className="series-actual" d={chart.path} />

          {points
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
          <div className="tooltip-row">
            <span className="tooltip-label">{hovered.recorded ? 'Worth' : 'No record'}</span>
            <span className="tooltip-value strong">{compactNumber(hovered.value)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
