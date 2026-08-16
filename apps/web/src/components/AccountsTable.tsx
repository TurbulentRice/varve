/**
 * Every account side by side.
 *
 * The household view answers "how are we doing?" This answers "which of these is
 * actually working?", which is a different question and the one that changes
 * behaviour. It is also where the migration's correction shows: household
 * contributions are small against a household balance, so the legacy method was
 * only mildly wrong there, while a single account funded from a low base is the
 * case that broke it outright.
 */

import type { AccountHistory } from '@varve/retirement';
import type React from 'react';
import { money, percent } from '../lib/format.js';
import { ShareBar } from './ui.js';

export function AccountsTable({
  accounts,
  selected,
  onToggle,
  onOpen,
  onUpdateNumbers,
}: {
  accounts: readonly AccountHistory[];
  /** Ids currently plotted. A row shows its colour when it is one of them. */
  selected: readonly string[];
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onUpdateNumbers: () => void;
}) {
  const open = accounts.filter((a) => !a.closed);
  const closed = accounts.filter((a) => a.closed);

  return (
    <div className="table-scroll">
      <table className="selectable">
        <thead>
          <tr>
            <th scope="col">Account</th>
            <th scope="col">Value</th>
            <th scope="col">Share</th>
            <th scope="col">Paid in</th>
            <th scope="col">Earned</th>
            <th scope="col">Average return</th>
            <th scope="col">Fees</th>
          </tr>
        </thead>
        <tbody>
          {open.map((a) => (
            <Row
              key={a.account.id}
              history={a}
              slot={slotFor(accounts, a.account.id)}
              selected={selected.includes(a.account.id)}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
          {closed.length > 0 ? (
            <tr className="group-break">
              <th scope="row" colSpan={7}>
                Closed
              </th>
            </tr>
          ) : null}
          {closed.map((a) => (
            <Row
              key={a.account.id}
              history={a}
              slot={slotFor(accounts, a.account.id)}
              selected={selected.includes(a.account.id)}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
          {/* Adding belongs where the things are listed, which is where the eye
              already is after reading the list (§31.6). */}
          <tr className="add-row">
            <th scope="row" colSpan={7}>
              <button type="button" className="link" onClick={onUpdateNumbers}>
                + Add or update an account
              </button>
            </th>
          </tr>
        </tbody>
      </table>
      <p className="table-note">
        <strong>Earned</strong> excludes money paid in and, for an account, excludes anything
        transferred into it — a rollover is not a good year. <strong>Average return</strong> is the
        geometric mean of the years the account actually held money.
      </p>
    </div>
  );
}

/**
 * Colour slot, fixed by position in the full list rather than among the chosen.
 *
 * Colour follows the entity, never its rank: deselecting one account must not
 * repaint the others, or somebody who learned "the IRA is orange" stops trusting
 * the chart. Same function the series builder uses, for the same reason.
 */
function slotFor(accounts: readonly AccountHistory[], id: string): number {
  return (accounts.findIndex((a) => a.account.id === id) % 6) + 1;
}

function Row({
  history,
  slot,
  selected,
  onToggle,
  onOpen,
}: {
  history: AccountHistory;
  slot: number;
  selected: boolean;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { account, closed } = history;

  return (
    <tr
      className={[closed ? 'unrecorded' : '', selected ? 'plotted' : ''].filter(Boolean).join(' ') || undefined}
      style={selected ? ({ '--row-series': `var(--series-${slot})` } as React.CSSProperties) : undefined}
    >
      <th scope="row">
        {/* Clicking the row plots it; the name still opens the account. Two
            different intentions, so two different targets rather than one that
            guesses (§31.3). */}
        <button
          type="button"
          className={selected ? 'plot-toggle on' : 'plot-toggle'}
          aria-pressed={selected}
          aria-label={`Plot ${account.name}`}
          onClick={() => onToggle(account.id)}
        />
        <button type="button" className="link" onClick={() => onOpen(account.id)}>
          {account.name}
        </button>
        <span className="kind">{account.kind}</span>
      </th>
      <td className="num strong">{money(history.currentValue)}</td>
      <td className="num muted">
        {closed ? '—' : <ShareBar share={history.shareOfHousehold} />}
      </td>
      <td className="num muted">{money(history.totalContributed)}</td>
      <td className={`num ${history.lifetimeGain.isNegative() ? 'negative' : 'positive'}`}>
        {money(history.lifetimeGain)}
      </td>
      <td className={`num strong ${history.averageReturn < 0 ? 'negative' : 'positive'}`}>
        {history.years.length > 0 ? percent(history.averageReturn) : '—'}
      </td>
      <td className="num muted">
        {history.totalFees.isZero() ? '—' : money(history.totalFees)}
      </td>
    </tr>
  );
}
