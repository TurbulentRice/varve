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

/**
 * `$1,234.56` — for an amount someone actually hands over.
 *
 * Whole dollars are right for a balance, where cents are noise against six
 * figures. They are wrong for a payment: §11.2 quantizes installments to cents
 * precisely because an installment is a transaction someone makes, and a
 * contractual payment displayed as `$329` is not the number that leaves the
 * account.
 */
export function payment(amount: Money): string {
  return withMinus(amount.format({ minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}

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

/**
 * `18.99%`.
 *
 * Rates get two decimals rather than one, because quoted rates carry them and
 * they are recognisable: someone who typed 18.99 and reads back 19.0 has been
 * told their number was approximate when it was not. Trailing zeros are dropped
 * so a round 6% does not become `6.00%`.
 */
export function rate(value: number): string {
  const shown = Number((value * 100).toFixed(2));
  return `${value < 0 ? MINUS : ''}${Math.abs(shown)}%`;
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

/**
 * Join names the way a person would say them.
 *
 * `join(' & ')` is fine for two and reads as a machine for three — "Ada & Ben &
 * Cass". Nobody noticed until §30.1 made it possible to have a third person, and
 * that is the general shape of it: a household of two hid the bug.
 */
export function nameList(names: readonly string[]): string {
  if (names.length <= 2) return names.join(' & ');
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}
