/**
 * Entering a year's numbers.
 *
 * The interaction someone performs once a year with a stack of statements in
 * front of them, which makes forgiveness matter more than density: they will not
 * remember how this worked last time. So the year is a stepper rather than a
 * date field, existing figures are already in the boxes, saving the same year
 * again corrects it rather than duplicating it, and nothing is required.
 *
 * Years that came from the legacy import are shown but locked. They hold
 * quarterly detail this form cannot express, and letting one December box
 * overwrite four quarters would quietly destroy information.
 */

import type { Account, BalanceObservation, Flow } from '@varve/core';
import { existingYearEntry, parseAmount, type YearEntry } from '@varve/retirement';
import { useEffect, useMemo, useState } from 'react';
import { money } from '../lib/format.js';
import { MoneyInput } from './MoneyInput.js';

interface Draft {
  balance: string;
  contributed: string;
  fees: string;
}

const blank: Draft = { balance: '', contributed: '', fees: '' };

interface Props {
  readonly accounts: readonly Account[];
  readonly observations: readonly BalanceObservation[];
  readonly flows: readonly Flow[];
  readonly year: number;
  readonly onYearChange: (year: number) => void;
  readonly onSave: (entries: YearEntry[]) => Promise<void>;
  readonly onAddAccount: (name: string, kind: Account['kind']) => Promise<void>;
  readonly onClose: () => void;
}

export function YearEditor({
  accounts,
  observations,
  flows,
  year,
  onYearChange,
  onSave,
  onAddAccount,
  onClose,
}: Props) {
  const existing = useMemo(
    () =>
      new Map(
        accounts.map((a) => [a.id, existingYearEntry(a.id, year, observations, flows)] as const),
      ),
    [accounts, observations, flows, year],
  );

  const initial = useMemo(() => {
    const drafts = new Map<string, Draft>();
    for (const [id, entry] of existing) {
      drafts.set(id, {
        balance: entry.balance?.toNumber().toString() ?? '',
        contributed: entry.contributed?.toNumber().toString() ?? '',
        fees: entry.fees?.toNumber().toString() ?? '',
      });
    }
    return drafts;
  }, [existing]);

  const [drafts, setDrafts] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Moving to another year, or saving, reloads from what is on record.
  useEffect(() => setDrafts(initial), [initial]);

  const changed = useMemo(
    () =>
      [...drafts].filter(([id, draft]) => {
        const was = initial.get(id) ?? blank;
        return (
          draft.balance !== was.balance ||
          draft.contributed !== was.contributed ||
          draft.fees !== was.fees
        );
      }).length,
    [drafts, initial],
  );

  const update = (id: string, field: keyof Draft, value: string) => {
    setJustSaved(false);
    setDrafts((previous) => {
      const next = new Map(previous);
      next.set(id, { ...(next.get(id) ?? blank), [field]: value });
      return next;
    });
  };

  async function save() {
    setSaving(true);
    try {
      await onSave(
        accounts
          .filter((a) => existing.get(a.id)?.editable !== false)
          .map((a) => {
            const draft = drafts.get(a.id) ?? blank;
            return {
              accountId: a.id,
              balance: parseAmount(draft.balance),
              contributed: parseAmount(draft.contributed),
              fees: parseAmount(draft.fees),
            };
          }),
      );
      setJustSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const thisYear = new Date().getUTCFullYear();

  return (
    <section className="editor">
      <header className="editor-head">
        <button type="button" className="ghost" onClick={onClose}>
          ← Back
        </button>
        <div className="year-stepper" role="group" aria-label="Year">
          <button
            type="button"
            className="ghost step"
            onClick={() => onYearChange(year - 1)}
            aria-label="Previous year"
          >
            ‹
          </button>
          <span className="year-current">{year}</span>
          <button
            type="button"
            className="ghost step"
            onClick={() => onYearChange(year + 1)}
            disabled={year >= thisYear}
            aria-label="Next year"
          >
            ›
          </button>
        </div>
      </header>

      <p className="editor-lead">
        Enter what each account was worth at the end of {year}, and what went in and out over the
        year. Leave anything you don&rsquo;t have blank — nothing here is required.
      </p>

      <div className="table-scroll">
        <table className="entry-table">
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Worth at year end</th>
              <th scope="col">Paid in</th>
              <th scope="col">Fees</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => {
              const entry = existing.get(account.id);
              const locked = entry?.editable === false;
              const draft = drafts.get(account.id) ?? blank;

              return (
                <tr key={account.id} className={locked ? 'locked' : undefined}>
                  <th scope="row">
                    {account.name}
                    {locked ? (
                      <span
                        className="lock"
                        title="Imported from the original database with quarter-by-quarter detail. Editing it here would replace four quarters with one number."
                      >
                        imported
                      </span>
                    ) : null}
                  </th>
                  {(['balance', 'contributed', 'fees'] as const).map((field) => (
                    <td key={field}>
                      {locked ? (
                        <input
                          type="text"
                          className="amount"
                          value={formatLocked(entry, field)}
                          disabled
                          placeholder="—"
                          aria-label={`${account.name} ${field} for ${year}`}
                          readOnly
                        />
                      ) : (
                        <MoneyInput
                          value={draft[field]}
                          onChange={(raw) => update(account.id, field, raw)}
                          placeholder="—"
                          label={`${account.name} ${field} for ${year}`}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AddAccount onAdd={onAddAccount} />

      <footer className="editor-foot">
        <p className="editor-note">
          Money paid in and fees are recorded mid-year, since an annual total has no date of its
          own and the honest assumption is that it accumulated as the year went.
        </p>
        <div className="editor-actions">
          {justSaved && changed === 0 ? <span className="saved">Saved</span> : null}
          <button type="button" className="primary" onClick={save} disabled={saving || changed === 0}>
            {saving ? 'Saving…' : changed === 0 ? 'Nothing to save' : `Save ${changed} change${changed === 1 ? '' : 's'}`}
          </button>
        </div>
      </footer>
    </section>
  );
}

function formatLocked(
  entry: ReturnType<typeof existingYearEntry> | undefined,
  field: keyof Draft,
): string {
  const amount = entry?.[field === 'balance' ? 'balance' : field === 'fees' ? 'fees' : 'contributed'];
  return amount ? money(amount) : '';
}

function AddAccount({ onAdd }: { onAdd: (name: string, kind: Account['kind']) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Account['kind']>('retirement');

  if (!open) {
    return (
      <button type="button" className="ghost add" onClick={() => setOpen(true)}>
        + Add an account
      </button>
    );
  }

  return (
    <form
      className="add-account"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        await onAdd(name, kind);
        setName('');
        setOpen(false);
      }}
    >
      <input
        type="text"
        value={name}
        autoFocus
        placeholder="Account name"
        aria-label="Account name"
        onChange={(e) => setName(e.target.value)}
      />
      <select
        value={kind}
        aria-label="Account type"
        onChange={(e) => setKind(e.target.value as Account['kind'])}
      >
        <option value="retirement">Retirement</option>
        <option value="brokerage">Brokerage</option>
        <option value="savings">Savings</option>
        <option value="college">College savings</option>
      </select>
      <button type="submit" className="primary" disabled={!name.trim()}>
        Add
      </button>
      <button type="button" className="ghost" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
