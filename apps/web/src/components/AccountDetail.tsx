import type { AccountHistory } from '@varve/retirement';
import { ValueChart } from '../charts/ValueChart.js';
import { longDate, money, percent, points } from '../lib/format.js';
import { HistoryTable } from './HistoryTable.js';

const KIND_LABEL: Record<string, string> = {
  retirement: 'Retirement',
  brokerage: 'Brokerage',
  savings: 'Savings',
  college: 'College savings',
  benchmark: 'Benchmark',
};

export function AccountDetail({
  history,
  onClose,
}: {
  history: AccountHistory;
  onClose: () => void;
}) {
  const { account } = history;
  const benchmark = history.averageBenchmark;
  const ahead = benchmark !== null && history.averageReturn >= benchmark;

  const chartPoints = history.years.map((y) => ({
    year: y.year,
    value: y.endValue.toNumber(),
    recorded: y.recorded,
  }));

  return (
    <section className="detail">
      <header className="detail-head">
        <button type="button" className="ghost" onClick={onClose}>
          ← All accounts
        </button>
      </header>

      <div className="detail-title">
        <h2>{account.name}</h2>
        <p className="subtitle">
          {KIND_LABEL[account.kind] ?? account.kind}
          {history.owners.length > 0
            ? ` · ${history.owners.map((o) => o.name).join(' & ')}`
            : ''}
          {history.firstYear !== null
            ? ` · ${history.firstYear}–${history.closed ? history.lastYear : 'now'}`
            : ''}
          {history.closed ? ' · closed' : ''}
        </p>
      </div>

      <section className="tiles" aria-label="Account summary">
        <Tile
          label="Value"
          value={money(history.currentValue)}
          detail={
            history.closed
              ? 'closed — the money moved on'
              : `as of ${longDate(history.currentValueAsOf)}`
          }
        />
        <Tile
          label="Share of household"
          value={history.closed ? '—' : percent(history.shareOfHousehold, 0)}
          detail="of everything tracked today"
        />
        <Tile
          label="Paid in"
          value={money(history.totalContributed)}
          detail="excluding anything transferred in"
        />
        <Tile
          label="Earned"
          value={money(history.lifetimeGain)}
          detail="growth alone, transfers excluded"
        />
        <Tile
          label="Average return"
          value={history.years.length > 0 ? percent(history.averageReturn) : '—'}
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
          value={history.totalFees.isZero() ? '—' : money(history.totalFees)}
          detail="charged to this account"
        />
      </section>

      {chartPoints.length > 1 ? <ValueChart points={chartPoints} /> : null}

      <HistoryTable years={history.years} />
    </section>
  );
}

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      <div className="tile-detail">{detail}</div>
    </div>
  );
}
