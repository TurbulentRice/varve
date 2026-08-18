import { describe, expect, it } from 'vitest';
import { accountId, loanId } from '@varve/core';
import {
  defaultRecordYear,
  formatRoute,
  OVERVIEW,
  parseRoute,
  sameRoute,
  sectionOf,
  type Route,
} from '../src/routing/route.js';

describe('reading a URL', () => {
  it('treats an empty hash as the Overview', () => {
    for (const hash of ['', '#', '#/', '/']) {
      expect(parseRoute(hash), hash).toEqual(OVERVIEW);
    }
  });

  it('reads an account', () => {
    expect(parseRoute('#/accounts/acct:1')).toEqual({
      view: 'account',
      accountId: accountId('acct:1'),
    });
  });

  it('reads a year in the record room', () => {
    expect(parseRoute('#/record/2024')).toEqual({ view: 'record', year: 2024 });
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

describe('a URL it cannot read is the Overview, not an error', () => {
  // There is no 404 in an app whose whole dataset is already in the browser.
  // Every one of these is something a real person could end up holding: a stale
  // link, a typo, a hand-edited hash, a route from a version that no longer
  // exists.
  const nonsense = [
    '#/nowhere',
    '#/record/nineteen',
    '#/record/2024abc',
    '#/record/0x7e8', // parsed by Number, rejected here
    '#/record/ 2024 ', // ditto
    '#/record/1e999',
    '#/record/0',
    '#/record/99999',
    '#/ACCOUNTS/acct:1', // routes are lower case
    '#/accounts/acct:1/extra/segments',
  ];

  for (const hash of nonsense) {
    it(`falls back for ${JSON.stringify(hash)}`, () => {
      const route = parseRoute(hash);
      // The trailing-segments case still names an account, which is the right
      // reading — extra junk after a valid route should not lose the route.
      if (hash.startsWith('#/accounts/acct:1')) expect(route.view).toBe('account');
      else expect(route).toEqual(OVERVIEW);
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
  it('writes the Overview as a bare hash', () => {
    expect(formatRoute(OVERVIEW)).toBe('#/');
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
    expect(formatRoute({ view: 'record', year: 2024 })).toBe('#/record/2024');
  });
});

describe('parsing and printing are inverse', () => {
  const routes: Route[] = [
    OVERVIEW,
    { view: 'account', accountId: accountId('acct:1') },
    { view: 'account', accountId: accountId('acct:42') },
    { view: 'account', accountId: accountId('weird id/with slash') },
    { view: 'record', year: 2006 },
    { view: 'record', year: 2062 },
    { view: 'debts' },
    { view: 'debt', loanId: loanId('loan:1') },
    { view: 'plan' },
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
    expect(sameRoute({ view: 'record', year: 2024 }, { view: 'record', year: 2025 })).toBe(false);
    expect(sameRoute({ view: 'record', year: 2024 }, OVERVIEW)).toBe(false);
    expect(sameRoute(OVERVIEW, OVERVIEW)).toBe(true);
  });
});

describe('the debts surface', () => {
  it('reads the list and a single debt', () => {
    expect(parseRoute('#/debts')).toEqual({ view: 'debts' });
    expect(parseRoute('#/debts/loan:1')).toEqual({ view: 'debt', loanId: loanId('loan:1') });
  });

  it('round-trips both', () => {
    for (const route of [
      { view: 'debts' } as const,
      { view: 'debt', loanId: loanId('loan:1') } as const,
    ]) {
      expect(parseRoute(formatRoute(route))).toEqual(route);
    }
  });

  it('treats a bare #/debts as the list rather than a missing debt', () => {
    // The list is a place you can be, so it is a destination rather than a
    // route with a parameter missing.
    expect(parseRoute('#/debts/')).toEqual({ view: 'debts' });
  });

  it('keeps the two apart when comparing', () => {
    expect(sameRoute({ view: 'debts' }, { view: 'debt', loanId: loanId('loan:1') })).toBe(false);
    expect(
      sameRoute({ view: 'debt', loanId: loanId('loan:1') }, { view: 'debt', loanId: loanId('loan:2') }),
    ).toBe(false);
  });
});

describe('the old #/loans links still work', () => {
  // Renaming a route inside a total parser is not free: without the alias every
  // existing bookmark would resolve to the Overview and look like it had simply
  // gone somewhere else, which is the failure §12.5 corrected once already.
  it('understands the old spelling for both the list and one debt', () => {
    expect(parseRoute('#/loans')).toEqual({ view: 'debts' });
    expect(parseRoute('#/loans/loan:1')).toEqual({ view: 'debt', loanId: loanId('loan:1') });
  });

  it('never writes the old spelling back out', () => {
    expect(formatRoute({ view: 'debts' })).toBe('#/debts');
    expect(formatRoute({ view: 'debt', loanId: loanId('loan:1') })).toBe('#/debts/loan:1');
  });
});

describe('the accounts list folded into the Overview', () => {
  it('sends a bare #/accounts to the Overview that absorbed it', () => {
    // §31.2 merged the two pages. Parsed rather than dropped, so an old bookmark
    // lands on the page that now holds the list instead of looking like it went
    // somewhere unrelated.
    expect(parseRoute('#/accounts')).toEqual(OVERVIEW);
    expect(parseRoute('#/accounts/')).toEqual(OVERVIEW);
  });

  it('still reads a single account, which was never the duplicated part', () => {
    expect(parseRoute('#/accounts/acct:1')).toEqual({
      view: 'account',
      accountId: accountId('acct:1'),
    });
    expect(formatRoute({ view: 'account', accountId: accountId('acct:1') })).toBe('#/accounts/acct:1');
  });
});

describe('the record room', () => {
  it('reads a bare #/record as the current default year', () => {
    // A place you can be, not a route with a parameter missing — same rule the
    // accounts and debts lists follow.
    const route = parseRoute('#/record');
    expect(route.view).toBe('record');
    expect((route as { year: number }).year).toBe(defaultRecordYear());
  });

  it('still understands the old #/years spelling', () => {
    // Renaming inside a total parser would send every existing bookmark to the
    // Overview and look like it had simply gone somewhere else (§29.3).
    expect(parseRoute('#/years/2024')).toEqual({ view: 'record', year: 2024 });
    expect(parseRoute('#/years')).toEqual({ view: 'record', year: defaultRecordYear() });
  });

  it('never writes the old spelling back out', () => {
    expect(formatRoute({ view: 'record', year: 2024 })).toBe('#/record/2024');
  });
});

describe('which section the shell should light up', () => {
  it('keeps the section lit while you are inside it', () => {
    // An account detail page belongs to the Overview now that the list does.
    expect(sectionOf({ view: 'account', accountId: accountId('acct:1') })).toBe('overview');
    expect(sectionOf({ view: 'debt', loanId: loanId('loan:1') })).toBe('debts');
  });

  it('lights nothing for the record room, which is where you write rather than look', () => {
    // The four destinations answer questions; this one takes answers. Marking a
    // nav item current while it is open would claim it belongs to one of them.
    expect(sectionOf({ view: 'record', year: 2024 })).toBeNull();
  });

  it('lights each destination for itself', () => {
    for (const view of ['overview', 'debts', 'plan'] as const) {
      expect(sectionOf({ view })).toBe(view);
    }
  });
});
