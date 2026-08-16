import { Money } from '@varve/core';
import type { ReactNode } from 'react';
import { money } from '../lib/format.js';

export type ModelChoice = 'bootstrap' | 'block' | 'normal';

export interface Settings {
  readonly years: number;
  readonly target: number;
  readonly model: ModelChoice;
}

/**
 * The inputs that belong to the household rather than to a person.
 *
 * Three now, not four: *saving each year* left when §28 made it a consequence
 * rather than a choice. It is worked out per person from what they earn and the
 * share they keep, and shown beside them — asking for the dollar figure here
 * made the reader do the arithmetic this app exists to do.
 *
 * The rest stays deliberately small. The product this is heading toward is one
 * where someone can answer "am I going to be all right?" without learning any
 * terminology, and every extra field is a reason to close the tab.
 */
export function Controls({
  settings,
  onChange,
  yearsToLastRetirement,
  observedCount,
  saving,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  /** Years until the last person stops saving, or `null` when no age is known. */
  yearsToLastRetirement: number | null;
  observedCount: number;
  /**
   * The saving cell, passed in rather than built here.
   *
   * It has two modes and a person picker and this component has none of the
   * state for either; keeping it a slot means the controls row stays a layout
   * and does not grow a second job (§29.2).
   */
  saving: ReactNode;
}) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div className="controls" role="group" aria-label="Projection settings">
      {saving}

      <label className="control">
        <span className="control-label">For</span>
        <span className="control-value">{settings.years} years</span>
        {/* The horizon is the reader's to choose; the contributions are not.
            Saying when the last person stops is what keeps a projection running
            past that point from looking like one where money is still going in
            (§28.4). */}
        {yearsToLastRetirement !== null && yearsToLastRetirement < settings.years ? (
          <span className="control-label">
            nothing goes in after {yearsToLastRetirement}
          </span>
        ) : null}
        <input
          type="range"
          min={1}
          max={45}
          step={1}
          value={settings.years}
          onChange={(e) => set('years', Number(e.target.value))}
          aria-label="Years to project"
        />
      </label>

      <label className="control">
        <span className="control-label">Aiming for</span>
        <span className="control-value">{money(Money.fromNumber(settings.target))}</span>
        <input
          type="range"
          min={100_000}
          max={10_000_000}
          step={100_000}
          value={settings.target}
          onChange={(e) => set('target', Number(e.target.value))}
          aria-label="Target balance"
        />
      </label>

      <label className="control control-select">
        <span className="control-label">Future returns look like</span>
        <select
          value={settings.model}
          onChange={(e) => set('model', e.target.value as ModelChoice)}
          aria-label="Return model"
        >
          <option value="bootstrap">your own {observedCount} years, reshuffled</option>
          <option value="block">your own years, in runs of three</option>
          <option value="normal">a textbook bell curve</option>
        </select>
      </label>
    </div>
  );
}
