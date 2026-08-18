/**
 * A warning attached to the thing it is about.
 *
 * §22 put staleness in a strip above everything, and §31.7 moves it beside the
 * as-of date it actually concerns — zero vertical cost, and more connected
 * rather than less.
 *
 * ## Not dismissible, deliberately
 *
 * "These figures are three years old" is *true*, and dismissing it does not make
 * it less true. A warning that can be permanently silenced about stale data is
 * worse than no warning at all, because from then on its absence means nothing.
 * So this can be collapsed and never suppressed.
 *
 * ## Click, not hover
 *
 * A hover-only warning is unreachable on a touch screen and fails the same rule
 * §18.1 protects for charts — nothing important may be reachable only by
 * pointing at it. The marker is a real button with a label.
 */

import { useState } from 'react';

/** Two years is where a figure stops describing roughly now. */
const STALE_AFTER = 2;

export function StaleMarker({ years, onFix }: { years: number; onFix: () => void }) {
  const [open, setOpen] = useState(false);

  if (years < STALE_AFTER) return null;

  return (
    <span className="stale">
      <button
        type="button"
        className="stale-marker"
        aria-expanded={open}
        aria-label={`These figures are ${years} years old`}
        onClick={() => setOpen(!open)}
      >
        !
      </button>

      {open ? (
        <span className="stale-note" role="status">
          <strong>{years} years old.</strong> The last balance recorded was in{' '}
          {new Date().getUTCFullYear() - years}, so everything here describes then rather than now.{' '}
          <button type="button" className="link" onClick={onFix}>
            Update numbers
          </button>
        </span>
      ) : null}
    </span>
  );
}
