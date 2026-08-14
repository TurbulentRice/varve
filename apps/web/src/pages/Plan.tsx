/**
 * The simulator, in a room of its own.
 *
 * Everything here is a model rather than a record, which is exactly why it was
 * worth separating (§19.1): it was the loudest thing on the landing page and the
 * only part of it that has not happened.
 *
 * The layout is the fix for the measurement in §18.2. A control sat 224px from
 * the chart it drove and **2.4 screens** from the numbers it drove, which
 * defeats the whole appeal of a simulator — watching things move together. Here
 * the order is headline, controls, chart, numbers, and the numbers are open
 * rather than folded into a disclosure. Everything a slider changes is on one
 * screen with it.
 */

import type { Money } from '@varve/core';
import type { ContributionPlan, Simulation } from '@varve/retirement';
import { ProjectionChart, type BandPoint } from '../charts/ProjectionChart.js';
import { Controls, type Settings } from '../components/Controls.js';
import { Savers, type SaverEdit } from '../components/Savers.js';
import { Hero } from '../components/Hero.js';
import { ProjectionTable } from '../components/ProjectionTable.js';
import { PageTitle } from '../components/ui.js';

export function Plan({
  chance,
  target,
  targetYear,
  median,
  settings,
  onSettingsChange,
  plan,
  onSaverChange,
  onRecordIncome,
  observedCount,
  history,
  bands,
  todayYear,
  simulation,
}: {
  chance: number;
  target: Money;
  targetYear: number;
  median: Money;
  settings: Settings;
  onSettingsChange: (next: Settings) => void;
  plan: ContributionPlan;
  onSaverChange: (edit: SaverEdit) => void;
  onRecordIncome: (ownerId: string, annual: string) => Promise<void>;
  observedCount: number;
  history: readonly { year: number; value: number }[];
  bands: readonly BandPoint[];
  todayYear: number;
  simulation: Simulation;
}) {
  return (
    <>
      <PageTitle
        title="Plan"
        subtitle="What the savings could do from here — a model, not a record"
      />

      <Hero chance={chance} target={target} targetYear={targetYear} median={median} />

      {plan.missingIncome.length > 0 ? (
        <div className="error" role="status">
          <strong>
            {plan.missingIncome.length === 1
              ? `${plan.missingIncome[0]!.name} has no salary recorded`
              : `${plan.missingIncome.length} people have no salary recorded`}
          </strong>
          A percentage of an unknown salary is unknown, not zero, so nothing is being projected for{' '}
          {plan.missingIncome.map((o) => o.name).join(' and ')}. Enter what they earn below.
        </div>
      ) : null}

      <Savers savers={plan.savers} onChange={onSaverChange} onRecordIncome={onRecordIncome} />

      <Controls
        settings={settings}
        onChange={onSettingsChange}
        contribution={plan.firstYearTotal}
        yearsToLastRetirement={plan.yearsToLastRetirement}
        observedCount={observedCount}
      />

      <ProjectionChart history={history} bands={bands} todayYear={todayYear} />

      <ProjectionTable simulation={simulation} startYear={todayYear} />

      <p className="footnote">
        Simulated from {observedCount} recorded years of this household&rsquo;s own returns. Past
        returns are a small and biased sample — they are what happened to these accounts over one
        particular stretch, not a forecast. Contributions step down as each person reaches the age
        they set, so the later years of this projection assume less going in than the early ones.
        This projects savings only — what is owed is not played
        forward alongside it, so read the figures here as one side of the position rather than the
        whole of it.
      </p>
    </>
  );
}
