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
import { money, percent } from '../lib/format.js';
import { ShareBar } from './ui.js';

export function AccountsTable({
  accounts,
  onSelect,
}: {
  accounts: readonly AccountHistory[];
  onSelect: (id: string) => void;
}) {
  const open = accounts.filter((a) => !a.closed);
  const closed = accounts.filter((a) => a.closed);

  return (
    <div className="table-scroll">
      <table>
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
            <Row key={a.account.id} history={a} onSelect={onSelect} />
          ))}
          {closed.length > 0 ? (
            <tr className="group-break">
              <th scope="row" colSpan={7}>
                Closed
              </th>
            </tr>
          ) : null}
          {closed.map((a) => (
            <Row key={a.account.id} history={a} onSelect={onSelect} />
          ))}
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

function Row({
  history,
  onSelect,
}: {
  history: AccountHistory;
  onSelect: (id: string) => void;
}) {
  const { account, closed } = history;

  return (
    <tr className={closed ? 'unrecorded' : undefined}>
      <th scope="row">
        <button type="button" className="link" onClick={() => onSelect(account.id)}>
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
