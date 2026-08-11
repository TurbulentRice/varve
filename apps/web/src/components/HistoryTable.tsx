import type { YearRow } from '@varve/retirement';
import { money, percent } from '../lib/format.js';

/**
 * The recorded years, in full.
 *
 * Sign carries gain and loss, not colour: green against red separates by about
 * ΔE 4 under deuteranopia, so a reader with the most common form of colour
 * blindness would be reading these figures on the minus sign alone. The colour
 * is reinforcement for everyone else.
 */
export function HistoryTable({ years }: { years: readonly YearRow[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">Value</th>
            <th scope="col">Paid in</th>
            <th scope="col">Fees</th>
            <th scope="col">Earned</th>
            <th scope="col">Return</th>
            <th scope="col">Legacy</th>
            <th scope="col">Δ</th>
            <th scope="col">Benchmark</th>
          </tr>
        </thead>
        <tbody>
          {[...years].reverse().map((y) => {
            // No legacy figure means no disagreement to report. Showing a delta
            // against an undefined number invents a discrepancy.
            const delta =
              !y.recorded || y.legacyReturn === null ? null : (y.twr - y.legacyReturn) * 10_000;
            const material = delta !== null && Math.abs(delta) >= 100;
            const shown = delta !== null && Math.abs(delta) >= 1;

            return (
              <tr key={y.year} className={y.recorded ? undefined : 'unrecorded'} title={y.note ?? undefined}>
                <th scope="row" className="year">
                  {y.year}
                  {!y.recorded ? (
                    <span className="flag gap" title="No balance was recorded in this year — the figure shown is the last one before it, carried forward.">
                      no record
                    </span>
                  ) : y.partial ? (
                    <span className="flag" title={`as of ${y.endValueAsOf}`}>
                      •
                    </span>
                  ) : null}
                  {y.note ? (
                    <span className="flag" title={y.note}>
                      ✎
                    </span>
                  ) : null}
                </th>
                <td className="num">{money(y.endValue)}</td>
                <td className="num muted">{money(y.contributions)}</td>
                <td className="num muted">{y.fees.isZero() ? '—' : money(y.fees)}</td>
                <td className={`num ${y.organicGain.isNegative() ? 'negative' : 'positive'}`}>
                  {y.recorded ? money(y.organicGain) : '—'}
                </td>
                <td className={`num strong ${y.twr < 0 ? 'negative' : 'positive'}`}>
                  {y.recorded ? percent(y.twr) : '—'}
                </td>
                <td className="num muted">
                  {y.recorded && y.legacyReturn !== null ? percent(y.legacyReturn) : '—'}
                </td>
                <td className={`num delta ${material ? 'material' : 'trivial'}`}>
                  {shown ? `${delta! > 0 ? '+' : '−'}${Math.abs(delta!).toFixed(0)} bp` : '—'}
                </td>
                <td className="num muted">
                  {y.benchmark === null ? '—' : percent(y.benchmark)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="table-note">
        <strong>Return</strong> is chain-linked time-weighted. <strong>Legacy</strong> is what the
        original spreadsheet reported — dividing by the starting balance alone, which credits late
        contributions with a full year of growth. The two agree exactly in years with no
        contributions; Δ shows where they do not. • marks a year still in progress, ✎ a year with a
        note, and <em>no record</em> a year with no balance entered — the figure shown is the last
        one before it, carried forward, and it counts toward no average.
      </p>
    </div>
  );
}
