/**
 * The debts surface: what is owed, what it costs, and which order to clear it in.
 *
 * The comparison is the payoff. A schedule for one loan is arithmetic anybody's
 * bank already shows; what nobody shows is the same budget spent five different
 * ways with the difference in dollars and months on screen.
 *
 * The budget control is the only input, because it is the only thing the borrower
 * actually chooses. Everything else — rates, balances, what is left — comes from
 * the ledger.
 *
 * ## The order of the page, and why the control is not at the top
 *
 * Facts, then the record, then the model with its control attached to it. §19.2
 * asked for the budget control at the top and §24.1 overrules it: the budget
 * drives the comparison and nothing else, so putting it above the loan table puts
 * the whole table between a cause and its only effect. That is the defect §18.2
 * measured on the old landing page and §22.2 paid to fix on Plan. What §22
 * established is adjacency, not topness.
 *
 * The three tiles sit above the control precisely because none of them moves when
 * it does.
 */

import { m, type Loan, type LoanId } from '@varve/core';
import {
  compareLedger,
  loanStates,
  minimumBudget,
  payable,
  type Comparison,
  type LoanLedger,
  type Repayment,
} from '@varve/loans';
import { useMemo, useState } from 'react';
import { summariseDebts, type DebtRow } from '../lib/debts.js';
import { longDate, money, payment, rate } from '../lib/format.js';
import { PageTitle, ShareBar, Tile, Tiles } from './ui.js';

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
  const summary = useMemo(() => summariseDebts(states), [states]);
  const active = states.filter(payable);
  const floor = useMemo(() => minimumBudget(active), [active]);

  // Start at half again the contractual minimum: enough headroom that the
  // strategies visibly differ, which is the whole point of the page. A budget
  // exactly at the minimum makes every strategy identical and teaches nothing.
  const [budget, setBudget] = useState<number | null>(null);
  const chosen = budget ?? Math.ceil((floor.toNumber() * 1.5) / 50) * 50;


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
          summary.activeCount === 0
            ? 'Nothing owed'
            : `${money(summary.owed)} across ${summary.activeCount} ${summary.activeCount === 1 ? 'loan' : 'loans'}`
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
          {summary.activeCount > 0 ? (
            <Tiles label="What is owed">
              <Tile
                label="Owed"
                value={money(summary.owed)}
                detail={`across ${summary.activeCount} ${summary.activeCount === 1 ? 'loan' : 'loans'}`}
              />
              <Tile
                label="Costing you"
                value={money(summary.monthlyCost)}
                detail="a month, before anything is repaid"
              />
              <Tile
                label="Minimum"
                value={money(floor)}
                detail="the least that clears the interest"
              />
            </Tiles>
          ) : null}

          <LoanTable rows={summary.rows} onOpen={onOpen} />

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

/**
 * Every debt side by side, drawing something without a click.
 *
 * The meter is share of what is owed — the same one `AccountsTable` uses, and a
 * meter rather than a chart for the reason recorded there: one quantity against
 * its own whole, the figure carrying the value and the bar carrying the
 * proportion. Reading the bar is never required.
 *
 * A sparkline per loan was the obvious alternative and is wrong on the data:
 * most loans carry exactly one observation, and a sparkline of one point is a
 * dot pretending to be a trend (§24.2).
 *
 * **Costs a month** is the column that earns the page. The bar and that number
 * disagree routinely — a small balance at a punitive rate costs nearly what a
 * far larger cheap one does — and seeing that disagreement is the point.
 *
 * It is *not*, though, a ranking. An earlier draft of this comment and of the
 * table note said the mismatch is what the Blizzard strategy exploits, which is
 * backwards and was caught by looking at real numbers (§24.4): Blizzard chases
 * the largest monthly charge, that charge tracks the largest balance, and on a
 * mortgage-plus-store-card ledger it comes last by a wide margin. Monthly cost
 * says where the money is going. The rate says what to clear first, and the
 * comparison below is what actually works it out.
 */
function LoanTable({
  rows,
  onOpen,
}: {
  rows: readonly DebtRow[];
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
            <th scope="col" className="num">Share</th>
            <th scope="col" className="num">Rate</th>
            <th scope="col" className="num">Costs a month</th>
            <th scope="col" className="num">Payments left</th>
            <th scope="col" className="num">Contractual</th>
            <th scope="col">As of</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ state, active, monthlyCost, share }) => (
            <tr key={state.loan.id} className={active ? undefined : 'unrecorded'}>
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
              <td className="num muted">{share === null ? '—' : <ShareBar share={share} />}</td>
              <td className="num">{rate(state.loan.annualRate)}</td>
              <td className="num strong">{monthlyCost === null ? '—' : money(monthlyCost)}</td>
              <td className="num">{state.loan.termMonths}</td>
              <td className="num">{active ? payment(state.scheduledPayment) : '—'}</td>
              <td>{state.asOf ? longDate(state.asOf) : <span className="muted">never recorded</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="table-note">
        <strong>Costs a month</strong> is the interest alone, at today&rsquo;s balance — what a
        loan charges for existing, before a dollar comes off it. Read it against the share bar: a
        small balance at a high rate can cost nearly as much each month as one several times its
        size, and that gap is the rate at work. It is not the order to pay in, though — the
        strategies below work that out, and the one that chases the biggest monthly charge is rarely
        the one that wins. <strong>Contractual</strong> is what clears the balance over the payments
        remaining. <strong>As of</strong> matters: a payoff worked out from a balance six months
        stale is a different claim from one made this morning.
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
