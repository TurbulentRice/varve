/**
 * Formatting.
 *
 * Two rules worth stating, because both are easy to get subtly wrong.
 *
 * Everything uses a true minus sign (U+2212), not a hyphen. `Intl` emits a
 * hyphen, which sits at the wrong height beside digits and reads as punctuation
 * rather than sign — visible mostly as a vague sense that the numbers are badly
 * set.
 *
 * Large standalone values get the font's proportional figures; only columns that
 * must line up vertically get `tabular-nums`. Equal-width digits make a display
 * figure look gappy.
 */

import type { Money } from '@varve/core';

const MINUS = '−';

const withMinus = (text: string) => text.replace('-', MINUS);

/** `$1,234,567` — full precision to the dollar. */
export function money(amount: Money): string {
  return withMinus(amount.format({ maximumFractionDigits: 0 }));
}

/** `$1.2M` — for axis ticks and anywhere space is short. */
export function compactMoney(amount: Money): string {
  return withMinus(
    amount.format({ notation: 'compact', maximumFractionDigits: 1 }),
  );
}

/** Compact, from a plain number — for chart axes working in float space. */
export function compactNumber(value: number): string {
  return withMinus(
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value),
  );
}

export function percent(value: number, digits = 1): string {
  return `${value < 0 ? MINUS : ''}${Math.abs(value * 100).toFixed(digits)}%`;
}

/** Percentage points, for describing a gap between two rates. */
export function points(value: number, digits = 1): string {
  return `${Math.abs(value * 100).toFixed(digits)} pts`;
}

/** `2024-06-30` → `30 June 2024`. */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
