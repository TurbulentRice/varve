import type { History } from '@varve/retirement';
import { money, percent, points } from '../lib/format.js';
import { Tile, Tiles } from './ui.js';

/**
 * The recorded facts, as figures rather than a chart.
 *
 * Four single numbers with no trend to show between them — a chart here would
 * be four bars of unrelated quantities, which is the classic way a chart misses
 * its own point.
 *
 * `Value` used to lead this row and is gone. On two pages it merely echoed the
 * Overview's `Assets` tile; on the merged page it sat eight inches below it
 * showing the identical figure under a different word, which is the duplication
 * §31.1 set out to remove rather than relocate. Caught by looking at the merged
 * page, which is ground rule 5 doing its job on my own change.
 */
export function StatTiles({ history }: { history: History }) {
  const benchmark = history.averageBenchmark;
  const ahead = benchmark !== null && history.averageReturn >= benchmark;

  return (
    <Tiles label="Summary">
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
    </Tiles>
  );
}
