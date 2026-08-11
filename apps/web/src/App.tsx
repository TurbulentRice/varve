import { accountId, m, type Account, type Money } from '@varve/core';
import {
  InMemoryRepository,
  PersistingRepository,
  decodeSnapshot,
  localSnapshotStore,
  type Repository,
  type Snapshot,
} from '@varve/store';
import {
  blockBootstrap,
  bootstrap,
  chanceOfReaching,
  deriveAccountHistories,
  deriveHistory,
  newAccount,
  normal,
  observedReturns,
  planYearEntry,
  simulate,
  type History,
  type ReturnModel,
  type YearEntry,
} from '@varve/retirement';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DASHBOARD } from './routing/route.js';
import { navigate, useRoute } from './routing/useRoute.js';
import { anchorBands, ProjectionChart, type BandPoint } from './charts/ProjectionChart.js';
import { Controls, type Settings } from './components/Controls.js';
import { Disclosure } from './components/Disclosure.js';
import { Hero } from './components/Hero.js';
import { HistoryTable } from './components/HistoryTable.js';
import { ProjectionTable } from './components/ProjectionTable.js';
import { AccountDetail } from './components/AccountDetail.js';
import { AccountsTable } from './components/AccountsTable.js';
import { StatTiles } from './components/StatTiles.js';
import { YearEditor } from './components/YearEditor.js';
import { downloadSnapshot } from './lib/download.js';
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

const store = localSnapshotStore();

export function App() {
  const [repo, setRepo] = useState<Repository | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  // Anything previously saved wins over the bundled sample. Loading is async so
  // a remote store slots in here later without touching anything downstream.
  useEffect(() => {
    void (async () => {
      let initial: Snapshot;
      try {
        initial = (await store.load()) ?? decodeSnapshot(JSON.stringify(sampleSnapshot));
      } catch {
        // A stored document this build cannot read must not brick the app.
        initial = decodeSnapshot(JSON.stringify(sampleSnapshot));
      }
      setRepo(new PersistingRepository(new InMemoryRepository(initial), store));
      setSnapshot(initial);
    })();
  }, []);

  const commit = useCallback(async () => {
    if (repo) setSnapshot(await repo.export());
  }, [repo]);

  if (!snapshot || !repo) return <div className="page loading">Loading…</div>;

  return <Ledger snapshot={snapshot} repo={repo} commit={commit} />;
}

function Ledger({
  snapshot,
  repo,
  commit,
}: {
  snapshot: Snapshot;
  repo: Repository;
  commit: () => Promise<void>;
}) {
  const history = useMemo<History>(() => deriveHistory(snapshot), [snapshot]);
  const observed = useMemo(() => observedReturns(history), [history]);

  const [error, setError] = useState<string | null>(null);
  const route = useRoute();

  const [settings, setSettings] = useState<Settings>(() => ({
    contribution: 10_000,
    years: 25,
    target: 1_000_000,
    model: 'bootstrap',
  }));

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

  const editableAccounts = useMemo(
    () => snapshot.accounts.filter((a) => a.kind !== 'benchmark'),
    [snapshot],
  );

  // A Snapshot satisfies Ledger structurally, so no conversion is needed.
  const accountHistories = useMemo(
    () => deriveAccountHistories(snapshot, history.currentValue),
    [snapshot, history.currentValue],
  );

  async function saveYear(year: number, entries: YearEntry[]) {
    const plan = planYearEntry(year, entries);
    await repo.saveObservations(plan.observations);
    await repo.saveFlows(plan.flows);
    await repo.deleteObservations(plan.removedObservations);
    await repo.deleteFlows(plan.removedFlows);
    await commit();
  }

  async function addAccount(name: string, kind: Account['kind']) {
    await repo.saveAccounts([
      newAccount(
        snapshot.household.id,
        name,
        kind === 'benchmark' ? 'retirement' : kind,
        snapshot.owners.map((o) => o.id),
      ),
    ]);
    await commit();
  }

  async function openFile(file: File) {
    try {
      await repo.replace(decodeSnapshot(await file.text()));
      await commit();
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  const selected =
    route.view === 'account'
      ? accountHistories.find((a) => a.account.id === route.accountId)
      : undefined;

  // A link to an account this ledger does not have — a stale bookmark, or one
  // sent from a different document.
  //
  // The first version quietly rewrote the URL to the dashboard. That was wrong
  // twice over: it behaved differently from an unrecognised route like
  // `#/nowhere`, which keeps its URL, and it destroyed the evidence. Someone
  // told "that link does not work" cannot say what they tried if the app has
  // already erased it.
  //
  // So the URL stands and the app says what happened. Absent is a fact worth
  // stating rather than normalising away — the same instinct as ground rule 3.
  const missingAccount = route.view === 'account' && !selected;

  if (selected) {
    return (
      <div className="page">
        <AccountDetail history={selected} onClose={() => navigate(DASHBOARD)} />
      </div>
    );
  }

  if (route.view === 'year') {
    const year = route.year;
    return (
      <div className="page">
        <YearEditor
          accounts={editableAccounts}
          observations={snapshot.observations}
          flows={snapshot.flows}
          year={year}
          // Stepping between years refines one destination rather than visiting
          // several, so it overwrites the entry instead of stacking fifteen of
          // them between the reader and the way out.
          onYearChange={(next) => navigate({ view: 'year', year: next }, { replace: true })}
          onSave={(entries) => saveYear(year, entries)}
          onAddAccount={addAccount}
          onClose={() => navigate(DASHBOARD)}
        />
      </div>
    );
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
        <div className="masthead-actions">
          <button
            type="button"
            className="primary"
            onClick={() => navigate({ view: 'year', year: new Date().getUTCFullYear() - 1 })}
          >
            Update numbers
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => downloadSnapshot(snapshot)}
            title="Download everything as a file you keep"
          >
            Export
          </button>
          <label className="ghost open">
            Open…
            <input
              type="file"
              accept=".json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void openFile(file);
              }}
            />
          </label>
        </div>
      </header>

      {error ? (
        <div className="error" role="alert">
          <strong>Could not open that file</strong>
          {error}
        </div>
      ) : null}

      {missingAccount ? (
        <div className="error" role="status">
          <strong>That account is not in this ledger</strong>
          The link names an account this document does not contain. It may belong to a different
          ledger, or the account may since have been removed.
        </div>
      ) : null}

      <Hero
        chance={chanceOfReaching(simulation, m(String(target)))}
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
        <Disclosure summary="Every recorded year" hint={`${history.years.length} years`}>
          <HistoryTable years={history.years} />
        </Disclosure>

        <Disclosure
          summary="Account by account"
          hint={`${accountHistories.length} accounts`}
          open
        >
          <AccountsTable
            accounts={accountHistories}
            onSelect={(id) => navigate({ view: 'account', accountId: accountId(id) })}
          />
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
        particular stretch, not a forecast. Your ledger is saved in this browser, which is
        convenient and not durable; <strong>Export</strong> is the copy you actually keep.
      </footer>
    </div>
  );
}
