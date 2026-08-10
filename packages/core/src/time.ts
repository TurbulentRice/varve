/**
 * Calendar dates as plain `YYYY-MM-DD` strings.
 *
 * Deliberately not `Date`. A balance observed on 2019-12-31 is that date in
 * every timezone; the moment `Date` gets involved it becomes an instant, and
 * instants shift across midnight depending on where the reader is sitting.
 * Financial periods are calendar facts, so they stay calendar values.
 */

declare const IsoDateBrand: unique symbol;

/** A calendar date in `YYYY-MM-DD` form. */
export type IsoDate = string & { readonly [IsoDateBrand]: true };

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** Validate and brand a `YYYY-MM-DD` string. */
export function isoDate(value: string): IsoDate {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) throw new TypeError(`Not an ISO date (YYYY-MM-DD): ${JSON.stringify(value)}`);

  const [, y, mo, d] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);

  if (month < 1 || month > 12) throw new RangeError(`Month out of range: ${value}`);
  if (day < 1 || day > daysInMonth(year, month)) throw new RangeError(`Day out of range: ${value}`);

  return value as IsoDate;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Days since the Unix epoch. Integer, timezone-free. */
export function epochDay(date: IsoDate): number {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, mo - 1, d) / MS_PER_DAY);
}

export function fromEpochDay(day: number): IsoDate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10) as IsoDate;
}

/** Signed day count from `a` to `b`. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return epochDay(b) - epochDay(a);
}

export function compareDates(a: IsoDate, b: IsoDate): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromEpochDay(epochDay(date) + days);
}

/**
 * The date halfway between two dates, rounded down.
 *
 * Used when importing period-aggregated legacy data: a quarter's contributions
 * are known only as a total, so they are dated at the middle of the quarter.
 * That reproduces the conventional mid-period assumption exactly, while letting
 * the general algorithm handle it with no special case.
 */
export function midpoint(a: IsoDate, b: IsoDate): IsoDate {
  return fromEpochDay(Math.floor((epochDay(a) + epochDay(b)) / 2));
}

export function yearOf(date: IsoDate): number {
  return Number(date.slice(0, 4));
}

// ------------------------------------------------------------------ quarters

export type Quarter = 1 | 2 | 3 | 4;

const QUARTER_END_MONTH: Record<Quarter, number> = { 1: 3, 2: 6, 3: 9, 4: 12 };

/** Last calendar day of the quarter. */
export function quarterEnd(year: number, quarter: Quarter): IsoDate {
  const month = QUARTER_END_MONTH[quarter];
  return isoDate(`${pad4(year)}-${pad2(month)}-${pad2(daysInMonth(year, month))}`);
}

/** First calendar day of the quarter. */
export function quarterStart(year: number, quarter: Quarter): IsoDate {
  return isoDate(`${pad4(year)}-${pad2(QUARTER_END_MONTH[quarter] - 2)}-01`);
}

/** December 31st. */
export function yearEnd(year: number): IsoDate {
  return isoDate(`${pad4(year)}-12-31`);
}

/** January 1st. */
export function yearStart(year: number): IsoDate {
  return isoDate(`${pad4(year)}-01-01`);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

// -------------------------------------------------------------------- ranges

/** A half-open calendar interval `(start, end]`. */
export interface DateRange {
  readonly start: IsoDate;
  readonly end: IsoDate;
}

export function rangeDays(range: DateRange): number {
  return daysBetween(range.start, range.end);
}

/**
 * Whether `date` falls inside `(start, end]`.
 *
 * Half-open at the start so that consecutive periods sharing a boundary date
 * cannot double-count a flow: a contribution on 2020-12-31 belongs to the
 * period ending that day, not the one beginning it.
 */
export function rangeContains(range: DateRange, date: IsoDate): boolean {
  return date > range.start && date <= range.end;
}

export function calendarYearRange(year: number): DateRange {
  return { start: yearEnd(year - 1), end: yearEnd(year) };
}
