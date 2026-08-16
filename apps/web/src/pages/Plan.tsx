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
import type { Simulation } from '@varve/retirement';
import type { SavingResult } from '../lib/saving.js';
import { ProjectionChart, type BandPoint } from '../charts/ProjectionChart.js';
import { Controls, type Settings } from '../components/Controls.js';
import {
  SavingControl,
  type PersonOverride,
  type SavingSettings,
} from '../components/SavingControl.js';
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
  saving,
  onSavingChange,
  overrides,
  onOverride,
  result,
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
  saving: SavingSettings;
  onSavingChange: (next: SavingSettings) => void;
  overrides: readonly PersonOverride[];
  onOverride: (next: PersonOverride) => void;
  result: SavingResult;
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

      <Controls
        settings={settings}
        onChange={onSettingsChange}
        yearsToLastRetirement={result.yearsToLastRetirement}
        observedCount={observedCount}
        saving={
          <SavingControl
            settings={saving}
            onChange={onSavingChange}
            savers={result.plan.savers}
            overrides={overrides}
            onOverride={onOverride}
            total={result.firstYearTotal}
          />
        }
      />

      {result.missingIncome.length > 0 ? (
        <div className="error" role="status">
          <strong>
            {result.missingIncome.length === 1
              ? `${result.missingIncome[0]!.name} has no salary recorded`
              : `${result.missingIncome.length} people have no salary recorded`}
          </strong>
          A percentage of an unknown salary is unknown, not zero, so nothing is being projected for{' '}
          {result.missingIncome.map((o) => o.name).join(' and ')}. Record what they earn under{' '}
          <strong>Update numbers</strong>.
        </div>
      ) : null}

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
