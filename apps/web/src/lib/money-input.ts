/**
 * Making a money field look like money while it is being typed.
 *
 * Every amount in this app is displayed with a dollar sign and separators and,
 * until now, entered as bare digits — the one place the interface stopped
 * speaking its own language, and the place a misread costs most, since a zero
 * too many in a balance is not a typo anyone catches by eye (§30.3).
 *
 * ## The caret is the whole job
 *
 * Formatting on every keystroke is four lines. Doing it without destroying the
 * insertion point is the work: reformatting resets the caret to the end, so
 * editing the middle of a number becomes impossible. Type `1000000`, notice the
 * extra zero, click between two digits, press backspace — and the caret jumps to
 * the end, so the next keystroke lands somewhere else entirely.
 *
 * The fix is to count what survives formatting. Digits, one leading minus and
 * one decimal point are *significant*; everything else is decoration. Count the
 * significant characters before the caret in what was typed, reformat, then put
 * the caret after the same number of them. Separators move around it rather than
 * through it.
 *
 * ## Nothing here is React
 *
 * Same split as `route.ts` and for the same reason (§12.3): the interesting part
 * is a total function over strings and the framework part is glue. Drafts stay
 * strings the whole way to `parseAmount`, so an empty box remains *blank* rather
 * than becoming `$0` — ground rule 3 applies to what a form says as much as to
 * what a table shows.
 */

/** Digits, a leading minus, and the first decimal point. */
const SIGNIFICANT = /[0-9.-]/;

/**
 * Reduce anything to the characters a number is actually made of.
 *
 * Tolerant on purpose — this is fed pasted text, half-typed text, and text this
 * module formatted a moment ago. A second minus or a second point is dropped
 * rather than rejected, because a field that refuses a keystroke silently feels
 * broken in the same way a jumping caret does.
 */
export function stripMoneyDraft(text: string): string {
  let out = '';
  let seenDot = false;

  for (const char of text) {
    if (char === '-') {
      // Only as the very first character; a minus in the middle is a stray.
      if (out.length === 0) out += char;
      continue;
    }
    if (char === '.') {
      if (seenDot) continue;
      seenDot = true;
      out += char;
      continue;
    }
    if (char >= '0' && char <= '9') out += char;
  }

  return out;
}

/**
 * A raw draft, as it should appear in the box.
 *
 * The integer part gets separators and a dollar sign; the fractional part is
 * passed through exactly as typed. That is what keeps `100.` from collapsing to
 * `$100` mid-keystroke and `1.50` from being rewritten as `1.5` — a field that
 * edits what you are still typing is the other way to make one feel broken.
 */
export function formatMoneyDraft(raw: string): string {
  // Blank stays blank. An empty box means unknown, and `$0` would be a claim.
  if (raw === '' || raw === '-') return raw;

  const negative = raw.startsWith('-');
  const body = negative ? raw.slice(1) : raw;
  const dot = body.indexOf('.');

  const digits = dot === -1 ? body : body.slice(0, dot);
  const fraction = dot === -1 ? '' : body.slice(dot);

  // `.5` with no leading digit: group nothing rather than inventing a zero.
  const grouped = digits === '' ? '' : Number(digits).toLocaleString('en-US');

  return `${negative ? '-' : ''}$${grouped}${fraction}`;
}

/** Where the caret goes so that `count` significant characters sit before it. */
export function caretAfter(display: string, count: number): number {
  if (count <= 0) {
    // Land after the prefix rather than before it: nobody wants to type to the
    // left of the dollar sign.
    const first = [...display].findIndex((c) => SIGNIFICANT.test(c));
    return first === -1 ? display.length : first;
  }

  let seen = 0;
  for (let i = 0; i < display.length; i += 1) {
    if (SIGNIFICANT.test(display[i]!)) {
      seen += 1;
      if (seen === count) return i + 1;
    }
  }
  return display.length;
}

/** How many significant characters sit before `caret` in `text`. */
function significantBefore(text: string, caret: number): number {
  let count = 0;
  for (let i = 0; i < caret && i < text.length; i += 1) {
    if (SIGNIFICANT.test(text[i]!)) count += 1;
  }
  return count;
}

export interface MoneyEdit {
  /** The value the caller keeps — bare, unformatted, ready for `parseAmount`. */
  readonly raw: string;
  /** What belongs in the box. */
  readonly display: string;
  /** Where the caret goes afterwards. */
  readonly caret: number;
}

/**
 * Resolve one edit of a money field.
 *
 * `typed` is what the input holds after the browser applied the keystroke,
 * `caret` where the browser put the insertion point, and `previous` the raw
 * value before the edit.
 *
 * The `previous` argument exists for one case: **backspacing a separator deletes
 * the digit before it.** Removing the comma from `$1,000` leaves the digits
 * unchanged, so reformatting puts the comma straight back and the key looks
 * dead. Comparing against the previous raw value is the only way to tell that
 * edit apart from one that changed nothing, and a field with a dead key is worse
 * than a field with no formatting at all (§30.3).
 */
export function editMoneyDraft(typed: string, caret: number, previous: string): MoneyEdit {
  let raw = stripMoneyDraft(typed);
  let before = significantBefore(typed, caret);

  // The keystroke removed decoration only. Take the significant character it was
  // sitting against instead, which is what the reader meant.
  const deletedDecoration = raw === previous && typed.length < formatMoneyDraft(previous).length;
  if (deletedDecoration && before > 0) {
    raw = raw.slice(0, before - 1) + raw.slice(before);
    before -= 1;
  }

  const display = formatMoneyDraft(raw);
  return { raw, display, caret: caretAfter(display, before) };
}
