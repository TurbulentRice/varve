/**
 * How much goes in each year — one control cell, two ways of arriving at it.
 *
 * §28 replaced the dollar slider with a percentage-of-salary form and §29.2
 * corrects that: the two are **modes**, not eras. Plenty of people decide in
 * dollars and nothing else — *I max the 401(k)*, *$500 a month* — and a
 * percentage is frequently a derived convenience rather than the actual choice.
 *
 * So Amount is the default and is the old slider untouched, and the percentage
 * lives behind a toggle in the same cell. Whichever mode is on, the cell reports
 * the same thing in the same place: dollars a year. The mode changes how the
 * number is arrived at, never what the control says.
 *
 * ## Custom, and why it is not a convenience
 *
 * `Custom…` models a salary recorded against nobody. Without it, asking "what if
 * I saved 15% of $120,000" would require writing a salary into the ledger first
 * — a model room demanding a record before it will model anything, which is
 * exactly the line §19.1 draws between the two.
 *
 * ## Per-person detail, on demand
 *
 * The rates and stop-ages §28 put permanently on screen are behind an expander,
 * shown only when someone is actually planning two earners apart. None of that
 * information was wrong; it was just always visible at full size (§29.2).
 */

import { Money } from '@varve/core';
import type { SaverPlan } from '@varve/retirement';
import { useState } from 'react';
import { money, percent } from '../lib/format.js';

export type SavingMode = 'amount' | 'percent';

export interface SavingSettings {
  readonly mode: SavingMode;
  /** Dollars a year, for `amount` mode. */
  readonly amount: number;
  /** Fraction of salary, for `percent` mode. */
  readonly rate: number;
  /** Whose salary counts. Empty means nobody selected yet. */
  readonly savers: readonly string[];
  /** A salary belonging to nobody in the ledger. `null` when not in use. */
  readonly custom: number | null;
}

export interface PersonOverride {
  readonly ownerId: string;
  readonly rate: number;
  readonly retirementAge: number | null;
}

export function SavingControl({
  settings,
  onChange,
  savers,
  overrides,
  onOverride,
  total,
}: {
  settings: SavingSettings;
  onChange: (next: SavingSettings) => void;
  /** Everyone in the household, with what is known about them. */
  savers: readonly SaverPlan[];
  overrides: readonly PersonOverride[];
  onOverride: (next: PersonOverride) => void;
  /** What the current settings actually come to, in the first year. */
  total: Money;
}) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<SavingSettings>) => onChange({ ...settings, ...patch });

  const usingCustom = settings.custom !== null;

  return (
    <div className="control saving-control">
      <span className="control-label">Saving each year</span>
      <span className="control-value">{money(total)}</span>

      <div className="segmented" role="group" aria-label="How to work out what goes in">
        {(
          [
            ['amount', 'Amount'],
            ['percent', '% of salary'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={settings.mode === value ? 'segment current' : 'segment'}
            aria-pressed={settings.mode === value}
            onClick={() => set({ mode: value })}
          >
            {label}
          </button>
        ))}
      </div>

      {settings.mode === 'amount' ? (
        <input
          type="range"
          min={0}
          max={60_000}
          step={1_000}
          value={settings.amount}
          onChange={(e) => set({ amount: Number(e.target.value) })}
          aria-label="Annual contribution"
        />
      ) : (
        <>
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={settings.rate}
            onChange={(e) => set({ rate: Number(e.target.value) })}
            aria-label="Share of salary saved"
          />
          <span className="control-label">{percent(settings.rate, 0)} of</span>

          <div className="chips">
            {savers.map((saver) => {
              const on = !usingCustom && settings.savers.includes(saver.owner.id);
              return (
                <button
                  key={saver.owner.id}
                  type="button"
                  className={on ? 'chip current' : 'chip'}
                  aria-pressed={on}
                  // A person with no salary on file can still be picked; the
                  // total simply says nothing for them, which is what an unknown
                  // income means (§28.2) and is better than hiding the name.
                  title={saver.income === null ? 'no salary recorded' : money(saver.income)}
                  onClick={() =>
                    set({
                      custom: null,
                      savers: on
                        ? settings.savers.filter((id) => id !== saver.owner.id)
                        : [...settings.savers, saver.owner.id],
                    })
                  }
                >
                  {saver.owner.name}
                  {saver.income === null ? <span className="chip-flag">?</span> : null}
                </button>
              );
            })}

            <button
              type="button"
              className={usingCustom ? 'chip current' : 'chip'}
              aria-pressed={usingCustom}
              onClick={() => set({ custom: usingCustom ? null : 100_000, savers: [] })}
            >
              Custom…
            </button>
          </div>

          {usingCustom ? (
            <input
              type="text"
              inputMode="decimal"
              className="amount"
              value={String(settings.custom ?? '')}
              aria-label="A salary to model"
              onChange={(e) => {
                const parsed = Number(e.target.value.replace(/[$,\s]/g, ''));
                set({ custom: Number.isFinite(parsed) ? parsed : 0 });
              }}
            />
          ) : null}

          {settings.savers.length > 0 && !usingCustom ? (
            <>
              <button
                type="button"
                className="link disclosure-toggle"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
              >
                {open ? 'Hide' : 'Set'} each person separately
              </button>

              {open ? (
                <div className="overrides">
                  {savers
                    .filter((s) => settings.savers.includes(s.owner.id))
                    .map((saver) => (
                      <Override
                        key={saver.owner.id}
                        saver={saver}
                        override={overrides.find((o) => o.ownerId === saver.owner.id)}
                        fallbackRate={settings.rate}
                        onChange={onOverride}
                      />
                    ))}
                </div>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function Override({
  saver,
  override,
  fallbackRate,
  onChange,
}: {
  saver: SaverPlan;
  override: PersonOverride | undefined;
  fallbackRate: number;
  onChange: (next: PersonOverride) => void;
}) {
  const rate = override?.rate ?? fallbackRate;
  const stopAt = override?.retirementAge ?? null;

  return (
    <div className="override">
      <span className="override-name">
        {saver.owner.name}
        <span className="saver-detail">
          {saver.age === null ? ' · no birth year' : ` · ${saver.age}`}
        </span>
      </span>

      <label className="override-field">
        <span className="control-label">Saves {percent(rate, 0)}</span>
        <input
          type="range"
          min={0}
          max={0.5}
          step={0.01}
          value={rate}
          aria-label={`${saver.owner.name}'s share`}
          onChange={(e) =>
            onChange({ ownerId: saver.owner.id, rate: Number(e.target.value), retirementAge: stopAt })
          }
        />
      </label>

      <label className="override-field">
        <span className="control-label">
          {/* Without a birth year there is no age to stop at, so the control says
              so rather than offering a number that would do nothing. */}
          {saver.age === null ? 'Stops — no birth year' : `Stops at ${stopAt ?? 'the horizon'}`}
        </span>
        <input
          type="range"
          min={50}
          max={75}
          step={1}
          value={stopAt ?? 65}
          disabled={saver.age === null}
          aria-label={`${saver.owner.name}'s retirement age`}
          onChange={(e) => onChange({ ownerId: saver.owner.id, rate, retirementAge: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}
