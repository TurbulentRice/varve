/**
 * Exact decimal money.
 *
 * Backed by a `bigint` of minor units at a fixed scale of 4 decimal places.
 * Never a float: `0.1 + 0.2` is exactly `0.3` here.
 *
 * ## Why scale 4
 *
 * The legacy Access database stores every monetary value as the `Currency` type,
 * which is a 64-bit integer scaled by 10,000. All 1,691 monetary values in the
 * source data carry exactly four decimal places. Scale 4 therefore round-trips
 * the entire 20-year history losslessly, and leaves room for sub-cent
 * intermediates (fee accruals, unit prices) without a second representation.
 *
 * ## Money vs. rates
 *
 * `Money` is for amounts. Dimensionless ratios — returns, growth rates,
 * weights — are plain `number`s, because they are inherently irrational
 * (chain-linked products, fractional powers) and exactness is neither
 * achievable nor meaningful. {@link Money.ratio} is the deliberate seam between
 * the two worlds: exact money in, ordinary float out.
 *
 * ## Deferred: currency
 *
 * Amounts are currency-less for now (single-currency households). Adding
 * multi-currency later means a `currency` field plus a guard in each binary
 * operation; nothing about the representation has to change.
 */

/** Decimal places retained internally. */
export const SCALE = 4;

const UNIT = 10_000n;

/** Precision used when converting a float multiplier into exact arithmetic. */
const FACTOR_SCALE = 1_000_000_000n; // 1e9

/**
 * Divide two bigints, rounding halves to even ("banker's rounding").
 *
 * Half-even is the default because these operations compound: half-up would
 * introduce a small upward bias across thousands of projected periods, which is
 * exactly the kind of drift a money type exists to prevent.
 */
export function divRoundHalfEven(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('Division by zero');

  let n = numerator;
  let d = denominator;
  if (d < 0n) {
    n = -n;
    d = -d;
  }

  const q = n / d; // truncates toward zero
  const r = n % d; // shares sign with n
  if (r === 0n) return q;

  const sign = n < 0n ? -1n : 1n;
  const twiceRemainder = 2n * (r < 0n ? -r : r);

  if (twiceRemainder > d) return q + sign; // past halfway: away from zero
  if (twiceRemainder < d) return q; // short of halfway: toward zero
  return q % 2n === 0n ? q : q + sign; // exactly halfway: to even
}

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;

export class Money {
  /** Minor units, scaled by 10^{@link SCALE}. */
  readonly units: bigint;

  private constructor(units: bigint) {
    this.units = units;
    Object.freeze(this);
  }

  // ---------------------------------------------------------------- factories

  /** Construct directly from minor units (scale 4). */
  static fromUnits(units: bigint): Money {
    return new Money(units);
  }

  /**
   * Parse a decimal string. Exact for four or fewer decimal places, which
   * covers all real monetary input; anything longer rounds half-even.
   */
  static fromString(value: string): Money {
    const match = DECIMAL_PATTERN.exec(value.trim());
    if (!match) throw new TypeError(`Not a decimal number: ${JSON.stringify(value)}`);

    const [, sign, whole, fraction = ''] = match;
    const negative = sign === '-';

    // Round the whole value in one division. Splitting it — rounding the excess
    // digits separately and adding — would test parity on the increment rather
    // than on the result, so `1.00015` would tie to `1.0001` instead of `1.0002`.
    const units =
      fraction.length <= SCALE
        ? BigInt(whole! + fraction.padEnd(SCALE, '0'))
        : divRoundHalfEven(BigInt(whole! + fraction), 10n ** BigInt(fraction.length - SCALE));

    return new Money(negative ? -units : units);
  }

  /**
   * Convert from a float, rounding half-even.
   *
   * Lossy by nature — prefer {@link Money.fromString} wherever the source is
   * text (CSV, JSON, form input) so no float ever sits between the user and the
   * ledger.
   */
  static fromNumber(value: number): Money {
    if (!Number.isFinite(value)) throw new RangeError(`Not a finite number: ${value}`);
    return Money.fromString(value.toFixed(SCALE + 2));
  }

  static readonly ZERO = new Money(0n);

  static zero(): Money {
    return Money.ZERO;
  }

  /** Exact sum. Empty input is zero. */
  static sum(amounts: readonly Money[]): Money {
    let total = 0n;
    for (const amount of amounts) total += amount.units;
    return new Money(total);
  }

  static min(a: Money, b: Money): Money {
    return a.units <= b.units ? a : b;
  }

  static max(a: Money, b: Money): Money {
    return a.units >= b.units ? a : b;
  }

  // -------------------------------------------------------------- arithmetic

