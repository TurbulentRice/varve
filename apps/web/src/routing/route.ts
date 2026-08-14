/**
 * Where you are, as a value.
 *
 * The app held its view state in two nullable `useState` hooks until now, which
 * is fine right up until someone tries to bookmark an account, send one to
 * somebody, or press the back button. On a phone the back gesture is the
 * system's, so the first instinct after opening an account was the one action
 * that closed the whole thing.
 *
 * A route here is a discriminated union with a parser and a printer either side
 * of it. Nothing in this file is React, or knows what a browser is: it is a
 * total function from a string to a small algebra and back. That is what makes
 * it testable the way the rest of this codebase is testable, and it is the same
 * split the charts use — the interesting part is data, the framework part is
 * boring glue.
 *
 * ## An unparseable URL is not an error
 *
 * {@link parseRoute} is total. Anything it does not recognise is the dashboard —
 * a stale link, a typo, a hand-edited hash, a route that existed in an earlier
 * version. There is no 404 in an app whose entire dataset is already in the
 * browser, and inventing one would be inventing a failure mode.
 *
 * ## Identity, never data
 *
 * Parameters name things; they never carry them. `#/accounts/acct:1` says which
 * account, not what it is worth. A URL is the most likely thing to be copied out
 * of this app and pasted into a chat or a screenshot, so the same instinct
 * behind ground rule 1 applies to what reaches a clipboard. Account ids are
 * opaque and local to the document, so they carry nothing.
 *
 * ## The interface says Debts; the domain says Loan
 *
 * Both are right, and the mapping is stated once, here. A URL is user-facing, so
 * it uses the word a person would use for the thing they owe; the domain keeps
 * `Loan`, which is what the entity is (§13.1). `debt` in this file always names
 * a route and never a type.
 *
 * `loans` is still *parsed*, as an alias, and never printed. Renaming a route in
 * a total parser is not free: every existing `#/loans` bookmark would fall
 * through to the Overview and look like it had simply gone somewhere else. That
 * is the failure §12.5 corrected once already — a URL that quietly resolves
 * elsewhere destroys the evidence, and the reader cannot say what they tried.
 *
 * See §12 and §22.1 of the working doc.
 */

import { accountId, loanId, type AccountId, type LoanId } from '@varve/core';

export type Route =
  | { readonly view: 'overview' }
  | { readonly view: 'accounts' }
  | { readonly view: 'account'; readonly accountId: AccountId }
  | { readonly view: 'debts' }
  | { readonly view: 'debt'; readonly loanId: LoanId }
  | { readonly view: 'plan' }
  | { readonly view: 'year'; readonly year: number };

export const OVERVIEW: Route = { view: 'overview' };

/**
 * Years outside this are a malformed URL rather than a year someone meant.
 *
 * Generous on purpose: the ledger starts in 2006 and projects decades forward,
 * and the editor lets you step to any year. The bound exists to reject `1e999`
 * and `0`, not to police the calendar.
 */
const EARLIEST_YEAR = 1900;
const LATEST_YEAR = 2200;

/**
 * Escape a path segment, but leave `:` alone.
 *
 * `:` is a legal path character (RFC 3986 `pchar`) and every account id contains
 * one, so encoding it would turn every account URL into `acct%3A1` for no gain.
 * Everything else — `/` above all — still gets escaped, so an id can never split
 * a segment in two.
 */
function encodeSegment(value: string): string {
  return encodeURIComponent(value).replace(/%3A/gi, ':');
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // A lone `%` is not valid percent-encoding and throws. The raw text is a
    // better guess than failing, and an id that does not match anything lands
    // on the dashboard anyway.
    return value;
  }
}

/** Read a location hash. Total: anything unrecognised is the Overview. */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\//, '');
  const segments = path.split('/').filter((s) => s.length > 0);

  if (segments.length === 0) return OVERVIEW;

  const [head, tail] = segments;

  if (head === 'accounts') {
    // A bare `#/accounts` is now a destination rather than a missing id: the
    // list is a place you can be, which is most of what §19.2 means by making
    // positions first-class.
    return tail ? { view: 'account', accountId: accountId(decodeSegment(tail)) } : { view: 'accounts' };
  }

  // `loans` is the alias; `debts` is canonical. Both parse, only one prints.
  if (head === 'debts' || head === 'loans') {
    return tail ? { view: 'debt', loanId: loanId(decodeSegment(tail)) } : { view: 'debts' };
  }

  if (head === 'plan') return { view: 'plan' };

  if (head === 'years' && tail) {
    // `Number` would accept '2024abc' as NaN but also ' 2024 ' and '0x7e8'.
    // Requiring digits keeps the URL meaning exactly what it looks like.
    if (!/^\d+$/.test(tail)) return OVERVIEW;
    const year = Number(tail);
    if (year < EARLIEST_YEAR || year > LATEST_YEAR) return OVERVIEW;
    return { view: 'year', year };
  }

  return OVERVIEW;
}

/** Render a route as a location hash. Inverse of {@link parseRoute}. */
export function formatRoute(route: Route): string {
  switch (route.view) {
    case 'accounts':
      return '#/accounts';
    case 'account':
      return `#/accounts/${encodeSegment(route.accountId)}`;
    case 'year':
      return `#/years/${route.year}`;
    case 'debts':
      return '#/debts';
    case 'debt':
      return `#/debts/${encodeSegment(route.loanId)}`;
    case 'plan':
      return '#/plan';
    case 'overview':
      return '#/';
  }
}

/** Whether two routes point at the same place. */
export function sameRoute(a: Route, b: Route): boolean {
  if (a.view !== b.view) return false;
  if (a.view === 'account' && b.view === 'account') return a.accountId === b.accountId;
  if (a.view === 'year' && b.view === 'year') return a.year === b.year;
  if (a.view === 'debt' && b.view === 'debt') return a.loanId === b.loanId;
  return true;
}

/**
 * Which nav destination a route belongs under.
 *
 * An account is *within* Accounts and a loan is within Debts, so the shell keeps
 * the section lit rather than going dark the moment someone opens a detail page.
 * The year editor belongs to no destination: it is reached from anywhere and is
 * a task rather than a place, so nothing is marked current while it is open.
 */
export function sectionOf(route: Route): Route['view'] | null {
  switch (route.view) {
    case 'account':
      return 'accounts';
    case 'debt':
      return 'debts';
    case 'year':
      return null;
    default:
      return route.view;
  }
}
