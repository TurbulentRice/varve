/**
 * Adding or correcting a loan.
 *
 * Four fields, and they are deliberately the four a statement puts in front of
 * you: what you owe, the rate, how many payments are left, and what to call it.
 * Nothing asks what was originally borrowed or when — nobody reliably remembers,
 * and §13.3 explains why the record does not need it.
 *
 * Saving writes an *observation* rather than mutating a balance, so a figure
 * corrected next month sits alongside the old one instead of erasing it.
 */

import { type Loan, type LoanKind } from '@varve/core';
import type { LoanState } from '@varve/loans';
import { useState } from 'react';
import { MoneyInput } from './MoneyInput.js';

const KINDS: readonly { value: LoanKind; label: string }[] = [
  { value: 'credit-card', label: 'Credit card' },
  { value: 'auto', label: 'Car' },
  { value: 'student', label: 'Student' },
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'personal', label: 'Personal' },
];

export interface LoanDraft {
  readonly name: string;
  readonly kind: LoanKind;
  /** Percent as typed — `6.1`, not `0.061`. Converted on save. */
  readonly ratePercent: number;
  readonly termMonths: number;
  /** What is owed, as a decimal string. Never a float. */
  readonly balance: string;
}

export function LoanEditor({
  existing,
  onSave,
  onClose,
}: {
  existing: LoanState | null;
  onSave: (draft: LoanDraft, loan: Loan | null) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<LoanDraft>(() => ({
    name: existing?.loan.name ?? '',
    kind: existing?.loan.kind ?? 'credit-card',
    // Stored as a fraction, shown as a percent. The conversion lives here and
    // nowhere else — a rate is never money and never gets rounded like it.
    ratePercent: existing ? Number((existing.loan.annualRate * 100).toFixed(4)) : 18.99,
    termMonths: existing?.loan.termMonths ?? 24,
    balance: existing?.observed ? existing.balance.toNumber().toFixed(2) : '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = validate(draft);

  async function save() {
    if (problem) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft, existing?.loan ?? null);
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }

  const set = <K extends keyof LoanDraft>(key: K, value: LoanDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="editor">
      <div className="editor-head">
        <h1>{existing ? existing.loan.name : 'Add a loan'}</h1>
        <button type="button" className="ghost" onClick={onClose}>
          ← Back
        </button>
      </div>

      <p className="editor-lead">
        Everything here is on your statement. Nothing needs the original loan amount or the date you
        took it out.
      </p>

      {error ? (
        <div className="error" role="alert">
          <strong>Could not save</strong>
          {error}
        </div>
      ) : null}

      <div className="entry-table">
        <label className="control">
          <span className="control-label">What is it called?</span>
          <input
            type="text"
            value={draft.name}
            placeholder="Visa"
            onChange={(e) => set('name', e.target.value)}
          />
        </label>

        <label className="control">
          <span className="control-label">Kind</span>
          <select
            className="control-select"
            value={draft.kind}
            onChange={(e) => set('kind', e.target.value as LoanKind)}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>

        <label className="control">
          <span className="control-label">Balance owed today</span>
          <MoneyInput
            value={draft.balance}
            onChange={(raw) => set('balance', raw)}
            placeholder="4800.00"
            label="Balance owed today"
          />
        </label>

        <label className="control">
          <span className="control-label">Interest rate (%)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={draft.ratePercent}
            onChange={(e) => set('ratePercent', Number(e.target.value))}
          />
        </label>

        <label className="control">
          <span className="control-label">Payments left</span>
          <input
            type="number"
            step="1"
            min="1"
            max="600"
            value={draft.termMonths}
            onChange={(e) => set('termMonths', Number(e.target.value))}
          />
        </label>
      </div>

      <div className="editor-foot">
        <p className="editor-note">
          {problem ?? 'A balance you correct later is added, not overwritten — the old figure stays.'}
        </p>
        <div className="editor-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={!!problem || saving} onClick={save}>
            {saving ? 'Saving…' : problem ? 'Nothing to save' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** What is wrong with this draft, or `null` if nothing is. */
export function validate(draft: LoanDraft): string | null {
  if (draft.name.trim().length === 0) return 'Give it a name.';

  // Parsed as a decimal string rather than a float: the balance goes straight
  // into Money, and a number would already have lost precision by now.
  if (!/^\d+(\.\d{1,2})?$/.test(draft.balance.trim())) {
    return 'Balance should be a plain amount, like 4800 or 4800.55.';
  }
  if (!Number.isFinite(draft.ratePercent) || draft.ratePercent < 0 || draft.ratePercent > 100) {
    return 'Rate should be a percentage between 0 and 100.';
  }
  if (!Number.isInteger(draft.termMonths) || draft.termMonths < 1 || draft.termMonths > 600) {
    return 'Payments left should be a whole number between 1 and 600.';
  }
  return null;
}
