/**
 * The loans surface: what is owed, and which order to clear it in.
 *
 * The comparison is the payoff and leads the page. A schedule for one loan is
 * arithmetic anybody's bank already shows; what nobody shows is the same budget
 * spent five different ways with the difference in pounds and months on screen.
 *
 * The budget control is the only input, because it is the only thing the
 * borrower actually chooses. Everything else — rates, balances, what is left —
 * comes from the ledger.
 */

import { Money, m, type Loan, type LoanId } from '@varve/core';
import {
  compareLedger,
  loanStates,
  minimumBudget,
  payable,
  type Comparison,
  type LoanLedger,
  type LoanState,
  type Repayment,
} from '@varve/loans';
import { useMemo, useState } from 'react';
import { longDate, money, payment, rate } from '../lib/format.js';
import { PageTitle } from './ui.js';

const STRATEGY_LABEL: Record<string, string> = {
  avalanche: 'Avalanche',
  blizzard: 'Blizzard',
  snowball: 'Snowball',
  cascade: 'Cascade',
  'ice-slide': 'Ice slide',
};

const STRATEGY_NOTE: Record<string, string> = {
  avalanche: 'Highest rate first',
  blizzard: 'Costliest each month',
  snowball: 'Smallest balance first',
  cascade: 'Spread by rate',
  'ice-slide': 'Spread by monthly cost',
};

export function LoansView({
  ledger,
  onOpen,
  onAdd,
}: {
  ledger: LoanLedger;
  onOpen: (id: LoanId) => void;
  onAdd: () => void;
}) {
  const states = useMemo(() => loanStates(ledger), [ledger]);
  const active = states.filter(payable);
  const floor = useMemo(() => minimumBudget(active), [active]);

  // Start at half again the contractual minimum: enough headroom that the
  // strategies visibly differ, which is the whole point of the page. A budget
  // exactly at the minimum makes every strategy identical and teaches nothing.
  const [budget, setBudget] = useState<number | null>(null);
  const chosen = budget ?? Math.ceil((floor.toNumber() * 1.5) / 50) * 50;

  const owed = Money.sum(active.map((s) => s.balance));

  let comparison: Comparison | null = null;
  let tooLow: string | null = null;
  try {
    comparison = active.length > 0 ? compareLedger(ledger, { budget: m(String(chosen)) }) : null;
  } catch (cause) {
    tooLow = (cause as Error).message;
  }

  return (
    <>
      <PageTitle
        title="Debts"
        subtitle={
          active.length === 0
            ? 'Nothing owed'
            : `${money(owed)} across ${active.length} ${active.length === 1 ? 'loan' : 'loans'}`
        }
        actions={
          <button type="button" className="primary" onClick={onAdd}>
            Add a loan
          </button>
        }
      />

      {states.length === 0 ? (
        <Empty onAdd={onAdd} />
      ) : (
        <>
          <LoanTable states={states} onOpen={onOpen} />

          {active.length > 0 ? (
            <>
              <section className="controls" aria-label="Repayment budget">
                <div className="control">
                  <span className="control-label">Paying each month</span>
                  <span className="control-value">{money(m(String(chosen)))}</span>
                  <input
                    type="range"
                    aria-label="Monthly budget"
                    min={Math.floor(floor.toNumber())}
                    max={Math.max(Math.ceil(floor.toNumber() * 5), Math.floor(floor.toNumber()) + 500)}
                    step={25}
                    value={chosen}
                    onChange={(e) => setBudget(Number(e.target.value))}
                  />
                  <span className="control-label">
                    Minimum {money(floor)} — anything less never clears the interest
                  </span>
                </div>
              </section>

              {tooLow ? (
                <div className="error" role="status">
                  <strong>That budget is too small</strong>
                  {tooLow}
                </div>
              ) : comparison ? (
                <StrategyComparison comparison={comparison} />
              ) : null}
            </>
          ) : null}
        </>
      )}
    </>
  );
}

function Empty({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="editor-lead">
      <p>
        Nothing here yet. Add what you owe — the balance, the rate, and how many payments are left —
        and this will work out which order to clear it in.
      </p>
      <p className="muted">
        Those three are what a statement tells you. Nothing here needs the original loan amount, or
        when you took it out.
      </p>
      <button type="button" className="primary" onClick={onAdd}>
        Add a loan
      </button>
    </div>
  );
}

