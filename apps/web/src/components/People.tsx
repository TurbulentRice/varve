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
 *
 * Side by side literally, since §30.2: a year is four digits and a salary about
 * seven, and each had a row of its own under a label longer than the field. The
 * salary history stays below because that one earns its space — it is the
 * visible half of the record-versus-property distinction, and somebody looking
 * at three dated salaries is looking at the reason it exists.
 */

import type { HouseholdId, IncomeObservation, Owner } from '@varve/core';
import { useState } from 'react';
import { longDate, money } from '../lib/format.js';
import { MoneyInput } from './MoneyInput.js';

export function People({
  householdId,
  owners,
  incomes,
  onSaveOwner,
  onAddOwner,
  onRecordIncome,
}: {
  householdId: HouseholdId;
  owners: readonly Owner[];
  incomes: readonly IncomeObservation[];
  onSaveOwner: (owner: Owner) => Promise<void>;
  onAddOwner: (name: string) => Promise<void>;
  onRecordIncome: (ownerId: Owner['id'], annual: string) => Promise<void>;
}) {
  return (
    <>
      {owners.length === 0 ? (
        <div className="empty">
          <strong>Nobody on file</strong>
          <p>
            A household needs at least one person before a salary has anywhere to go. Add one
            below, or open a snapshot that already has some.
          </p>
        </div>
      ) : (
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
      )}

      <AddPerson householdId={householdId} onAdd={onAddOwner} />
    </>
  );
}

/**
 * One field, because a name is the only thing genuinely required.
 *
 * A birth year makes it a two-field form for a one-field question, and the card
 * this creates asks for it next to the salary anyway — where its absence already
 * means something specific rather than nothing (§30.1).
 */
function AddPerson({
  householdId: _householdId,
  onAdd,
}: {
  householdId: HouseholdId;
  onAdd: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    if (name.trim() === '') return;
    setBusy(true);
    try {
      await onAdd(name);
      setName('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="add-person">
      <label className="field">
        <span className="control-label">Add someone</span>
        <div className="field-row">
          <input
            type="text"
            value={name}
            placeholder="Their name"
            aria-label="Name of the person to add"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add();
            }}
          />
          <button
            type="button"
            className="primary"
            disabled={busy || name.trim() === ''}
            onClick={() => void add()}
          >
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>
      </label>
    </div>
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

      <div className="person-fields">
        <label className="field">
          <span className="control-label">Born in</span>
          {/* A property, so this overwrites rather than appending. The one write
              in this app that does — see §29.4. Not a money field: formatting a
              year as currency would be the interface lying about what it holds
              (§30.3). */}
          <input
            type="number"
            className="amount year-input"
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
                  ? // Clearing it is a real answer: it says nobody knows, which
                    // is what drives "saving throughout" rather than a guess.
                    omitBirthYear(owner)
                  : { ...owner, birthYear: parsed },
              );
            }}
          />
        </label>

        <label className="field field-grow">
          <span className="control-label">
            {current ? `Earning ${money(current.annualAmount)}` : 'Earning — nothing recorded'}
          </span>
          <div className="field-row">
            <MoneyInput
              value={salary}
              onChange={setSalary}
              placeholder={current ? 'New figure' : 'A year'}
              label={`${owner.name}'s annual salary`}
              onEnter={() => void record()}
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
        </label>
      </div>

      {current ? (
        <span className="person-detail">as of {longDate(current.asOf)}</span>
      ) : null}

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
