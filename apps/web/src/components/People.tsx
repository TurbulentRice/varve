/**
 * The people in a household, and the two facts the app knows about them.
 *
 * Moved off the Plan page, where §28 put it and §29.1 measured what that cost —
 * 464px of form directly under the headline, pushing the fan chart 1.37 screens
 * down on a page whose whole purpose is watching that chart move.
 *
 * A birth year and a salary are both about a person, and that is where their
 * similarity ends. The birth year is a **property**: it does not move, so
 * editing it overwrites. The salary is a **record**: every figure is dated and
 * kept, because when it changed is the point and a projection run today may be
 * using a number from two years ago (§23.3, §28.2). The two sit side by side
 * here precisely so the difference is visible rather than merely documented.
 */

import type { IncomeObservation, Owner } from '@varve/core';
import { useState } from 'react';
import { longDate, money } from '../lib/format.js';

export function People({
  owners,
  incomes,
  onSaveOwner,
  onRecordIncome,
}: {
  owners: readonly Owner[];
  incomes: readonly IncomeObservation[];
  onSaveOwner: (owner: Owner) => Promise<void>;
  onRecordIncome: (ownerId: Owner['id'], annual: string) => Promise<void>;
}) {
  if (owners.length === 0) {
    return (
      <div className="empty">
        <strong>Nobody on file</strong>
        <p>
          People arrive with the ledger they came from. Open a snapshot, or import one, and they
          will be here.
        </p>
      </div>
    );
  }

  return (
    <section className="people" aria-label="People">
      {owners.map((owner) => (
        <Person
          key={owner.id}
          owner={owner}
          history={incomes
            .filter((i) => i.ownerId === owner.id)
            .slice()
            .sort((a, b) => (a.asOf < b.asOf ? 1 : -1))}
          onSaveOwner={onSaveOwner}
          onRecordIncome={onRecordIncome}
        />
      ))}
    </section>
  );
}

function Person({
  owner,
  history,
  onSaveOwner,
  onRecordIncome,
}: {
  owner: Owner;
  /** This person's salaries, newest first. */
  history: readonly IncomeObservation[];
  onSaveOwner: (owner: Owner) => Promise<void>;
  onRecordIncome: (ownerId: Owner['id'], annual: string) => Promise<void>;
}) {
  const [salary, setSalary] = useState('');
  const [busy, setBusy] = useState(false);

  const current = history[0];
  const thisYear = new Date().getUTCFullYear();

  async function record() {
    if (salary.trim() === '') return;
    setBusy(true);
    try {
      await onRecordIncome(owner.id, salary);
      setSalary('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="person">
      <div className="person-head">
        <h2 className="person-name">{owner.name}</h2>
        <span className="person-detail">
          {owner.birthYear === undefined
            ? 'no birth year on file'
            : `${thisYear - owner.birthYear} years old`}
        </span>
      </div>

      <label className="field">
        <span className="control-label">Born in</span>
        {/* A property, so this overwrites rather than appending. The one write in
            this app that does — see §29.4. */}
        <input
          type="number"
          className="amount"
          value={owner.birthYear ?? ''}
          placeholder="—"
          min={1900}
          max={thisYear}
          aria-label={`${owner.name}'s birth year`}
          onChange={(e) => {
            const value = e.target.value.trim();
            const parsed = Number(value);
            void onSaveOwner(
              value === '' || !Number.isInteger(parsed)
                ? // Clearing it is a real answer: it says nobody knows, which is
                  // what drives "saving throughout" rather than a guessed age.
                  omitBirthYear(owner)
                : { ...owner, birthYear: parsed },
            );
          }}
        />
        <span className="control-label">used to work out when saving stops</span>
      </label>

      <div className="field">
        <span className="control-label">Earning</span>
        <span className="person-salary">{current ? money(current.annualAmount) : '—'}</span>
        <span className="control-label">
          {current
            ? `a year, before tax · as of ${longDate(current.asOf)}`
            : 'a year, before tax — nothing recorded yet'}
        </span>

        <div className="field-row">
          <input
            type="text"
            inputMode="decimal"
            className="amount"
            value={salary}
            placeholder={current ? 'New figure' : 'Enter a salary'}
            aria-label={`${owner.name}'s annual salary`}
            onChange={(e) => setSalary(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void record();
            }}
          />
          <button
            type="button"
            className="ghost"
            disabled={busy || salary.trim() === ''}
            onClick={() => void record()}
          >
            {busy ? 'Saving…' : 'Record'}
          </button>
        </div>
      </div>

      {history.length > 1 ? (
        <table className="salary-history">
          <caption className="table-caption">Every salary recorded</caption>
          <thead>
            <tr>
              <th scope="col">As of</th>
              <th scope="col" className="num">
                A year
              </th>
            </tr>
          </thead>
          <tbody>
            {history.map((entry) => (
              <tr key={entry.id}>
                <th scope="row">{longDate(entry.asOf)}</th>
                <td className="num">{money(entry.annualAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

/**
 * An owner with no birth year at all, rather than one set to `undefined`.
 *
 * `exactOptionalPropertyTypes` is on, and the snapshot encoder writes what it is
 * given — so spreading `birthYear: undefined` would put a null into the document
 * where the field should simply be absent.
 */
function omitBirthYear(owner: Owner): Owner {
  const { birthYear: _dropped, ...rest } = owner;
  return rest;
}
