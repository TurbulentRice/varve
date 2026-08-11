import type { History } from '@varve/retirement';
import { longDate, money, percent, points } from '../lib/format.js';

/**
 * The recorded facts, as figures rather than a chart.
 *
 * Five single numbers with no trend to show between them — a chart here would
 * be five bars of unrelated quantities, which is the classic way a chart misses
 * its own point.
 */
export function StatTiles({ history }: { history: History }) {
  const benchmark = history.averageBenchmark;
  const ahead = benchmark !== null && history.averageReturn >= benchmark;

  return (
    <section className="tiles" aria-label="Summary">
      <Tile
        label="Value"
        value={money(history.currentValue)}
        detail={`as of ${longDate(history.currentValueAsOf)}`}
      />
      <Tile
        label="Contributed"
        value={money(history.totalContributed)}
        detail="over the tracked years"
      />
      <Tile
        label="Earned"
        value={money(history.lifetimeGain)}
        detail="growth, excluding what was paid in"
      />
      <Tile
        label="Average return"
        value={percent(history.averageReturn)}
        detail={
          benchmark === null
            ? 'annual, time-weighted'
            : `benchmark ${percent(benchmark)} · ${ahead ? 'ahead' : 'behind'} by ${points(
                history.averageReturn - benchmark,
              )}`
        }
      />
      <Tile
        label="Fees paid"
        value={money(history.totalFees)}
        detail="the cost of ownership"
      />
    </section>
  );
}

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      {/* Proportional figures: tabular digits make a display number look gappy. */}
      <div className="tile-value">{value}</div>
      <div className="tile-detail">{detail}</div>
    </div>
  );
}
