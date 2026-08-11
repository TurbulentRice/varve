import { m } from '@varve/core';
import { money } from '../lib/format.js';

export type ModelChoice = 'bootstrap' | 'block' | 'normal';

export interface Settings {
  readonly contribution: number;
  readonly years: number;
  readonly target: number;
  readonly model: ModelChoice;
}

/**
 * One row of inputs, above everything they affect.
 *
 * Deliberately four controls and no more. The product this is heading toward is
 * one where someone can answer "am I going to be all right?" without learning
 * any terminology — every extra field is a reason to close the tab. The
 * simulation has plenty more knobs; they stay hidden until something asks for
 * them.
 */
export function Controls({
  settings,
  onChange,
  observedCount,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  observedCount: number;
}) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div className="controls" role="group" aria-label="Projection settings">
      <label className="control">
        <span className="control-label">Saving each year</span>
        <span className="control-value">{money(m(String(settings.contribution)))}</span>
        <input
          type="range"
          min={0}
          max={60_000}
          step={1_000}
          value={settings.contribution}
          onChange={(e) => set('contribution', Number(e.target.value))}
          aria-label="Annual contribution"
        />
      </label>

      <label className="control">
        <span className="control-label">For</span>
        <span className="control-value">{settings.years} years</span>
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
        <span className="control-value">{money(m(String(settings.target)))}</span>
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
