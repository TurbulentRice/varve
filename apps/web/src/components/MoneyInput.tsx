/**
 * A text field that shows money as money while it is being typed.
 *
 * The boring half of §30.3. Everything worth testing is in `lib/money-input.ts`;
 * this owns exactly one thing React will not do on its own — putting the caret
 * back where it belongs after a controlled re-render.
 *
 * The value handed up is the *raw* string, unchanged from what every caller
 * already passed around, so `parseAmount` and every draft-comparison keeps
 * working and a blank box stays blank rather than becoming `$0`.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { editMoneyDraft, formatMoneyDraft } from '../lib/money-input.js';

export function MoneyInput({
  value,
  onChange,
  disabled,
  placeholder,
  label,
  onEnter,
}: {
  /** The raw draft — bare digits, as the caller stores it. */
  value: string;
  onChange: (raw: string) => void;
  disabled?: boolean | undefined;
  placeholder?: string | undefined;
  label: string;
  onEnter?: (() => void) | undefined;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [caret, setCaret] = useState<number | null>(null);

  // After React has written the formatted value into the DOM, and before the
  // browser paints, put the caret back. `useEffect` would run a frame later and
  // show it flicking to the end first.
  useLayoutEffect(() => {
    if (caret === null || !ref.current) return;
    ref.current.setSelectionRange(caret, caret);
    setCaret(null);
  }, [caret, value]);

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      className="amount"
      value={formatMoneyDraft(value)}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={label}
      onChange={(event) => {
        const edit = editMoneyDraft(
          event.target.value,
          event.target.selectionStart ?? event.target.value.length,
          value,
        );
        setCaret(edit.caret);
        onChange(edit.raw);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && onEnter) onEnter();
      }}
    />
  );
}
