/**
 * Typing money.
 *
 * The formatting is four lines and none of these tests are about it. They are
 * about the caret, which is the whole job (§30.3): a field that reformats and
 * loses the insertion point cannot be edited in the middle, and one where
 * backspacing a separator does nothing has a key that looks dead.
 *
 * Notation below: `|` marks the caret in what the user is looking at.
 */

import { describe, expect, it } from 'vitest';
import { parseAmount } from '@varve/retirement';
import { nameList } from '../src/lib/format.js';
import {
  caretAfter,
  editMoneyDraft,
  formatMoneyDraft,
  stripMoneyDraft,
} from '../src/lib/money-input.js';

/** Apply an edit written as `before|after`, the way a browser would report it. */
function type(text: string, previous: string) {
  const caret = text.indexOf('|');
  return editMoneyDraft(text.replace('|', ''), caret, previous);
}

/** Render a result the same way, so an expectation reads like the screen. */
const shown = (edit: { display: string; caret: number }) =>
  `${edit.display.slice(0, edit.caret)}|${edit.display.slice(edit.caret)}`;

describe('what a draft looks like', () => {
  it('groups the integer part and marks it as money', () => {
    expect(formatMoneyDraft('100000')).toBe('$100,000');
    expect(formatMoneyDraft('1234567')).toBe('$1,234,567');
  });

  it('leaves a blank box blank rather than calling it zero', () => {
    // Ground rule 3 reaches into forms too: an empty field means unknown, and
    // `$0` would be a claim the reader never made.
    expect(formatMoneyDraft('')).toBe('');
  });

  it('leaves the fractional part exactly as typed', () => {
    // A field that rewrites what you are still typing is the other way to feel
    // broken: `100.` must not collapse to `$100`, and `1.50` must not become
    // `$1.5` while the reader is mid-keystroke.
    expect(formatMoneyDraft('100.')).toBe('$100.');
    expect(formatMoneyDraft('1.50')).toBe('$1.50');
    expect(formatMoneyDraft('1234.5678')).toBe('$1,234.5678');
  });

  it('keeps a lone minus, because it is a number someone has started', () => {
    expect(formatMoneyDraft('-')).toBe('-');
    expect(formatMoneyDraft('-4000')).toBe('-$4,000');
  });

  it('does not invent a leading zero for a bare decimal', () => {
    expect(formatMoneyDraft('.5')).toBe('$.5');
  });
});

describe('what survives being typed at', () => {
  it('drops anything that is not part of a number', () => {
    expect(stripMoneyDraft('$1,234.56')).toBe('1234.56');
    expect(stripMoneyDraft('abc12x3')).toBe('123');
  });

  it('keeps only the first decimal point and a leading minus', () => {
    // Tolerant rather than rejecting: this is fed pasted text and half-typed
    // text, and a field that silently swallows a keystroke feels as broken as
    // one whose caret jumps.
    expect(stripMoneyDraft('1.2.3')).toBe('1.23');
    expect(stripMoneyDraft('12-34')).toBe('1234');
    expect(stripMoneyDraft('-12-34')).toBe('-1234');
  });
});

describe('the caret stays where the reader put it', () => {
  it('follows a digit typed onto the end', () => {
    expect(shown(type('$100,00|', '10000'))).toBe('$10,000|');
  });

  it('survives the separator that appears as a number crosses a thousand', () => {
    // Typing the fourth digit inserts a comma to the left of the caret. Counting
    // significant characters rather than offsets is what keeps the caret after
    // the digit just typed instead of one place back.
    expect(shown(type('$1000|', '100'))).toBe('$1,000|');
  });

  it('stays put when a digit is inserted in the middle', () => {
    // The case that makes naive reformatting unusable: click between two digits,
    // type, and a reset caret sends the next keystroke somewhere else.
    expect(shown(type('$129|,000', '12000'))).toBe('$129|,000');
  });

  it('lands after the dollar sign rather than before it', () => {
    // Nobody wants to type to the left of the prefix.
    expect(caretAfter('$1,000', 0)).toBe(1);
    expect(shown(type('|5', ''))).toBe('$|5');
  });

  it('handles a caret at the very start of an empty field', () => {
    expect(shown(type('|', ''))).toBe('|');
  });
});