function LoanTable({
  states,
  onOpen,
}: {
  states: readonly LoanState[];
  onOpen: (id: LoanId) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <caption className="table-caption">What is owed</caption>
        <thead>
          <tr>
            <th scope="col">Loan</th>
            <th scope="col" className="num">Owed</th>
            <th scope="col" className="num">Rate</th>
            <th scope="col" className="num">Payments left</th>
            <th scope="col" className="num">Contractual</th>
            <th scope="col">As of</th>
          </tr>
        </thead>
        <tbody>
          {states.map((state) => (
            <tr key={state.loan.id} className={payable(state) ? undefined : 'unrecorded'}>
              <th scope="row">
                <button type="button" className="link" onClick={() => onOpen(state.loan.id)}>
                  {state.loan.name}
                </button>
                <span className="kind">{state.loan.kind.replace('-', ' ')}</span>
              </th>
              <td className="num">
                {/* Ground rule 3: a loan nobody has entered a balance for is not
                    a loan of nothing. Blank says unknown; $0 would say cleared. */}
                {state.observed ? money(state.balance) : '—'}
              </td>
              <td className="num">{rate(state.loan.annualRate)}</td>
              <td className="num">{state.loan.termMonths}</td>
              <td className="num">
                {state.observed && payable(state) ? payment(state.scheduledPayment) : '—'}
              </td>
              <td>{state.asOf ? longDate(state.asOf) : <span className="muted">never recorded</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="table-note">
        <strong>Contractual</strong> is what clears the balance over the payments remaining.{' '}
        <strong>As of</strong> matters: a payoff worked out from a balance six months stale is a
        different claim from one made this morning.
      </p>
    </div>
  );
}

function StrategyComparison({ comparison }: { comparison: Comparison }) {
  const best = comparison.ranked[0]!;
  const worst = comparison.ranked[comparison.ranked.length - 1]!;

  return (
    <>
      <section className="hero" aria-label="Best strategy">
        <p className="hero-lead">Clearing this debt costs least with</p>
        <p className="hero-figure">{STRATEGY_LABEL[best.strategy]}</p>
        <p className="hero-detail">
          {money(best.interestPaid)} of interest over {best.months} months.{' '}
          {comparison.spread.isZero() ? (
            'Every strategy comes out the same here.'
          ) : (
            <>
              Choosing the worst instead costs{' '}
              <strong>{money(comparison.spread)}</strong> more.
            </>
          )}
        </p>
      </section>

      <div className="table-scroll">
        <table>
          <caption className="table-caption">The same budget, five ways</caption>
          <thead>
            <tr>
              <th scope="col">Strategy</th>
              <th scope="col" className="num">Interest</th>
              <th scope="col" className="num">Months</th>
              <th scope="col" className="num">vs best</th>
              <th scope="col">Order cleared</th>
            </tr>
          </thead>
          <tbody>
            {comparison.ranked.map((result) => (
              <Row key={result.strategy} result={result} best={best} worst={worst} />
            ))}
          </tbody>
        </table>
        <p className="table-note">
          Every row spends the same budget every month. What differs is where the money left over
          after each loan&rsquo;s interest gets sent.
        </p>
      </div>
    </>
  );
}

function Row({
  result,
  best,
  worst,
}: {
  result: Repayment;
  best: Repayment;
  worst: Repayment;
}) {
  const extra = result.interestPaid.minus(best.interestPaid);

  return (
    <tr className={result.strategy === worst.strategy && !extra.isZero() ? 'unrecorded' : undefined}>
      <th scope="row">
        {STRATEGY_LABEL[result.strategy]}
        <span className="kind">{STRATEGY_NOTE[result.strategy]}</span>
      </th>
      <td className="num">{money(result.interestPaid)}</td>
      <td className="num">{result.months}</td>
      <td className="num">
        {/* The sign carries the meaning, not the colour — the deuteranopia
            finding from §10 applies to every signed figure in this app. */}
        {extra.isZero() ? <span className="muted">best</span> : `+${money(extra)}`}
      </td>
      <td>
        {result.schedules
          .slice()
          .sort((a, b) => a.installments.length - b.installments.length)
          .map((s) => s.terms.title)
          .join(' → ')}
      </td>
    </tr>
  );
}
