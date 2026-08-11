/**
 * What happened, and what might.
 *
 * One continuous picture: the recorded history runs into a fan of simulated
 * futures, on one axis, in one hue. The join is the point — a projection shown
 * on its own invites the reader to treat it as a forecast, where a projection
 * growing out of a real line is obviously a continuation of the same story.
 *
 * The bands are why this is a chart rather than a number. A median alone is a
 * promise; a median inside the middle half inside the middle eight-tenths shows
 * the shape of the uncertainty, which is the actual finding.
 *
 * Written as SVG over `d3-scale` and `d3-shape` rather than through a charting
 * library: the specific thing here — history meeting a fan at a marked
 * boundary, nested bands, one hue — is exactly what chart libraries make hard.
 */

import { area, line } from 'd3-shape';
import { scaleLinear } from 'd3-scale';
import { useMemo, useState } from 'react';
import { compactNumber } from '../lib/format.js';
import { useMeasure } from './useMeasure.js';
import type { Money } from '@varve/core';

export interface HistoryPoint {
  readonly year: number;
  readonly value: number;
}

export interface BandPoint {
  readonly year: number;
  readonly p10: number;
  readonly p25: number;
  readonly median: number;
  readonly p75: number;
  readonly p90: number;
}

interface Props {
  readonly history: readonly HistoryPoint[];
  readonly bands: readonly BandPoint[];
  /** Drawn as the boundary between recorded and simulated. */
  readonly todayYear: number;
}

const MARGIN = { top: 16, right: 20, bottom: 32, left: 64 };
const MIN_HEIGHT = 260;

export function ProjectionChart({ history, bands, todayYear }: Props) {
  const [wrapperRef, size] = useMeasure<HTMLDivElement>();
  const [hoverYear, setHoverYear] = useState<number | null>(null);

  const width = Math.max(size.width, 320);
  const height = Math.max(Math.round(width * 0.42), MIN_HEIGHT);
  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 10);
  const plotHeight = Math.max(height - MARGIN.top - MARGIN.bottom, 10);

  const chart = useMemo(() => {
    const years = [...history.map((p) => p.year), ...bands.map((b) => b.year)];
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);

    // Money axes start at zero. A truncated baseline exaggerates every
    // movement on the plot, which on a balance chart is simply misleading.
    const maxValue = Math.max(
      ...history.map((p) => p.value),
      ...bands.map((b) => b.p90),
      1,
    );

    const x = scaleLinear().domain([minYear, maxYear]).range([0, plotWidth]);
    const y = scaleLinear().domain([0, maxValue]).nice().range([plotHeight, 0]);

    const bandArea = (lower: (b: BandPoint) => number, upper: (b: BandPoint) => number) =>
      area<BandPoint>()
        .x((b) => x(b.year))
        .y0((b) => y(lower(b)))
        .y1((b) => y(upper(b)))(bands as BandPoint[]) ?? '';

    return {
      x,
      y,
      minYear,
      maxYear,
      outer: bandArea((b) => b.p10, (b) => b.p90),
      inner: bandArea((b) => b.p25, (b) => b.p75),
      median:
        line<BandPoint>()
          .x((b) => x(b.year))
          .y((b) => y(b.median))(bands as BandPoint[]) ?? '',
      actual:
        line<HistoryPoint>()
          .x((p) => x(p.year))
          .y((p) => y(p.value))(history as HistoryPoint[]) ?? '',
      ticksY: y.ticks(5),
      ticksX: x.ticks(Math.min(8, Math.max(3, Math.round(plotWidth / 90)))).filter(Number.isInteger),
    };
  }, [history, bands, plotWidth, plotHeight]);

  const hovered = useMemo(() => {
    if (hoverYear === null) return null;
    const band = bands.find((b) => b.year === hoverYear);
    const point = history.find((p) => p.year === hoverYear);
    return band || point ? { year: hoverYear, band, point } : null;
  }, [hoverYear, bands, history]);

  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const year = Math.round(chart.x.invert(event.clientX - rect.left));
    setHoverYear(Math.min(Math.max(year, chart.minYear), chart.maxYear));
  };

  const lastActual = history[history.length - 1];

  return (
    <div className="chart" ref={wrapperRef}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={
          `Household value from ${chart.minYear} to ${chart.maxYear}. ` +
          `Recorded through ${todayYear}, simulated after, shown as a median ` +
          'with the middle half and middle eight-tenths of outcomes. ' +
          'The full figures are in the table below.'
        }
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Gridlines: solid hairlines, one step off the surface. Dashed rules
              read as thresholds and add noise the data has to compete with. */}
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

          <path className="band-outer" d={chart.outer} />
          <path className="band-inner" d={chart.inner} />

          {/* The boundary between what is known and what is guessed. */}
          <line
            className="divider"
            x1={chart.x(todayYear)}
            x2={chart.x(todayYear)}
            y1={0}
            y2={plotHeight}
          />
          <text className="divider-label" x={chart.x(todayYear) + 6} y={12}>
            projected
          </text>

          <path className="series-median" d={chart.median} />
          <path className="series-actual" d={chart.actual} />

          {lastActual ? (
            <circle
              className="marker"
              cx={chart.x(lastActual.year)}
              cy={chart.y(lastActual.value)}
              r={4}
            />
          ) : null}

          {hovered ? (
            <line
              className="crosshair"
              x1={chart.x(hovered.year)}
              x2={chart.x(hovered.year)}
              y1={0}
              y2={plotHeight}
            />
          ) : null}

          {/* Axes. Ticks carry the values that are not directly labelled. */}
          {chart.ticksY.map((tick) => (
            <text key={tick} className="tick" x={-10} y={chart.y(tick)} dy="0.32em" textAnchor="end">
              {compactNumber(tick)}
            </text>
          ))}
          {chart.ticksX.map((tick) => (
            <text
              key={tick}
              className="tick"
              x={chart.x(tick)}
              y={plotHeight + 20}
              textAnchor="middle"
            >
              {tick}
            </text>
          ))}
          <line className="baseline" x1={0} x2={plotWidth} y1={plotHeight} y2={plotHeight} />

          {/* A generous transparent target: the hit area is the whole plot, so
              reading a year never requires landing on a 2px line. */}
          <rect
            className="hit"
            width={plotWidth}
            height={plotHeight}
            onPointerMove={onMove}
            onPointerLeave={() => setHoverYear(null)}
          />
        </g>
      </svg>

      {hovered ? (
        <Tooltip
          hovered={hovered}
          left={MARGIN.left + chart.x(hovered.year)}
          plotWidth={plotWidth}
        />
      ) : null}

      <div className="chart-key">
        {/* One entry, not two: the line before the divider and the line after
            it are the same quantity, recorded then simulated. Two swatches of
            the same colour would imply a distinction that is not there. */}
        <span className="key-item">
          <span className="key-line" /> value — recorded, then median
        </span>
        <span className="key-item">
          <span className="key-swatch key-swatch-inner" /> middle half
        </span>
        <span className="key-item">
          <span className="key-swatch key-swatch-outer" /> middle 80%
        </span>
      </div>
    </div>
  );
}

