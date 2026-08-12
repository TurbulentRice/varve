/**
 * Assets against debts — the first figure in the app about the household rather
 * than about one module of it.
 *
 * It sits beside the retirement hero rather than replacing it. That hero is
 * explicitly about savings, says so, and was tuned by eye against real bugs;
 * redefining it in the same phase that first brings debts onto the screen would
 * be two changes wearing one coat (§17.3).
 *
 * The caveat is the interesting part. `netWorthSeries` cannot tell "owes
 * nothing" from "owes an unrecorded amount" — both reach it as an empty series —
 * so it reports what it saw and leaves the meaning here, where whether any loans
 * exist is knowable. An unobserved debt subtracts nothing and reports a net
 * worth that is too *high*, which is the flattering direction, so it is said out
 * loud rather than rounded past.
 */

import type { NetWorthPoint } from '@varve/core';
import { money } from '../lib/format.js';

export function NetWorth({
  point,
  unobservedDebts,
}: {
  point: NetWorthPoint;
  /** Loans in the ledger with no balance recorded. */
  unobservedDebts: number;
}) {
  const owing = point.net.isNegative();

  return (
    <section className="tiles" aria-label="Net worth">
      <div className="tile">
        <div className="tile-label">Net worth</div>
        {/* The sign carries the meaning; colour only reinforces it. Gain and
            loss separate by about ΔE 4 under deuteranopia (§10), so a reader who
            cannot see the difference still reads the minus. */}
        <div className={`tile-value ${owing ? 'negative' : ''}`}>{money(point.net)}</div>
        <div className="tile-detail">
          {owing ? 'owed beyond what is held' : 'everything held, less everything owed'}
        </div>
      </div>

      <div className="tile">
        <div className="tile-label">Assets</div>
        <div className="tile-value">{money(point.assets)}</div>
        <div className="tile-detail">across every tracked account</div>
      </div>

      <div className="tile">
        <div className="tile-label">Debts</div>
        <div className="tile-value">
          {point.debtsObserved || unobservedDebts === 0 ? money(point.debts) : '—'}
        </div>
        <div className="tile-detail">
          {unobservedDebts > 0
            ? `${unobservedDebts} ${unobservedDebts === 1 ? 'loan has' : 'loans have'} no balance recorded`
            : point.debtsObserved
              ? 'outstanding across every loan'
              : 'nothing owed'}
        </div>
      </div>
    </section>
  );
}

/**
 * Said out loud rather than folded into the figure.
 *
 * Shown only when a loan exists with nothing recorded against it, because that
 * is the case where the number above is wrong in the direction that flatters.
 */
export function NetWorthCaveat({ unobservedDebts }: { unobservedDebts: number }) {
  if (unobservedDebts === 0) return null;

  return (
    <div className="error" role="status">
      <strong>Net worth is higher than it should be</strong>
      {unobservedDebts === 1
        ? 'One loan has no balance recorded, so it is subtracting nothing.'
        : `${unobservedDebts} loans have no balance recorded, so they are subtracting nothing.`}{' '}
      Record what is owed and this will come down.
    </div>
  );
}
