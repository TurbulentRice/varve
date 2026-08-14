/**
 * A balance over time, small enough to sit beside its own current figure.
 *
 * §24.2 rejected this on the data rather than on taste: most loans carried
 * exactly one observation, and a sparkline of one point is a dot pretending to
 * be a trend. §25 gave loans a reason to accumulate statements, so the drawing
 * now has something to draw — but the original objection still binds for a young
 * loan, which is why {@link Sparkline} renders nothing below two points rather
 * than a flat line. A gap is drawn as a gap; a trend nobody has is drawn as no
 * trend.
 *
 * ## Why this is allowed to have no axis, no labels and no hover
 *
 * §18.1 protects one property: no value reachable only by hovering. This carries
 * no values at all. The figure it sits beside is the current balance, and every
 * point it encodes appears as an opening or closing balance in the periods table
 * on that loan's own page, which is where §16 put them. The same argument
 * `ShareBar` makes — a meter, not a chart.
 *
 * It is labelled rather than hidden, because "falling" is what a reader takes
 * from it, and that should not require eyes.
 */

import { line } from 'd3-shape';
import { scaleLinear } from 'd3-scale';
import { useMemo } from 'react';
import type { Money } from '@varve/core';

export interface SparkPoint {
  readonly asOf: string;
  readonly amount: Money;
}

const WIDTH = 64;
const HEIGHT = 20;
/** Room for the end cap's radius, so it is never clipped by the viewBox. */
const PAD = 2.5;

/** Fewer than this is not a trend, it is a reading. */
const MIN_POINTS = 2;

export function Sparkline({ points, label }: { points: readonly SparkPoint[]; label: string }) {
  const chart = useMemo(() => {
    if (points.length < MIN_POINTS) return null;

    const ordered = [...points].sort((a, b) => (a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : 0));
    const values = ordered.map((p) => p.amount.toNumber());

    const lowest = Math.min(...values);
    const highest = Math.max(...values);

    const x = scaleLinear().domain([0, ordered.length - 1]).range([PAD, WIDTH - PAD]);
    // A flat series would give a zero-height domain and divide by nothing, so it
    // is drawn down the middle — which is what "did not move" looks like.
    const y =
      highest === lowest
        ? () => HEIGHT / 2
        : scaleLinear().domain([lowest, highest]).range([HEIGHT - PAD, PAD]);

    const path = line<number>()
      .x((_, i) => x(i))
      .y((v) => y(v))(values);

    const first = values[0]!;
    const last = values[values.length - 1]!;

    return {
      path: path ?? '',
      endX: x(ordered.length - 1),
      endY: y(last),
      // Direction over the whole span, which is the claim the label makes.
      direction: last < first ? 'falling' : last > first ? 'rising' : 'flat',
      count: ordered.length,
    };
  }, [points]);

  if (!chart) return null;

  return (
    <svg
      className={`sparkline ${chart.direction}`}
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${label}: ${chart.direction} across ${chart.count} statements. Figures on this loan's own page.`}
    >
      <path d={chart.path} />
      {/* The end cap says which way to read it, since there is no axis to. */}
      <circle cx={chart.endX} cy={chart.endY} r={2} />
    </svg>
  );
}