function Tooltip({
  hovered,
  left,
  plotWidth,
}: {
  hovered: { year: number; band?: BandPoint | undefined; point?: HistoryPoint | undefined };
  left: number;
  plotWidth: number;
}) {
  // Flip to the other side near the right edge so the panel never leaves the card.
  const flip = left > plotWidth * 0.62;

  return (
    <div
      className={`chart-tooltip${flip ? ' flip' : ''}`}
      style={{ left }}
      role="status"
      aria-live="polite"
    >
      <div className="tooltip-year">{hovered.year}</div>
      {hovered.point ? (
        <Row label="Recorded" value={compactNumber(hovered.point.value)} strong />
      ) : null}
      {hovered.band ? (
        <>
          <Row label="Median" value={compactNumber(hovered.band.median)} strong />
          <Row
            label="Middle half"
            value={`${compactNumber(hovered.band.p25)} – ${compactNumber(hovered.band.p75)}`}
          />
          <Row
            label="Middle 80%"
            value={`${compactNumber(hovered.band.p10)} – ${compactNumber(hovered.band.p90)}`}
          />
        </>
      ) : null}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="tooltip-row">
      <span className="tooltip-label">{label}</span>
      <span className={strong ? 'tooltip-value strong' : 'tooltip-value'}>{value}</span>
    </div>
  );
}

/** Anchor the fan to the last recorded value so it grows out of the real line. */
export function anchorBands(
  bands: readonly BandPoint[],
  todayYear: number,
  todayValue: Money,
): BandPoint[] {
  const value = todayValue.toNumber();
  return [
    { year: todayYear, p10: value, p25: value, median: value, p75: value, p90: value },
    ...bands,
  ];
}
