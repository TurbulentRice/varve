/**
 * The accounts, as a place rather than a table row.
 *
 * §18.2's third structural complaint was that positions are not first-class:
 * the account list — the best thing in the app — began **1.7 screens down**,
 * inside a disclosure, on a page about something else. It is now the page.
 *
 * `StatTiles` and `HistoryTable` come here whole. Both describe what the tracked
 * accounts did — value, what was paid in, what was earned, time-weighted return
 * against the benchmark, and the year-by-year record behind all of it — which is
 * this page's question and not the Overview's (§22.2). The year table stays
 * folded because it is nine columns of detail behind a summary that answers most
 * visits on its own.
 */

import type { AccountHistory, History } from '@varve/retirement';
import { accountId } from '@varve/core';
import { AccountsTable } from '../components/AccountsTable.js';
import { Disclosure } from '../components/Disclosure.js';
import { HistoryTable } from '../components/HistoryTable.js';
import { StatTiles } from '../components/StatTiles.js';
import { PageTitle } from '../components/ui.js';
import { navigate } from '../routing/useRoute.js';

export function Accounts({
  history,
  accounts,
  onUpdateNumbers,
}: {
  history: History;
  accounts: readonly AccountHistory[];
  onUpdateNumbers: () => void;
}) {
  return (
    <>
      <PageTitle
        title="Accounts"
        subtitle={`${accounts.length} accounts · ${history.years.length} years recorded`}
        actions={
          <button type="button" className="ghost" onClick={onUpdateNumbers}>
            Add or update an account
          </button>
        }
      />

      <StatTiles history={history} />

      <AccountsTable
        accounts={accounts}
        onSelect={(id) => navigate({ view: 'account', accountId: accountId(id) })}
      />

      <div className="details">
        <Disclosure summary="Every recorded year" hint={`${history.years.length} years`}>
          <HistoryTable years={history.years} />
        </Disclosure>
      </div>
    </>
  );
}
