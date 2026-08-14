/**
 * The application: one shell, four destinations, and the writes that reach the
 * repository.
 *
 * What used to be here was a 120-line render doing five jobs on one page, which
 * §18.3 diagnosed as a changelog of what got built rather than an answer to what
 * someone came to find out. Each job is now a page under `pages/`, and what is
 * left in this file is the part that genuinely belongs to the application: the
 * ledger, the derivations every surface reads from, and the handful of functions
 * that write. See §22.2 for where each piece of the old page went.
 */

import {
  incomeObservationId,
  isoDate,
  loanId as toLoanId,
  loanObservationId,
  loanPaymentId,
  m,
  Money,
  type Account,
  type Loan,
  type LoanId,
  type Owner,
} from '@varve/core';
import { findLoanState, loanCost, schedulePosition } from '@varve/loans';
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
  contributionPlan,
  newAccount,
  normal,
  parseAmount,
  observedReturns,
  planYearEntry,
  simulate,
  type History,
  type ReturnModel,
  type SaverIntent,
  type YearEntry,
} from '@varve/retirement';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatRoute, OVERVIEW } from './routing/route.js';
import { navigate, useRoute } from './routing/useRoute.js';
import { anchorBands, type BandPoint } from './charts/ProjectionChart.js';
import { type Settings } from './components/Controls.js';
import { AccountDetail } from './components/AccountDetail.js';
import { Shell } from './components/Shell.js';
import { BackLink } from './components/ui.js';
import { YearEditor } from './components/YearEditor.js';
import { LoansView } from './components/LoansView.js';
import { LoanDetail } from './components/LoanDetail.js';
import { LoanEditor, type LoanDraft } from './components/LoanEditor.js';
import type { YearChange } from './components/AccountYearEditor.js';
import { Overview } from './pages/Overview.js';
import { Accounts } from './pages/Accounts.js';
import { Plan } from './pages/Plan.js';
import { downloadSnapshot } from './lib/download.js';
import { householdNetWorth } from './lib/net-worth.js';
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
  // Editing is a mode within a loan route rather than a route of its own: a
  // half-typed form is not a place worth linking someone to.
  const [editingLoan, setEditingLoan] = useState<LoanId | 'new' | null>(null);

  /**
   * A mode does not outlive the route it was opened from.
   *
   * §22's shell created this and §24.4 caught it: before there was persistent
   * navigation, the only ways out of the loan editor were its own buttons, so a
   * mode could not survive a navigation because a navigation could not happen.
   * With a nav bar it can. Leaving Debts mid-edit and coming back reopened the
   * form — and worse, opening the editor on one loan and then clicking Debts
   * showed a blank *new loan* form, because that branch renders `existing={null}`
   * for any non-null mode. Two different states rendering as one.
   *
   * Keyed on the formatted route rather than the object so that stepping within
   * a route does not count, and so the dependency is a string rather than an
   * identity that has to be trusted.
   */
  const here = formatRoute(route);
  useEffect(() => {
    setEditingLoan(null);
  }, [here]);

  const [settings, setSettings] = useState<Settings>(() => ({
    years: 25,
    target: 1_000_000,
    model: 'bootstrap',
  }));

  /**
   * What each person intends: a share of what they earn, and when they stop.
   *
   * Component state, not ledger records. §28.3 draws the line — an intention is
   * not a measurement of anything that happened, so changing your mind about
   * retiring at 62 loses nothing because there was never a fact there. Changing
   * your salary keeps the old figure, because there was.
   */
  const [intents, setIntents] = useState<readonly SaverIntent[]>([]);

  const contributions = useMemo(
    () =>
      contributionPlan({
        owners: snapshot.owners,
        incomes: snapshot.incomeObservations,
        intents: snapshot.owners.map(
          (o) =>
            intents.find((i) => i.ownerId === o.id) ?? {
              ownerId: o.id,
              // A default that is a real recommendation rather than a shrug, and
              // low enough that nobody reads the first render as a promise.
              rate: 0.1,
              retirementAge: 65,
            },
        ),
        asOf: isoDate(new Date().toISOString().slice(0, 10)),
        years: settings.years,
      }),
    [snapshot.owners, snapshot.incomeObservations, intents, settings.years],
  );

  const [targetTouched, setTargetTouched] = useState(false);
  const target = targetTouched
    ? settings.target
    : defaultTarget(history.currentValue, settings.years);

  const simulation = useMemo(
    () =>
      simulate({
        startingValue: history.currentValue,
        // Kept for the shape; the schedule is what actually applies, and it is
        // what lets two people stop saving in different years (§28.4).
        annualContribution: contributions.firstYearTotal,
        contributionSchedule: contributions.schedule,
        years: settings.years,
        returns: modelFor(settings.model, observed),
      }),
    [history.currentValue, contributions, settings.years, settings.model, observed],
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

  /**
   * Assets against debts, at two resolutions — see `lib/net-worth.ts`.
   *
   * This was forty lines of `useMemo` here, quadratic and untestable, until §22.4
   * gave it a home where it could be read.
   */
  const netWorth = useMemo(
    () =>
      householdNetWorth({
        years: history.years,
        loans: snapshot.loans,
        loanObservations: snapshot.loanObservations,
      }),
    [history.years, snapshot.loans, snapshot.loanObservations],
  );

  /**
   * How far out of date the record is, in years.
   *
   * The Overview says so when it is two or more, because everything on that page
   * then describes a household that has since moved on. Measured against the
   * calendar rather than against the last row, since a ledger that stopped in
   * 2019 has five stale years whether or not anyone opened it since.
   */
  const lastRecorded = history.years.filter((y) => y.recorded).at(-1)?.year ?? null;
  // No recorded year at all is not "stale", it is empty, and the Overview says
  // that in its own words rather than reporting a two-thousand-year gap.
  const staleYears = lastRecorded === null ? 0 : Math.max(new Date().getUTCFullYear() - lastRecorded, 0);

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

  /**
   * Corrections to one account, across however many years were touched.
   *
   * Planned year by year — `planYearEntry` is per-year by construction — but
   * written once. A correction that half-applies is worse than one that took
   * another click, and the ids are derived per account and per year, so nothing
   * here can reach another account's records for the same year (§26.1).
   */
  async function saveAccountYears(changes: readonly YearChange[]) {
    const plans = changes.map((change) => planYearEntry(change.year, [change.entry]));

    await repo.saveObservations(plans.flatMap((p) => p.observations));
    await repo.saveFlows(plans.flatMap((p) => p.flows));
    await repo.deleteObservations(plans.flatMap((p) => p.removedObservations));
    await repo.deleteFlows(plans.flatMap((p) => p.removedFlows));
    await commit();
  }

  /**
   * Record what someone earns, as of today.
   *
   * The id is derived from the owner and the date, so entering a figure twice in
   * one day corrects that day's record rather than stacking two — the same
   * forgiving rule a balance observation follows, and the opposite of a payment,
   * where two in a day are two events (§16.5).
   */
  async function recordIncome(owner: string, annual: string) {
    const today = isoDate(new Date().toISOString().slice(0, 10));
    const parsed = parseAmount(annual);
    if (!parsed) return;

    await repo.saveIncomeObservations([
      {
        id: incomeObservationId(`inc:${owner}:${today}`),
        ownerId: owner as Owner['id'],
        asOf: today,
        annualAmount: parsed,
        source: 'manual',
      },
    ]);
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

  /**
   * Save a drafted loan, and record what is owed as an observation.
   *
   * Two writes rather than one, because they are two different facts: the loan's
   * terms, and a dated statement of its balance. The observation id is derived
   * from the loan and the date, so saving twice in a day corrects that day's
   * figure instead of stacking duplicates — the same forgiving behaviour the
   * year editor has.
   */
  async function saveLoan(draft: LoanDraft, existing: Loan | null) {
    const id = existing?.id ?? toLoanId(`loan:${crypto.randomUUID()}`);
    const today = isoDate(new Date().toISOString().slice(0, 10));

    await repo.saveLoans([
      {
        id,
        householdId: snapshot.household.id,
        name: draft.name.trim(),
        ownerIds: snapshot.owners.map((o) => o.id),
        kind: draft.kind,
        // Percent in the form, fraction in the ledger. Converted once, here.
        //
        // Rounded to six places only to keep float noise out of the exported
        // document — 18.99 / 100 is 0.18989999999999999 in IEEE 754, which
        // looks broken in a file someone opens. This is not money-rounding a
        // rate: six places is a ten-thousandth of a percent, far finer than any
        // rate is ever quoted.
        annualRate: Number((draft.ratePercent / 100).toFixed(6)),
        termMonths: draft.termMonths,
      },
    ]);

    await repo.saveLoanObservations([
      {
        id: loanObservationId(`lobs:${id}:${today}`),
        loanId: id,
        asOf: today,
        amount: m(draft.balance.trim()),
        source: 'manual',
      },
    ]);

    await commit();
  }

  /**
   * Record that money left, and nothing more.
   *
   * Deliberately does not touch the balance: a payment is evidence about a
   * payment, and what is owed is whatever the lender says next (§16.4). The id
   * is random rather than derived from the date, because two payments in one day
   * are two payments — unlike a balance, where the second reading of a day
   * corrects the first.
   */
  async function recordPayment(id: LoanId, amount: string) {
    await repo.saveLoanPayments([
      {
        id: loanPaymentId(`lpay:${crypto.randomUUID()}`),
        loanId: id,
        paidOn: isoDate(new Date().toISOString().slice(0, 10)),
        amount: m(amount),
      },
    ]);
    await commit();
  }

  async function deleteLoan(id: LoanId) {
    await repo.deleteLoans([id]);
    await commit();
    navigate({ view: 'debts' });
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

  return (
    <Shell
      householdName={history.householdName}
      owners={history.owners.map((o) => o.name).join(' & ')}
      route={route}
      onUpdateNumbers={() => navigate({ view: 'year', year: new Date().getUTCFullYear() - 1 })}
      onExport={() => downloadSnapshot(snapshot)}
      onOpenFile={(file) => void openFile(file)}
    >
      {error ? (
        <div className="error" role="alert">
          <strong>Could not open that file</strong>
          {error}
        </div>
      ) : null}

      {renderRoute()}
    </Shell>
  );

  function renderRoute() {
    if (route.view === 'account') {
      // The URL stands even when it names nothing, so the message and the way
      // back are what this page is.
      if (missingAccount) {
        return (
          <>
            <div className="error" role="status">
              <strong>That account is not in this ledger</strong>
              The link names an account this document does not contain. It may belong to a
              different ledger, or the account may since have been removed.
            </div>
            <BackLink label="All accounts" onClick={() => navigate({ view: 'accounts' })} />
          </>
        );
      }

      return (
        <AccountDetail
          history={selected!}
          observations={snapshot.observations}
          flows={snapshot.flows}
          onSaveYears={saveAccountYears}
          onClose={() => navigate({ view: 'accounts' })}
        />
      );
    }

    if (route.view === 'accounts') {
      return (
        <Accounts
          history={history}
          accounts={accountHistories}
          onUpdateNumbers={() => navigate({ view: 'year', year: new Date().getUTCFullYear() - 1 })}
        />
      );
    }

    if (route.view === 'debts') {
      return editingLoan === null ? (
        <LoansView
          ledger={snapshot}
          onOpen={(id) => navigate({ view: 'debt', loanId: id })}
          onAdd={() => setEditingLoan('new')}
        />
      ) : (
        <LoanEditor existing={null} onSave={saveLoan} onClose={() => setEditingLoan(null)} />
      );
    }

    if (route.view === 'debt') {
      const loan = snapshot.loans.find((l) => l.id === route.loanId);
      if (!loan) {
        return (
          <>
            <div className="error" role="status">
              <strong>That loan is not in this ledger</strong>
              The link names a loan this document does not contain.
            </div>
            <BackLink label="All debts" onClick={() => navigate({ view: 'debts' })} />
          </>
        );
      }

      const state = findLoanState(snapshot, route.loanId);
      return editingLoan === null ? (
        <LoanDetail
          state={state}
          cost={loanCost(loan, snapshot.loanObservations, snapshot.loanPayments)}
          position={schedulePosition(state, snapshot.loanObservations, snapshot.loanPayments)}
          onEdit={() => setEditingLoan(route.loanId)}
          onDelete={deleteLoan}
          onRecordPayment={(amount) => recordPayment(route.loanId, amount)}
          onClose={() => navigate({ view: 'debts' })}
        />
      ) : (
        <LoanEditor existing={state} onSave={saveLoan} onClose={() => setEditingLoan(null)} />
      );
    }

    if (route.view === 'year') {
      return (
        <YearEditor
          accounts={editableAccounts}
          observations={snapshot.observations}
          flows={snapshot.flows}
          year={route.year}
          // Stepping between years refines one destination rather than visiting
          // several, so it overwrites the entry instead of stacking fifteen of
          // them between the reader and the way out.
          onYearChange={(next) => navigate({ view: 'year', year: next }, { replace: true })}
          onSave={(entries) => saveYear(route.year, entries)}
          onAddAccount={addAccount}
          onClose={() => navigate(OVERVIEW)}
        />
      );
    }

    if (route.view === 'plan') {
      return (
        <Plan
          chance={chanceOfReaching(simulation, m(String(target)))}
          target={m(String(target))}
          targetYear={lastYear + settings.years}
          median={simulation.finalValue.median}
          settings={{ ...settings, target }}
          onSettingsChange={(next) => {
            if (next.target !== target) setTargetTouched(true);
            setSettings(next);
          }}
          plan={contributions}
          onSaverChange={(edit) =>
            setIntents((previous) => [
              ...previous.filter((i) => i.ownerId !== edit.ownerId),
              { ownerId: edit.ownerId, rate: edit.rate, retirementAge: edit.retirementAge },
            ])
          }
          onRecordIncome={recordIncome}
          observedCount={observed.length}
          history={historyPoints}
          bands={bands}
          todayYear={lastYear}
          simulation={simulation}
        />
      );
    }

    return (
      <Overview
        netWorth={netWorth}
        staleYears={staleYears}
        onRecordDebts={() => navigate({ view: 'debts' })}
        onUpdateNumbers={() => navigate({ view: 'year', year: new Date().getUTCFullYear() - 1 })}
      />
    );
  }
}