describe('backspacing a separator deletes the digit before it', () => {
  it('removes a digit rather than appearing to do nothing', () => {
    // Deleting the comma from `$1,000` leaves the digits unchanged, so
    // reformatting puts it straight back and the key looks dead. Comparing
    // against the previous raw value is the only way to tell that edit from one
    // that changed nothing (§30.3).
    //
    // The result is `$0` rather than `$000`: taking the leading digit off 1000
    // leaves 000, and leading zeros are not a number anyone means. Grouping
    // normalises them, which is right — the field holds a value, not a spelling.
    expect(shown(type('$1|000', '1000'))).toBe('$|0');
  });

  it('leaves a real deletion alone', () => {
    // Backspacing a digit already changed the number; nothing extra should go.
    expect(shown(type('$100|', '1000'))).toBe('$100|');
  });

  it('does not fire when the dollar sign is deleted at the very start', () => {
    // There is no significant character before the caret to take, so the guard
    // must not reach behind the start of the string.
    expect(shown(type('|1,000', '1000'))).toBe('$|1,000');
  });
});

describe('typing a whole figure, one keystroke at a time', () => {
  /** Replay a string as if it were typed at the end of the field. */
  function keystrokes(input: string) {
    let raw = '';
    const seen: string[] = [];
    for (const char of input) {
      const display = formatMoneyDraft(raw);
      const edit = editMoneyDraft(display + char, display.length + 1, raw);
      raw = edit.raw;
      seen.push(shown(edit));
    }
    return seen;
  }

  it('shows a salary becoming money as it is entered', () => {
    expect(keystrokes('95000')).toEqual(['$9|', '$95|', '$950|', '$9,500|', '$95,000|']);
  });

  it('lets a decimal be typed through without being rewritten underneath', () => {
    // The zero-then-point case is the one a naive implementation ruins, by
    // collapsing `$0.` back to `$0` and eating the keystroke that follows.
    expect(keystrokes('0.5')).toEqual(['$0|', '$0.|', '$0.5|']);
  });

  it('carries a leading minus through, for money that went out', () => {
    expect(keystrokes('-250')).toEqual(['-|', '-$2|', '-$25|', '-$250|']);
  });
});

describe('names, once a household can have three', () => {
  it('joins two with an ampersand and three with commas', () => {
    // `join(' & ')` reads as a machine past two — "Ada & Ben & Cass". A
    // household of two hid it until §30.1 made a third person possible.
    expect(nameList(['Ada'])).toBe('Ada');
    expect(nameList(['Ada', 'Ben'])).toBe('Ada & Ben');
    expect(nameList(['Ada', 'Ben', 'Cass'])).toBe('Ada, Ben & Cass');
    expect(nameList(['Ada', 'Ben', 'Cass', 'Dev'])).toBe('Ada, Ben, Cass & Dev');
  });

  it('says nothing for nobody', () => {
    expect(nameList([])).toBe('');
  });
});

describe('what comes out is what the ledger reads', () => {
  it('round-trips through the parser every form uses', () => {
    // The whole point of keeping drafts raw: `parseAmount` is unchanged and
    // never sees a dollar sign it has to know about.
    for (const [typed, expected] of [
      ['100000', '100000.0000'],
      ['1234.56', '1234.5600'],
      ['-4000', '-4000.0000'],
    ] as const) {
      const edit = editMoneyDraft(typed, typed.length, '');
      expect(parseAmount(edit.raw)!.toString()).toBe(expected);
    }
  });

  it('gives the parser a blank for a blank, so it answers unknown', () => {
    const edit = editMoneyDraft('', 0, '100');
    expect(edit.raw).toBe('');
    expect(parseAmount(edit.raw)).toBeNull();
  });
});
