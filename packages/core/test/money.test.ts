import { describe, expect, it } from 'vitest';
import { divRoundHalfEven, m, Money } from '../src/money.js';

describe('exactness', () => {
  it('does not drift the way floats do', () => {
    expect(0.1 + 0.2).not.toBe(0.3); // the problem being solved
    expect(m('0.1').plus(m('0.2')).toString()).toBe('0.3000');
  });

  it('survives a thousand additions of a third of a cent', () => {
    let total = Money.zero();
    for (let i = 0; i < 1000; i += 1) total = total.plus(m('0.0033'));
    expect(total.toString()).toBe('3.3000');
  });

  it('round-trips four-decimal values losslessly', () => {
    // Access stores money as Currency: a 64-bit integer scaled by 10,000, so
    // every value arriving from the legacy database has exactly four decimals.
    for (const value of ['12345.6789', '98765.4321', '111.1111', '1000.0000', '-0.0001']) {
      expect(m(value).toString()).toBe(value.padEnd(value.indexOf('.') + 5, '0'));
    }
  });

  it('serializes through JSON without going near a float', () => {
    const original = m('123456.7891');
    const revived = m(JSON.parse(JSON.stringify({ v: original })).v);
    expect(revived.equals(original)).toBe(true);
  });
});

describe('parsing', () => {
  it('accepts shorthand and normalizes the scale', () => {
    expect(m('5').toString()).toBe('5.0000');
    expect(m('5.5').toString()).toBe('5.5000');
    expect(m('+5.5').toString()).toBe('5.5000');
    expect(m('-5.5').toString()).toBe('-5.5000');
  });

  it('rounds half-even beyond four decimals', () => {
    expect(m('1.00005').toString()).toBe('1.0000'); // ties to even
    expect(m('1.00015').toString()).toBe('1.0002');
    expect(m('1.000151').toString()).toBe('1.0002'); // past the tie
  });

  it('rejects nonsense', () => {
    for (const bad of ['', 'abc', '1.2.3', '1,248.29', '1e5']) {
      expect(() => m(bad)).toThrow();
    }
  });
});

describe('rounding', () => {
  it('sends ties to even in both directions', () => {
    expect(divRoundHalfEven(5n, 2n)).toBe(2n); // 2.5 -> 2
    expect(divRoundHalfEven(7n, 2n)).toBe(4n); // 3.5 -> 4
    expect(divRoundHalfEven(-5n, 2n)).toBe(-2n);
    expect(divRoundHalfEven(-7n, 2n)).toBe(-4n);
  });

  it('rounds normally when not on a tie', () => {
    expect(divRoundHalfEven(4n, 3n)).toBe(1n);
    expect(divRoundHalfEven(5n, 3n)).toBe(2n);
    expect(divRoundHalfEven(-5n, 3n)).toBe(-2n);
  });

  it('refuses to divide by zero', () => {
    expect(() => divRoundHalfEven(1n, 0n)).toThrow(RangeError);
    expect(() => m('1').dividedBy(0)).toThrow(RangeError);
  });

  it('stays unbiased across many multiplications', () => {
    // Half-up would drift upward here; half-even should not.
    let total = Money.zero();
    for (let i = 0; i < 10_000; i += 1) total = total.plus(m('0.00005').times(1));
    expect(total.toString()).toBe('0.0000');
  });
});

describe('arithmetic', () => {
  it('scales by a rate', () => {
    expect(m('1000').times(1.07).toString()).toBe('1070.0000');
    expect(m('100').times(0.5).toString()).toBe('50.0000');
    expect(m('100').times(-1).toString()).toBe('-100.0000');
  });

  it('divides', () => {
    expect(m('100').dividedBy(3).toString()).toBe('33.3333');
    expect(m('100').dividedBy(4).toString()).toBe('25.0000');
  });

  it('produces a plain number when crossing into rate-land', () => {
    expect(m('50').ratio(m('200'))).toBe(0.25);
    expect(() => m('50').ratio(Money.zero())).toThrow(RangeError);
  });

  it('sums an empty list to zero', () => {
    expect(Money.sum([]).isZero()).toBe(true);
  });

  it('compares and orders', () => {
    expect(m('1').compare(m('2'))).toBe(-1);
    expect(m('2').compare(m('2'))).toBe(0);
    expect(Money.max(m('1'), m('2')).toString()).toBe('2.0000');
    expect(Money.min(m('-1'), m('2')).toString()).toBe('-1.0000');
  });

  it('is immutable', () => {
    const original = m('100');
    original.plus(m('50'));
    expect(original.toString()).toBe('100.0000');
    expect(Object.isFrozen(original)).toBe(true);
  });
});

describe('allocation', () => {
  it('never loses or invents a unit', () => {
    const parts = m('100').allocate([1, 1, 1]);
    expect(Money.sum(parts).toString()).toBe('100.0000');
  });

  it('splits proportionally', () => {
    const parts = m('100').allocate([3, 1]);
    expect(parts.map(String)).toEqual(['75.0000', '25.0000']);
  });

  it('hands remainders to the strongest claim', () => {
    const parts = m('0.0001').allocate([1, 1]);
    expect(Money.sum(parts).toString()).toBe('0.0001');
  });

  it('handles negative totals', () => {
    const parts = m('-100').allocate([1, 1, 1]);
    expect(Money.sum(parts).toString()).toBe('-100.0000');
  });

  it('rejects incoherent weights', () => {
    expect(() => m('100').allocate([])).toThrow();
    expect(() => m('100').allocate([0, 0])).toThrow();
    expect(() => m('100').allocate([-1, 2])).toThrow();
  });
});

describe('display', () => {
  it('formats as currency', () => {
    expect(m('1234.5600').format()).toBe('$1,234.56');
    expect(m('-1234.5600').format()).toBe('-$1,234.56');
  });

  it('converts to a number only when asked', () => {
    expect(m('1234.5600').toNumber()).toBeCloseTo(1234.56, 10);
  });
});