  plus(other: Money): Money {
    return new Money(this.units + other.units);
  }

  minus(other: Money): Money {
    return new Money(this.units - other.units);
  }

  negate(): Money {
    return new Money(-this.units);
  }

  abs(): Money {
    return this.units < 0n ? new Money(-this.units) : this;
  }

  /**
   * Scale by a dimensionless factor, rounding half-even.
   *
   * The factor is captured at 1e-9 precision, which is far finer than any
   * growth rate or weight in practice.
   */
  times(factor: number): Money {
    if (!Number.isFinite(factor)) throw new RangeError(`Not a finite factor: ${factor}`);
    const scaled = BigInt(Math.round(factor * Number(FACTOR_SCALE)));
    return new Money(divRoundHalfEven(this.units * scaled, FACTOR_SCALE));
  }

  /** Divide by a dimensionless divisor, rounding half-even. */
  dividedBy(divisor: number): Money {
    if (!Number.isFinite(divisor)) throw new RangeError(`Not a finite divisor: ${divisor}`);
    if (divisor === 0) throw new RangeError('Division by zero');
    const scaled = BigInt(Math.round(divisor * Number(FACTOR_SCALE)));
    return new Money(divRoundHalfEven(this.units * FACTOR_SCALE, scaled));
  }

  /**
   * Ratio of two amounts, as a dimensionless `number`.
   *
   * This is the boundary between exact money and ordinary floating point:
   * money flows in, a rate flows out. Returns, weights, and growth factors all
   * cross here.
   */
  ratio(denominator: Money): number {
    if (denominator.units === 0n) throw new RangeError('Ratio with zero denominator');
    return Number(this.units) / Number(denominator.units);
  }

  /**
   * Split into parts proportional to `weights`, preserving the total exactly.
   *
   * Uses the largest-remainder method, so the pennies that rounding would
   * otherwise destroy are handed to the parts with the strongest claim.
   */
  allocate(weights: readonly number[]): Money[] {
    if (weights.length === 0) throw new RangeError('Cannot allocate across zero parts');
    if (weights.some((w) => w < 0)) throw new RangeError('Weights must be non-negative');

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    if (totalWeight === 0) throw new RangeError('Weights must not sum to zero');

    const exact = weights.map((w) => (Number(this.units) * w) / totalWeight);
    const floors = exact.map((v) => BigInt(Math.floor(v)));
    const distributed = floors.reduce((a, b) => a + b, 0n);

    let remainder = this.units - distributed;
    const order = exact
      .map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac);

    const step = remainder < 0n ? -1n : 1n;
    const result = [...floors];
    let cursor = 0;
    while (remainder !== 0n && order.length > 0) {
      const target = order[cursor % order.length]!.i;
      result[target] = result[target]! + step;
      remainder -= step;
      cursor += 1;
    }

    return result.map((units) => new Money(units));
  }

  // -------------------------------------------------------------- comparison

  compare(other: Money): -1 | 0 | 1 {
    if (this.units < other.units) return -1;
    if (this.units > other.units) return 1;
    return 0;
  }

  equals(other: Money): boolean {
    return this.units === other.units;
  }

  isZero(): boolean {
    return this.units === 0n;
  }

  isPositive(): boolean {
    return this.units > 0n;
  }

  isNegative(): boolean {
    return this.units < 0n;
  }

  // ----------------------------------------------------------- serialization

  /** Lossless decimal string, always {@link SCALE} places: `"1234.5600"`. */
  toString(): string {
    const negative = this.units < 0n;
    const digits = (negative ? -this.units : this.units).toString().padStart(SCALE + 1, '0');
    const whole = digits.slice(0, -SCALE);
    const fraction = digits.slice(-SCALE);
    return `${negative ? '-' : ''}${whole}.${fraction}`;
  }

  /** Serializes as its lossless string form, so JSON round-trips exactly. */
  toJSON(): string {
    return this.toString();
  }

  /** Lossy. For charts and display only — never for further ledger arithmetic. */
  toNumber(): number {
    return Number(this.units) / Number(UNIT);
  }

  /** Human-facing rendering. Defaults to whole cents in the current locale. */
  format(options: Intl.NumberFormatOptions & { locale?: string } = {}): string {
    const { locale = 'en-US', ...rest } = options;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      ...rest,
    }).format(this.toNumber());
  }
}

/** Convenience constructor: `m('1248.29')`, `m(1248.29)`, `m(0n)`. */
export function m(value: string | number | bigint): Money {
  if (typeof value === 'bigint') return Money.fromUnits(value);
  if (typeof value === 'number') return Money.fromNumber(value);
  return Money.fromString(value);
}
