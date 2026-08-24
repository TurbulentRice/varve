/**
 * Where writes happen.
 *
 * The four destinations are places you go to *look* — Overview, Accounts, Debts
 * and Plan each answer a question. This is where you go to *write*, and §29.3
 * gathers the writes here rather than growing the nav: nobody connects a bank
 * "on the Accounts page", and the provider connections deferred since Decision 5
 * will want exactly this room.
 *
 * Two panes, because the record has two shapes and one stepper cannot scope
 * both. Balances is year-scoped and keeps its stepper *inside* the pane; people
 * are not year-scoped at all, and a stepper above both would claim to date a
 * salary by calendar year.
 *
 * The inconsistency this leaves is named rather than hidden: adding an account
 * still happens on Accounts and adding a loan on Debts, where §19.2 put them.
 * Whether those move here is a real question §29.3 deliberately does not answer.
 */

import type {
  Account,
  BalanceObservation,
  Flow,
  HouseholdId,
  IncomeObservation,
  Owner,
} from '@varve/core';
import type { YearEntry } from '@varve/retirement';
import { useState } from 'react';
import { YearEditor } from '../components/YearEditor.js';
import { People } from '../components/People.js';


type Pane = 'balances' | 'people';

export function Record({
  year,
  householdId,
  accounts,
  observations,
  flows,
  owners,
  incomes,
  onYearChange,
  onSaveYear,
  onAddAccount,
  onSaveOwner,
  onAddOwner,
  onRecordIncome,
  onClose,
}: {
  year: number;
  householdId: HouseholdId;
  accounts: readonly Account[];
  observations: readonly BalanceObservation[];
  flows: readonly Flow[];
  owners: readonly Owner[];
  incomes: readonly IncomeObservation[];
  onYearChange: (year: number) => void;
  onSaveYear: (entries: YearEntry[]) => Promise<void>;
  onAddAccount: (name: string, kind: Account['kind']) => Promise<void>;
  onSaveOwner: (owner: Owner) => Promise<void>;
  onAddOwner: (name: string) => Promise<void>;
  onRecordIncome: (ownerId: Owner['id'], annual: string) => Promise<void>;
  onClose: () => void;
}) {
  const [pane, setPane] = useState<Pane>('balances');

  return (
    <>
      <h1 className="visually-hidden">Update numbers</h1>

      <nav className="panes" aria-label="What to update">
        {(
          [
            ['balances', 'Balances'],
            ['people', 'People'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={pane === value ? 'pane-link current' : 'pane-link'}
            aria-current={pane === value ? 'true' : undefined}
            onClick={() => setPane(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {pane === 'balances' ? (
        <YearEditor
          accounts={accounts}
          observations={observations}
          flows={flows}
          year={year}
          onYearChange={onYearChange}
          onSave={onSaveYear}
          onAddAccount={onAddAccount}
          onClose={onClose}
        />
      ) : (
        <People
          householdId={householdId}
          owners={owners}
          incomes={incomes}
          onSaveOwner={onSaveOwner}
          onAddOwner={onAddOwner}
          onRecordIncome={onRecordIncome}
        />
      )}
    </>
  );
}
