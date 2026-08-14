import type { BalanceObservation, Flow } from '@varve/core';
import type { AccountHistory } from '@varve/retirement';
import { useEffect, useState } from 'react';
import { ValueChart } from '../charts/ValueChart.js';
import { longDate, money, percent, points } from '../lib/format.js';
import { HistoryTable } from './HistoryTable.js';
import { AccountYearEditor, type YearChange } from './AccountYearEditor.js';
import { BackLink, PageTitle, Tile, Tiles } from './ui.js';

const KIND_LABEL: Record<string, string> = {
  retirement: 'Retirement',
  brokerage: 'Brokerage',
  savings: 'Savings',
  college: 'College savings',
  benchmark: 'Benchmark',
};

export function AccountDetail({
  history,
  observations,
  flows,
  onSaveYears,
  onClose,
}: {
  history: AccountHistory;
  observations: readonly BalanceObservation[];
  flows: readonly Flow[];
  onSaveYears: (changes: YearChange[]) => Promise<void>;
  onClose: () => void;
}) {
  const { account } = history;
  const [editing, setEditing] = useState(false);

  // Opening a different account closes the editor. A half-typed correction to
  // one account has no meaning against another's figures, and leaving the mode
  // on makes it look like it does (§26.3).
  useEffect(() => setEditing(false), [account.id]);
  const benchmark = history.averageBenchmark;
  const ahead = benchmark !== null && history.averageReturn >= benchmark;

  const chartPoints = history.years.map((y) => ({
    year: y.year,
    value: y.endValue.toNumber(),
    recorded: y.recorded,
  }));

  return (
    <section className="detail">
      <BackLink label="All accounts" onClick={onClose} />

      <PageTitle
        title={account.name}
        subtitle={
          (KIND_LABEL[account.kind] ?? account.kind) +
          (history.owners.length > 0 ? ` · ${history.owners.map((o) => o.name).join(' & ')}` : '') +
          (history.firstYear !== null
            ? ` · ${history.firstYear}–${history.closed ? history.lastYear : 'now'}`
            : '') +
          (history.closed ? ' · closed' : '')
        }
        actions={
          editing ? null : (
            <button type="button" className="ghost" onClick={() => setEditing(true)}>
              Correct the figures
            </button>
          )
        }
      />

      <Tiles label="Account summary">
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
      </Tiles>

      {editing ? (
        <AccountYearEditor
          account={account}
          rows={history.years}
          observations={observations}
          flows={flows}
          onSave={onSaveYears}
          onDone={() => setEditing(false)}
        />
      ) : (
        <>
          {chartPoints.length > 1 ? <ValueChart points={chartPoints} /> : null}

          <HistoryTable years={history.years} />
        </>
      )}
    </section>
  );
}
