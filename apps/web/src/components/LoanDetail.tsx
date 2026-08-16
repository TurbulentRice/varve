/**
 * One loan, played forward.
 *
 * Three questions worth answering here and nowhere else: what does this cost if
 * nothing changes, what changes if I pay more, and — since §25 — am I actually
 * keeping up. The second is the reason the page has a control at all: a fixed
 * schedule is something a bank already sends, and the interesting number is how
 * much of it disappears for an extra fifty a month.
 *
 * The third sits directly above that control, because whether you are currently
 * ahead is the context for deciding to pay more. Same adjacency argument §24.1
 * made about the budget on the Debts page.
 */

import { Money, m, type LoanId } from '@varve/core';
import type { LoanCost, SchedulePosition } from '@varve/loans';
import { projectLoan, type LoanProjection, type LoanState } from '@varve/loans';
import { useState } from 'react';
import { longDate, money, payment, rate } from '../lib/format.js';
import { Disclosure } from './Disclosure.js';
import { BackLink, PageTitle, Tile, Tiles } from './ui.js';
import { MoneyInput } from './MoneyInput.js';
import { ScheduleChart } from '../charts/ScheduleChart.js';

export function LoanDetail({
  state,
  cost,
  position,
  onEdit,
  onDelete,
  onRecordPayment,
  onClose,
}: {
  state: LoanState;
  cost: LoanCost;
  position: SchedulePosition;
  onEdit: () => void;
  onDelete: (id: LoanId) => void;
  onRecordPayment: (amount: string) => Promise<void>;
  onClose: () => void;
}) {
  const [extra, setExtra] = useState(0);

  const contractual = projectLoan(state);
  const accelerated =
    extra > 0 ? projectLoan(state, state.scheduledPayment.plus(m(String(extra)))) : null;
  const shown = accelerated ?? contractual;

  return (
    <>
      <div className="detail-head">
        <BackLink label="All debts" onClick={onClose} />
        <div className="editor-actions">
          <button type="button" className="ghost" onClick={onEdit}>
            Edit
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              // Deleting a loan destroys its observations too, so it is worth
              // one question. The ledger is the only copy until it is exported.
              if (confirm(`Delete ${state.loan.name}? Everything recorded about it goes too.`)) {
                onDelete(state.loan.id);
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <h1 className="detail-title">{state.loan.name}</h1>
      <p className="subtitle">
        {state.loan.kind.replace('-', ' ')} · {rate(state.loan.annualRate)} ·{' '}
        {state.loan.termMonths} payments left
        {state.asOf ? ` · as of ${longDate(state.asOf)}` : ''}
      </p>

      {cost.balanceStale ? (
        <div className="error" role="status">
          <strong>What is owed is out of date</strong>
          A payment has been recorded since the last balance. A payment is evidence that money
          left, not that the lender agrees — enter the balance from your next statement and this
          will square up.
        </div>
      ) : null}

      {!state.observed ? (
        <div className="error" role="status">
          <strong>No balance recorded</strong>
          Nothing is known about what is owed, so there is nothing to project. Edit the loan and
          enter what the statement says.
        </div>
      ) : state.balance.isZero() ? (
        <div className="editor-lead">
          <p>
            <strong>Cleared.</strong> Nothing left owing on this one.
          </p>
        </div>
      ) : (
        <>
          <Tiles label="Summary">
            <Tile label="Owed" value={money(state.balance)} detail="outstanding balance" />
            <Tile
              label="Contractual payment"
              value={payment(state.scheduledPayment)}
              detail={`clears it in ${state.loan.termMonths} payments`}
            />
            <Tile
              label="Interest to come"
              value={contractual ? money(contractual.analysis.interestPaid) : '—'}
              detail="if nothing changes"
            />
            <Tile
              label="Total to pay"
              value={contractual ? money(contractual.analysis.totalPaid) : '—'}
              detail="principal and interest"
            />
          </Tiles>

          <OnSchedule position={position} />

          <section className="controls" aria-label="Pay more each month">
            <div className="control">
              <span className="control-label">Paying extra each month</span>
              <span className="control-value">{money(m(String(extra)))}</span>
              <input
                type="range"
                aria-label="Extra monthly payment"
                min={0}
                max={Math.max(500, Math.ceil(state.scheduledPayment.toNumber()))}
                step={10}
                value={extra}
                onChange={(e) => setExtra(Number(e.target.value))}
              />
              <span className="control-label">
                {accelerated && contractual ? (
                  <Saving contractual={contractual} accelerated={accelerated} />
                ) : (
                  'on top of the contractual payment'
                )}
              </span>
            </div>
          </section>

          <RecordPayment suggested={state.scheduledPayment} onRecord={onRecordPayment} />

          {cost.periods.length > 0 ? <WhatItCost cost={cost} quoted={state.loan.annualRate} /> : null}

          {shown ? (
            <>
              <ScheduleChart schedule={shown.schedule} />

              <div className="details">
                <Disclosure
                  summary="Every payment"
                  hint={`${shown.analysis.months} payments`}
                >
                  <ScheduleTable projection={shown} />
                </Disclosure>
              </div>
            </>
          ) : null}
        </>
      )}
    </>
  );
}

function Saving({
  contractual,
  accelerated,
}: {
  contractual: LoanProjection;
  accelerated: LoanProjection;
}) {
  const saved = contractual.analysis.interestPaid.minus(accelerated.analysis.interestPaid);
  const sooner = contractual.analysis.months - accelerated.analysis.months;

  if (saved.isZero() && sooner === 0) return <>on top of the contractual payment</>;

  return (
    <>
      saves {money(saved)} and finishes {sooner} {sooner === 1 ? 'month' : 'months'} sooner
    </>
  );
}

function RecordPayment({
  suggested,
  onRecord,
}: {
  suggested: Money;
  onRecord: (amount: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState(() => suggested.toNumber().toFixed(2));
  const [saving, setSaving] = useState(false);
  const valid = /^\d+(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0;

  return (
    <section className="controls" aria-label="Record a payment">
      <div className="control">
        <span className="control-label">Record a payment</span>
        <div className="editor-actions">
          <MoneyInput
            value={amount}
            onChange={setAmount}
            label="Payment amount"
          />
          <button
            type="button"
            className="primary"
            disabled={!valid || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onRecord(amount.trim());
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : 'Paid'}
          </button>
        </div>
        <span className="control-label">
          Dated today. This records that money left — it does not change what you owe, which is
          whatever your next statement says.
        </span>
      </div>
    </section>
  );
}

/**
 * What the lender actually charged, as opposed to what the rate claims.
 *
 * Interest here is measured — paid, less how far the balance fell — so where it
 * disagrees with the quoted rate, this is the side that watched it happen.
 */
function WhatItCost({ cost, quoted }: { cost: LoanCost; quoted: number }) {
  const effective = cost.effectiveAnnualRate;
  const gap = effective === null ? null : effective - quoted;

  return (
    <>
      <section className="tiles" aria-label="What it has cost">
        <Tile label="Paid so far" value={money(cost.totalPaid)} detail="across recorded payments" />
        <Tile
          label="Interest charged"
          value={money(cost.interestCharged)}
          detail="measured, not assumed"
        />
        <Tile
          label="Principal repaid"
          value={money(cost.principalRepaid)}
          detail="what actually came off the debt"
        />
        <Tile
          label="Effective rate"
          value={effective === null ? '—' : rate(effective)}
          detail={
            gap === null
              ? 'needs two balances and a payment'
              : Math.abs(gap) < 0.001
                ? `matches the quoted ${rate(quoted)}`
                : `quoted ${rate(quoted)} — ${gap > 0 ? 'costing more' : 'costing less'}`
          }
        />
      </section>

      <div className="details">
        <Disclosure summary="Between statements" hint={`${cost.periods.length} ${cost.periods.length === 1 ? 'period' : 'periods'}`}>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">From</th>
                  <th scope="col">To</th>
                  <th scope="col" className="num">Paid</th>
                  <th scope="col" className="num">Came off</th>
                  <th scope="col" className="num">Interest</th>
                  <th scope="col" className="num">Rate</th>
                </tr>
              </thead>
              <tbody>
                {cost.periods.map((p) => (
                  <tr key={`${p.from}-${p.to}`} className={p.interestCharged ? undefined : 'unrecorded'}>
                    <td>{longDate(p.from)}</td>
                    <td>{longDate(p.to)}</td>
                    <td className="num">{payment(p.paid)}</td>
                    <td className="num">{payment(p.balanceReduction)}</td>
                    {/* Ground rule 3: no payment recorded means no interest
                        figure, not a figure of zero. */}
                    <td className="num">{p.interestCharged ? payment(p.interestCharged) : '—'}</td>
                    <td className="num">
                      {p.effectiveAnnualRate === null ? '—' : rate(p.effectiveAnnualRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="table-note">
              <strong>Interest</strong> is what was paid less what came off the balance — a
              measurement rather than the rate applied to a formula. Where the two disagree, this is
              the one that watched it happen: fees, daily compounding, a rate that moved, a payment
              applied late.
            </p>
          </div>
        </Disclosure>
      </div>
    </>
  );
}

function ScheduleTable({ projection }: { projection: LoanProjection }) {
  // A long schedule is 360 rows. Showing the first and last two years covers
  // what anyone actually reads — the shape at the start and the end — without
  // asking a browser to lay out hundreds of rows nobody scrolls through.
  const rows = projection.schedule.installments;
  const head = rows.slice(0, 24);
  const tail = rows.length > 48 ? rows.slice(-24) : [];
  const hidden = rows.length - head.length - tail.length;

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col" className="num">#</th>
            <th scope="col" className="num">Payment</th>
            <th scope="col" className="num">Interest</th>
            <th scope="col" className="num">Principal</th>
            <th scope="col" className="num">Balance</th>
          </tr>
        </thead>
        <tbody>
          {head.map((i) => (
            <Row key={i.number} installment={i} />
          ))}
          {hidden > 0 ? (
            <tr className="unrecorded">
              <td colSpan={5}>{hidden} payments not shown</td>
            </tr>
          ) : null}
          {tail.map((i) => (
            <Row key={i.number} installment={i} />
          ))}
        </tbody>
      </table>
      <p className="table-note">
        Interest is charged on the balance outstanding that month, so the split between interest and
        principal shifts across the schedule even though the payment does not.
      </p>
    </div>
  );
}

function Row({ installment }: { installment: LoanProjection['schedule']['installments'][number] }) {
  return (
    <tr>
      <td className="num">{installment.number}</td>
      <td className="num">{payment(installment.interest.plus(installment.principal))}</td>
      <td className="num">{payment(installment.interest)}</td>
      <td className="num">{payment(installment.principal)}</td>
      <td className="num">{money(installment.balance)}</td>
    </tr>
  );
}

export type { Money };

/**
 * Whether the payments are keeping up, and what that does to the finish.
 *
 * Renders nothing when there is nothing to say, which is most of the time on a
 * young loan — the same discipline the Overview's attention strip follows. A
 * panel that is always present gets read as furniture.
 *
 * The exceptions are the two cases where silence would be wrong. A pace that
 * never covers the interest is the most important thing this page can report, so
 * it is a warning rather than an absence. And a record too short to imply a
 * monthly figure gets a quiet line, because the reader *did* enter payments and
 * deserves to know why no answer came back rather than wondering if it broke.
 */
function OnSchedule({ position }: { position: SchedulePosition }) {
  const { pace, finish } = position;

  if (finish.neverClears) {
    return (
      <div className="error" role="status">
        <strong>At this pace the balance never falls</strong>
        {money(pace.actual!)} a month does not cover the interest on what is owed, so the debt
        grows rather than shrinks. The contractual payment is {payment(pace.contractual)}.
      </div>
    );
  }

  if (pace.unknown === 'too-short') {
    return (
      <p className="footnote">
        Not enough recorded yet to say whether the payments are keeping up — the balances either
        side of them cover less than a month. Record the next statement and this will fill in.
      </p>
    );
  }

  if (pace.standing === null || pace.actual === null) return null;

  const sooner = finish.monthsDifference;
  const interest = finish.interestDifference;

  return (
    <Tiles label="Whether the payments are keeping up">
      <Tile
        label="Paying"
        value={payment(pace.actual)}
        detail={`a month, measured over ${Math.round(pace.monthsMeasured)} months of record`}
      />
      <Tile
        label="Against the contract"
        // The sign carries it and colour only reinforces (§10) — "behind" is
        // also spelled out below the figure, so nothing rests on the red.
        value={`${pace.difference!.isNegative() ? '' : '+'}${money(pace.difference!)}`}
        tone={pace.standing === 'behind' ? 'negative' : undefined}
        detail={
          pace.standing === 'level'
            ? 'level with what is asked'
            : pace.standing === 'ahead'
              ? `ahead of the ${payment(pace.contractual)} asked`
              : `behind the ${payment(pace.contractual)} asked`
        }
      />
      {finish.actualMonths !== null ? (
        <Tile
          label="Clear in"
          value={`${finish.actualMonths} months`}
          // The contract's own figure is named rather than only the difference.
          // Showing the delta alone let two numbers on one page disagree: the
          // tile above says "clears it in 48 payments" from the stated term,
          // while the contractual *schedule* runs to 49, because a payment
          // quantized to cents (§11.2) leaves a residual final one. Both are
          // right; only the subtraction looked wrong (§25.5).
          detail={
            finish.contractualMonths === null
              ? 'at the pace being paid'
              : sooner === null || sooner === 0
                ? `the same as the contract's ${finish.contractualMonths}`
                : sooner > 0
                  ? `${sooner} sooner than the contract's ${finish.contractualMonths}`
                  : `${Math.abs(sooner)} later than the contract's ${finish.contractualMonths}`
          }
        />
      ) : null}
      {interest !== null && !interest.isZero() ? (
        <Tile
          label={interest.isPositive() ? 'Interest saved' : 'Interest added'}
          value={money(interest.abs())}
          tone={interest.isNegative() ? 'negative' : undefined}
          detail="against paying exactly the contract"
        />
      ) : null}
    </Tiles>
  );
}
