/**
 * Who is saving, how much of what they earn, and until when.
 *
 * Replaces the single *saving each year* slider, which asked for the wrong
 * thing: nobody decides to put away $14,400, they decide to put away 12% and
 * $14,400 is what happens (§28.1). One row per person makes a household of two
 * expressible for the first time — and, because the two rows carry different
 * retirement ages, makes the projection step down when the first one stops.
 *
 * ## The form is here and the record is not
 *
 * Salary is entered beside the rate it feeds, which is a compromise §28.5 names
 * as one: a salary is a *record* and this is the model room. It is stored as a
 * proper ledger observation all the same — exported, reloaded, carried forward
 * from its date — and when a People destination arrives the form moves and the
 * data does not change.
 *
 * ## Blank is unknown
 *
 * A salary nobody has entered shows a dash and contributes nothing to the
 * projection, rather than a zero that would quietly model a household saving
 * nothing at all. The strip above says whose is missing.
 */

import type { Money } from '@varve/core';
import type { SaverPlan } from '@varve/retirement';
import { useState } from 'react';
import { longDate, money, percent } from '../lib/format.js';

export interface SaverEdit {
  readonly ownerId: SaverPlan['owner']['id'];
  readonly rate: number;
  readonly retirementAge: number | null;
}

export function Savers({
  savers,
  onChange,
  onRecordIncome,
}: {
  savers: readonly SaverPlan[];
  onChange: (edit: SaverEdit) => void;
  onRecordIncome: (ownerId: SaverPlan['owner']['id'], annual: string) => Promise<void>;
}) {
  if (savers.length === 0) return null;

  return (
    <section className="savers" aria-label="Who is saving">
      {savers.map((saver) => (
        <SaverRow
          key={saver.owner.id}
          saver={saver}
          onChange={onChange}
          onRecordIncome={onRecordIncome}
        />
      ))}
    </section>
  );
}

function SaverRow({
  saver,
  onChange,
  onRecordIncome,
}: {
  saver: SaverPlan;
  onChange: (edit: SaverEdit) => void;
  onRecordIncome: (ownerId: SaverPlan['owner']['id'], annual: string) => Promise<void>;
}) {
  const { owner, rate, income, annualContribution, age, yearsRemaining } = saver;

  return (
    <div className="saver">
      <div className="saver-head">
        <span className="saver-name">{owner.name}</span>
        <span className="saver-detail">
          {age === null ? (
            // Said rather than guessed: without a birth year there is no
            // retirement year, so this person saves for the whole horizon.
            <>no birth year on file · saving throughout</>
          ) : yearsRemaining === null ? (
            <>{age} years old</>
          ) : yearsRemaining === 0 ? (
            <>{age} years old · already at the age set below</>
          ) : (
            <>
              {age} years old · {yearsRemaining} more {yearsRemaining === 1 ? 'year' : 'years'} of
              saving
            </>
          )}
        </span>
      </div>

      <Income income={income} asOf={saver.incomeAsOf} owner={owner} onRecord={onRecordIncome} />

      <label className="control saver-control">
        <span className="control-label">Saving</span>
        <span className="control-value">{percent(rate, 0)}</span>
        <input
          type="range"
          min={0}
          max={0.5}
          step={0.01}
          value={rate}
          onChange={(e) =>
            onChange({
              ownerId: owner.id,
              rate: Number(e.target.value),
              retirementAge: ageTarget(saver),
            })
          }
          aria-label={`${owner.name}'s savings rate`}
        />
      </label>

      <label className="control saver-control">
        <span className="control-label">Retiring at</span>
        <span className="control-value">{ageTarget(saver) ?? '—'}</span>
        <input
          type="range"
          min={50}
          max={75}
          step={1}
          value={ageTarget(saver) ?? 65}
          onChange={(e) =>
            onChange({ ownerId: owner.id, rate, retirementAge: Number(e.target.value) })
          }
          aria-label={`${owner.name}'s retirement age`}
        />
      </label>

      <div className="saver-result">
        <span className="saver-amount saver-contribution">
          {annualContribution === null ? '—' : money(annualContribution)}
        </span>
        <span className="saver-detail">
          {annualContribution === null ? 'salary not recorded' : 'a year'}
        </span>
      </div>
    </div>
  );
}

/** The retirement age implied by what is on screen, or `null` when unknown. */
function ageTarget(saver: SaverPlan): number | null {
  if (saver.age === null || saver.yearsRemaining === null) return null;
  return saver.age + saver.yearsRemaining;
}

/**
 * The one field that writes to the ledger.
 *
 * Recorded as of today, so a raise entered next year sits alongside this figure
 * rather than replacing it — the whole reason income is an observation (§28.2).
 */
function Income({
  income,
  asOf,
  owner,
  onRecord,
}: {
  income: Money | null;
  /** When the figure on record was true. `null` when there is none. */
  asOf: string | null;
  owner: SaverPlan['owner'];
  onRecord: (ownerId: SaverPlan['owner']['id'], annual: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  async function record() {
    if (draft.trim() === '') return;
    setSaving(true);
    try {
      await onRecord(owner.id, draft);
      setDraft('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="saver-income">
      <span className="control-label">Earning</span>

      {/* What is on record, stated rather than left as a placeholder. A greyed
          figure in an empty box reads as "not saved", which is the opposite of
          what it means — and the date matters, because the figure is carried
          forward from it until a newer one supersedes it (§28.2). */}
      <span className="saver-amount saver-income-current">
        {income === null ? '—' : money(income)}
      </span>
      <span className="control-label">
        {income === null
          ? 'a year, before tax — nothing recorded yet'
          : `a year, before tax · as of ${longDate(asOf!)}`}
      </span>

      <div className="saver-income-row">
        <input
          type="text"
          inputMode="decimal"
          className="amount"
          value={draft}
          placeholder={income === null ? 'Enter a salary' : 'New figure'}
          aria-label={`${owner.name}'s annual salary`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void record();
          }}
        />
        <button
          type="button"
          className="ghost"
          disabled={saving || draft.trim() === ''}
          onClick={() => void record()}
        >
          {saving ? 'Saving…' : 'Record'}
        </button>
      </div>
    </div>
  );
}
