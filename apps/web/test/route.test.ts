import { describe, expect, it } from 'vitest';
import { accountId, loanId } from '@varve/core';
import { DASHBOARD, formatRoute, parseRoute, sameRoute, type Route } from '../src/routing/route.js';

describe('reading a URL', () => {
  it('treats an empty hash as the dashboard', () => {
    for (const hash of ['', '#', '#/', '/']) {
      expect(parseRoute(hash), hash).toEqual(DASHBOARD);
    }
  });

  it('reads an account', () => {
    expect(parseRoute('#/accounts/acct:1')).toEqual({
      view: 'account',
      accountId: accountId('acct:1'),
    });
  });

  it('reads a year', () => {
    expect(parseRoute('#/years/2024')).toEqual({ view: 'year', year: 2024 });
  });

  it('does not mind a missing leading slash', () => {
    expect(parseRoute('#accounts/acct:1')).toEqual({
      view: 'account',
      accountId: accountId('acct:1'),
    });
  });

  it('ignores empty segments rather than tripping over them', () => {
    expect(parseRoute('#//accounts//acct:1//')).toEqual({
      view: 'account',
      accountId: accountId('acct:1'),
    });
  });
});

describe('a URL it cannot read is the dashboard, not an error', () => {
  // There is no 404 in an app whose whole dataset is already in the browser.
  // Every one of these is something a real person could end up holding: a stale
  // link, a typo, a hand-edited hash, a route from a version that no longer
  // exists.
  const nonsense = [
    '#/nowhere',
    '#/accounts', // no id
    '#/years', // no year
    '#/years/nineteen',
    '#/years/2024abc',
    '#/years/0x7e8', // parsed by Number, rejected here
    '#/years/ 2024 ', // ditto
    '#/years/1e999',
    '#/years/0',
    '#/years/99999',
    '#/ACCOUNTS/acct:1', // routes are lower case
    '#/accounts/acct:1/extra/segments',
  ];

  for (const hash of nonsense) {
    it(`falls back for ${JSON.stringify(hash)}`, () => {
      const route = parseRoute(hash);
      // The trailing-segments case still names an account, which is the right
      // reading — extra junk after a valid route should not lose the route.
      if (hash.startsWith('#/accounts/acct:1')) expect(route.view).toBe('account');
      else expect(route).toEqual(DASHBOARD);
    });
  }

  it('survives malformed percent-encoding instead of throwing', () => {
    // decodeURIComponent throws on a lone '%'. A router that throws on a bad URL
    // gives you a blank screen.
    expect(() => parseRoute('#/accounts/%')).not.toThrow();
    expect(parseRoute('#/accounts/%').view).toBe('account');
  });
});

describe('writing a URL', () => {
  it('writes the dashboard as a bare hash', () => {
    expect(formatRoute(DASHBOARD)).toBe('#/');
  });

  it('leaves the colon in an account id alone', () => {
    // ':' is a legal path character, and every id has one. Escaping it would
    // turn every account URL into acct%3A1 for no benefit.
    expect(formatRoute({ view: 'account', accountId: accountId('acct:1') })).toBe(
      '#/accounts/acct:1',
    );
  });

  it('escapes anything that could split a segment', () => {
    const hostile = accountId('a/b?c#d e');
    const hash = formatRoute({ view: 'account', accountId: hostile });

    // The id must survive as exactly one segment: '#', 'accounts', and the id.
    // The leading '#' is the fragment marker, so the id itself is what matters.
    const segments = hash.split('/');
    expect(segments).toHaveLength(3);
    expect(segments[2]).not.toMatch(/[?#/ ]/);
    expect(parseRoute(hash)).toEqual({ view: 'account', accountId: hostile });
  });

  it('writes a year plainly', () => {
    expect(formatRoute({ view: 'year', year: 2024 })).toBe('#/years/2024');
  });
});

describe('parsing and printing are inverse', () => {
  const routes: Route[] = [
    DASHBOARD,
    { view: 'account', accountId: accountId('acct:1') },
    { view: 'account', accountId: accountId('acct:42') },
    { view: 'account', accountId: accountId('weird id/with slash') },
    { view: 'year', year: 2006 },
    { view: 'year', year: 2062 },
  ];

  for (const route of routes) {
    it(`round-trips ${formatRoute(route)}`, () => {
      expect(parseRoute(formatRoute(route))).toEqual(route);
    });
  }
});

describe('comparing routes', () => {
  it('distinguishes different accounts', () => {
    const a: Route = { view: 'account', accountId: accountId('acct:1') };
    const b: Route = { view: 'account', accountId: accountId('acct:2') };

    expect(sameRoute(a, a)).toBe(true);
    expect(sameRoute(a, b)).toBe(false);
  });

  it('distinguishes different years, and different views', () => {
    expect(sameRoute({ view: 'year', year: 2024 }, { view: 'year', year: 2025 })).toBe(false);
    expect(sameRoute({ view: 'year', year: 2024 }, DASHBOARD)).toBe(false);
    expect(sameRoute(DASHBOARD, DASHBOARD)).toBe(true);
  });
});

describe('the loans surface', () => {
  it('reads the list and a single loan', () => {
    expect(parseRoute('#/loans')).toEqual({ view: 'loans' });
    expect(parseRoute('#/loans/loan:1')).toEqual({ view: 'loan', loanId: loanId('loan:1') });
  });

  it('round-trips both', () => {
    for (const route of [{ view: 'loans' } as const, { view: 'loan', loanId: loanId('loan:1') } as const]) {
      expect(parseRoute(formatRoute(route))).toEqual(route);
    }
  });

  it('treats a bare #/loans as the list rather than a missing loan', () => {
    // `#/accounts` with no id is nonsense and falls back; `#/loans` is a real
    // destination, because the list is a place you can be.
    expect(parseRoute('#/loans/')).toEqual({ view: 'loans' });
  });

  it('keeps the two apart when comparing', () => {
    expect(sameRoute({ view: 'loans' }, { view: 'loan', loanId: loanId('loan:1') })).toBe(false);
    expect(
      sameRoute({ view: 'loan', loanId: loanId('loan:1') }, { view: 'loan', loanId: loanId('loan:2') }),
    ).toBe(false);
  });
});
