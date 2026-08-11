import { m, type Money } from '@varve/core';
import { decodeSnapshot, type Snapshot } from '@varve/store';
import {
  blockBootstrap,
  bootstrap,
  chanceOfReaching,
  deriveHistory,
  normal,
  observedReturns,
  simulate,
  type History,
  type ReturnModel,
} from '@varve/retirement';
import { useMemo, useState } from 'react';
import { anchorBands, ProjectionChart, type BandPoint } from './charts/ProjectionChart.js';
import { Controls, type Settings } from './components/Controls.js';
import { Disclosure } from './components/Disclosure.js';
import { Hero } from './components/Hero.js';
import { HistoryTable } from './components/HistoryTable.js';
import { ProjectionTable } from './components/ProjectionTable.js';
import { StatTiles } from './components/StatTiles.js';
import sampleSnapshot from './data/sample-snapshot.json';

/**
 * A first target worth actually asking about.
 *
 * Where today's balance lands after the chosen horizon at a modest 7%, rounded
 * up to something memorable. Anchoring on today's balance instead — twice it,
 * say — sets a bar that decades of contributions clear on their own, and a hero
 * reading 100% before anyone has touched a control teaches the reader that this
 * tool always says yes.
 */
function defaultTarget(current: Money, years: number): number {
  const compounded = current.toNumber() * 1.07 ** years;
  const step = compounded > 2_000_000 ? 500_000 : 100_000;
  return Math.max(Math.ceil(compounded / step) * step, 100_000);
}

function modelFor(choice: Settings['model'], observed: readonly number[]): ReturnModel {
  // A history too short to resample from falls back to a distribution rather
  // than pretending three data points describe a market.
  if (observed.length < 3) return normal(0.07, 0.15);

  switch (choice) {
    case 'block':
      return blockBootstrap(observed, 3);
    case 'normal': {
      const mean = observed.reduce((a, b) => a + b, 0) / observed.length;
      const variance =
        observed.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(observed.length - 1, 1);
      return normal(mean, Math.sqrt(variance));
    }
    default:
      return bootstrap([...observed]);
  }
}

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>(() =>
    decodeSnapshot(JSON.stringify(sampleSnapshot)),
  );
  const [error, setError] = useState<string | null>(null);

  const history = useMemo<History>(() => deriveHistory(snapshot), [snapshot]);
  const observed = useMemo(() => observedReturns(history), [history]);

  const [settings, setSettings] = useState<Settings>(() => ({
    contribution: 10_000,
    years: 25,
    target: 1_000_000,
    model: 'bootstrap',
  }));

  // The default target depends on the ledger, so it follows a newly opened one
  // rather than stranding the reader on a number from someone else's finances.
  const [targetTouched, setTargetTouched] = useState(false);
  const target = targetTouched
    ? settings.target
    : defaultTarget(history.currentValue, settings.years);

  const simulation = useMemo(
    () =>
      simulate({
        startingValue: history.currentValue,
        annualContribution: m(String(settings.contribution)),
        years: settings.years,
        returns: modelFor(settings.model, observed),
      }),
    [history.currentValue, settings.contribution, settings.years, settings.model, observed],
  );

  const lastYear = history.years[history.years.length - 1]?.year ?? new Date().getUTCFullYear();

  const bands = useMemo<BandPoint[]>(
    () =>
      anchorBands(
        simulation.years.map((row) => ({
          year: lastYear + row.year,
          p10: row.band.p10.toNumber(),
          p25: row.band.p25.toNumber(),
          median: row.band.median.toNumber(),
          p75: row.band.p75.toNumber(),
          p90: row.band.p90.toNumber(),
        })),
        lastYear,
        history.currentValue,
      ),
    [simulation, lastYear, history.currentValue],
  );

  const historyPoints = useMemo(
    () => history.years.map((y) => ({ year: y.year, value: y.endValue.toNumber() })),
    [history],
  );

  const chance = chanceOfReaching(simulation, m(String(target)));

  async function openSnapshot(file: File) {
    try {
      setSnapshot(decodeSnapshot(await file.text()));
      setTargetTouched(false);
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <h1>{history.householdName}</h1>
          <p className="subtitle">
            {history.owners.map((o) => o.name).join(' & ')} · {history.accounts.length} accounts ·{' '}
            {history.years.length} years recorded
          </p>
        </div>
        <label className="open">
          Open a snapshot…
          <input
            type="file"
            accept=".json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void openSnapshot(file);
            }}
          />
        </label>
      </header>

      {error ? (
        <div className="error" role="alert">
          <strong>Could not open that file</strong>
          {error}
        </div>
      ) : null}

      <Hero
        chance={chance}
        target={m(String(target))}
        targetYear={lastYear + settings.years}
        median={simulation.finalValue.median}
      />

      <Controls
        settings={{ ...settings, target }}
        onChange={(next) => {
          if (next.target !== target) setTargetTouched(true);
          setSettings(next);
        }}
        observedCount={observed.length}
      />

      <ProjectionChart history={historyPoints} bands={bands} todayYear={lastYear} />

      <StatTiles history={history} />

      <div className="details">
        <Disclosure
          summary="Every recorded year"
          hint={`${history.years.length} years`}
        >
          <HistoryTable years={history.years} />
        </Disclosure>

        <Disclosure
          summary="The projection, as numbers"
          hint={`${simulation.runs.toLocaleString()} runs`}
        >
          <ProjectionTable simulation={simulation} startYear={lastYear} />
        </Disclosure>
      </div>

      <footer className="footnote">
        Simulated from {observed.length} recorded years of this household&rsquo;s own returns. Past
        returns are a small and biased sample — they are what happened to these accounts over one
        particular stretch, not a forecast.
      </footer>
    </div>
  );
}
