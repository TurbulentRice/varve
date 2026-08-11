import { describe, expect, it } from 'vitest';
import {
  Money,
  accountId,
  flowId,
  householdId,
  isoDate,
  noteId,
  observationId,
  ownerId,
  type Account,
  type BalanceObservation,
  type Flow,
  type FlowKind,
} from '@varve/core';
import { InMemoryRepository, emptySnapshot } from '@varve/store';
import { deriveHistory } from '../src/history.js';
import { householdSeries } from '../src/household.js';
import { loadLedger, type Ledger } from '../src/ledger.js';
import { buildHistory } from '../src/index.js';

const HOME = { id: householdId('h'), name: 'Test Household' };
const MAIN = accountId('main');
const CLOSED = accountId('closed');
const BENCH = accountId('bench');

const account = (id: typeof MAIN, name: string, kind: Account['kind']): Account => ({
  id,
  householdId: HOME.id,
  name,
  ownerIds: kind === 'benchmark' ? [] : [ownerId('o1')],
  kind,
  active: true,
});

let seq = 0;
const obs = (acct: typeof MAIN, when: string, amount: string): BalanceObservation => ({
  id: observationId(`o${(seq += 1)}`),
  accountId: acct,
  asOf: isoDate(when),
  amount: Money.fromString(amount),
  source: 'legacy-import',
});

const flow = (
  acct: typeof MAIN,
  when: string,
  amount: string,
  kind: FlowKind,
  counterparty?: typeof MAIN,
): Flow => ({
  id: flowId(`f${(seq += 1)}`),
  accountId: acct,
  occurredOn: isoDate(when),
  amount: Money.fromString(amount),
  kind,
  ...(counterparty ? { counterpartyAccountId: counterparty } : {}),
});

/**
 * A small household with the three cases that matter:
 *
 * - 2020: a mid-year contribution, so the two return methods must disagree.
 * - 2021: a rollover between two tracked accounts, which must vanish entirely.
 * - 2022: only a half-year observed, so the year is partial.
 */
function ledger(): Ledger {
  return {
    household: HOME,
    owners: [{ id: ownerId('o1'), householdId: HOME.id, name: 'Solo' }],
    accounts: [
      account(MAIN, 'Main', 'retirement'),
      account(CLOSED, 'Closed', 'retirement'),
      account(BENCH, 'Index', 'benchmark'),
    ],
    observations: [
      obs(MAIN, '2019-12-31', '1000'),
      obs(MAIN, '2020-06-30', '1100'),
      obs(MAIN, '2020-12-31', '1320'),
      obs(MAIN, '2021-01-01', '1820'),
      obs(MAIN, '2021-12-31', '2002'),
      obs(MAIN, '2022-06-30', '2100'),

      obs(CLOSED, '2019-12-31', '500'),
      obs(CLOSED, '2020-12-31', '500'),
      obs(CLOSED, '2021-01-01', '0'),

      obs(BENCH, '2019-12-31', '100'),
      obs(BENCH, '2020-12-31', '110'),
      obs(BENCH, '2021-12-31', '121'),
      obs(BENCH, '2022-06-30', '126'),
    ],
    flows: [
      // Opening balances arrive from outside the record, exactly as the
      // importer represents them — so the first year shows no phantom growth.
      flow(MAIN, '2019-12-31', '1000', 'transfer_in'),
      flow(CLOSED, '2019-12-31', '500', 'transfer_in'),
      flow(MAIN, '2020-06-30', '100', 'contribution'),
      flow(MAIN, '2021-01-01', '500', 'transfer_in', CLOSED),
      flow(CLOSED, '2021-01-01', '-500', 'transfer_out', MAIN),
    ],
    notes: [{ id: noteId('n1'), householdId: HOME.id, year: 2021, text: 'Rolled it over.' }],
    revision: 7,
  };
}

const history = deriveHistory(ledger());
const yearOf = (year: number) => history.years.find((y) => y.year === year)!;

describe('household series', () => {
  it('separates the benchmark from the accounts holding money', () => {
    const series = householdSeries(ledger());
    expect(series.tracked.map((a) => a.id)).toEqual([MAIN, CLOSED]);
    expect(series.benchmark?.id).toBe(BENCH);
  });

  it('sums accounts at every observed date', () => {
    const series = householdSeries(ledger());
    const at = (when: string) => series.balances.find((b) => b.asOf === when)!.amount.toString();
    expect(at('2019-12-31')).toBe('1500.0000');
    expect(at('2020-06-30')).toBe('1600.0000'); // 1100 + a stale 500
    expect(at('2021-12-31')).toBe('2002.0000'); // the closed account now zero
  });

  it('nets an internal rollover away but keeps money arriving from outside', () => {
    const series = householdSeries(ledger());

    // The 2021 rollover has both halves inside the household, so it vanishes.
    // The opening transfers have no counterparty here — that money genuinely
    // came from outside the record — so they stay.
    expect(series.externalFlows.filter((f) => f.occurredOn === '2021-01-01')).toEqual([]);
    expect(series.externalFlows.map((f) => f.kind).sort()).toEqual([
      'contribution',
      'transfer_in',
      'transfer_in',
    ]);
  });
});

describe('years', () => {
  it('covers every year with activity', () => {
    expect(history.years.map((y) => y.year)).toEqual([2019, 2020, 2021, 2022]);
  });

  it('shows the opening year without crediting it as growth', () => {
    const opening = yearOf(2019);
    expect(opening.startValue.isZero()).toBe(true);
    expect(opening.endValue.toString()).toBe('1500.0000');
    expect(opening.organicGain.isZero()).toBe(true);
    expect(opening.legacyReturn).toBeNull();
  });

  it('separates progress from performance', () => {
    const y = yearOf(2020);
    expect(y.totalGain.toString()).toBe('320.0000'); // 1820 - 1500
    expect(y.organicGain.toString()).toBe('220.0000'); // less the 100 contributed
    expect(y.contributions.toString()).toBe('100.0000');
  });

  it('disagrees with the legacy method when money arrived mid-year', () => {
    const y = yearOf(2020);
    expect(y.legacyReturn).toBeCloseTo(220 / 1500, 9);
    expect(y.twr).toBeCloseTo(0.1375, 9);
    expect(y.twr).toBeLessThan(y.legacyReturn!);
  });

  it('agrees with it through a rollover, because no money entered', () => {
    // Both halves of the transfer are inside the household, so the year has no
    // external flows at all and the two methods must produce the same number.
    const y = yearOf(2021);
    expect(y.contributions.isZero()).toBe(true);
    expect(y.twr).toBeCloseTo(0.1, 9);
    expect(y.legacyReturn).toBeCloseTo(0.1, 9);
  });

  it('distinguishes a gap in the record from a flat year', () => {
    // 2020 and 2021 both have balances; a year with none is a gap, and the
    // value shown for it is simply the last one carried forward.
    const sparse = deriveHistory({
      ...ledger(),
      accounts: [account(MAIN, 'Main', 'retirement')],
      observations: [
        obs(MAIN, '2019-12-31', '1000'),
        obs(MAIN, '2022-12-31', '1200'),
      ],
      flows: [flow(MAIN, '2019-12-31', '1000', 'transfer_in')],
    });

    const gap = sparse.years.find((y) => y.year === 2020)!;
    expect(gap.recorded).toBe(false);
    expect(gap.partial).toBe(false); // a gap is not a year in progress
    expect(gap.endValue.toString()).toBe('1000.0000');

    // 2022 has a balance of its own, but the one before it is three years back.
    // Its 20% is three years of growth, so it is not a 2022 return and must not
    // be averaged as one.
    const after = sparse.years.find((y) => y.year === 2022)!;
    expect(after.recorded).toBe(true);
    expect(after.measurable).toBe(false);
    expect(after.legacyReturn).toBeNull();

    // Nothing here can be measured, so there is no average to report.
    expect(sparse.averageReturn).toBe(0);
  });

  it('reports nothing earned for a first year it could not measure', () => {
    // One closing balance and nothing before it says what the account is worth
    // and nothing about what it did. Without this the whole balance reads as
    // growth.
    const opening = deriveHistory({
      ...ledger(),
      accounts: [account(MAIN, 'Main', 'retirement')],
      observations: [obs(MAIN, '2024-12-31', '100000')],
      flows: [flow(MAIN, '2024-07-01', '6000', 'contribution')],
    });

    const first = opening.years[0]!;
    expect(first.measurable).toBe(false);
    expect(first.legacyReturn).toBeNull();
    expect(opening.lifetimeGain.isZero()).toBe(true);
    expect(opening.averageReturn).toBe(0);
  });

  it('marks a year that is only partly observed', () => {
    const y = yearOf(2022);
    expect(y.recorded).toBe(true);
    expect(y.partial).toBe(true);
    expect(y.endValueAsOf).toBe('2022-06-30');
    expect(y.endValue.toString()).toBe('2100.0000');

    expect(yearOf(2021).partial).toBe(false);
  });

  it('reports the benchmark alongside', () => {
    expect(yearOf(2020).benchmark).toBeCloseTo(0.1, 9);
    expect(yearOf(2021).benchmark).toBeCloseTo(0.1, 9);
  });

  it('attaches notes to their year', () => {
    expect(yearOf(2021).note).toBe('Rolled it over.');
    expect(yearOf(2020).note).toBeNull();
  });
});

describe('totals', () => {
  it('counts only what was actually contributed', () => {
    // The rollover moved money without anyone saving it.
    expect(history.totalContributed.toString()).toBe('100.0000');
  });

  it('adds up what was earned across every year', () => {
    expect(history.lifetimeGain.toString()).toBe('500.0000'); // 220 + 182 + 98
  });

  it('reports the latest value and when it was seen', () => {
    expect(history.currentValue.toString()).toBe('2100.0000');
    expect(history.currentValueAsOf).toBe('2022-06-30');
  });

  it('averages only the years that had capital at risk', () => {
    // 2019 opens the record with a balance transferred in — nothing was at risk
    // and nothing was contributed, so its 0% must not drag the average down.
    const invested = history.years
      .filter((y) => !y.startValue.isZero() || !y.contributions.isZero())
      .map((y) => y.twr);
    expect(invested).toHaveLength(3);
    expect(history.averageReturn).toBeGreaterThan(Math.min(...invested));
    expect(history.averageReturn).toBeLessThan(Math.max(...invested));
    expect(history.averageReturn).toBeGreaterThan(0.04);
  });

  it('carries the revision through', () => {
    expect(history.revision).toBe(7);
  });
});

describe('edge cases', () => {
  it('survives a ledger with nothing in it', () => {
    const empty = deriveHistory({ ...emptySnapshot(HOME), notes: [], revision: 0 });
    expect(empty.years).toEqual([]);
    expect(empty.currentValue.isZero()).toBe(true);
    expect(empty.averageReturn).toBe(0);
  });

  it('omits the benchmark column when none is tracked', () => {
    const base = ledger();
    const withoutBenchmark = deriveHistory({
      ...base,
      accounts: base.accounts.filter((a) => a.kind !== 'benchmark'),
      observations: base.observations.filter((o) => o.accountId !== BENCH),
    });
    expect(withoutBenchmark.averageBenchmark).toBeNull();
    expect(withoutBenchmark.years.every((y) => y.benchmark === null)).toBe(true);
  });

  it('keeps a year that opened at zero but was funded during it', () => {
    // Real capital was at work, just not from the first day, so the year counts.
    const funded = deriveHistory({
      ...ledger(),
      observations: [
        obs(MAIN, '2020-01-01', '0'),
        obs(MAIN, '2020-06-30', '500'),
        obs(MAIN, '2020-12-31', '1100'),
      ],
      flows: [flow(MAIN, '2020-06-30', '500', 'contribution')],
      accounts: [account(MAIN, 'Main', 'retirement')],
    });
    expect(funded.years).toHaveLength(1);
    expect(funded.averageReturn).toBeCloseTo(funded.years[0]!.twr, 12);
    expect(funded.averageReturn).toBeGreaterThan(0);
  });

  it('leaves the legacy return undefined for a year that began at zero', () => {
    const opening = deriveHistory({
      ...ledger(),
      observations: [obs(MAIN, '2020-01-01', '0'), obs(MAIN, '2020-12-31', '500')],
      flows: [flow(MAIN, '2020-06-30', '400', 'contribution')],
      accounts: [account(MAIN, 'Main', 'retirement')],
    });
    expect(opening.years[0]!.legacyReturn).toBeNull();
  });
});

describe('sources', () => {
  it('derives straight from a snapshot, no conversion needed', () => {
    // A Snapshot satisfies Ledger structurally, which is the point.
    const snapshot = { ...emptySnapshot(HOME), ...ledger() };
    expect(deriveHistory(snapshot).years).toHaveLength(4);
  });

  it('derives through a repository', async () => {
    const repo = new InMemoryRepository({ ...emptySnapshot(HOME), ...ledger() });
    const viaRepo = await buildHistory(repo);
    expect(viaRepo.years.map((y) => y.year)).toEqual([2019, 2020, 2021, 2022]);
    expect(viaRepo.currentValue.toString()).toBe('2100.0000');
  });

  it('loads a ledger that matches what it was given', async () => {
    const repo = new InMemoryRepository({ ...emptySnapshot(HOME), ...ledger() });
    const loaded = await loadLedger(repo);
    expect(loaded.accounts).toHaveLength(3);
    expect(loaded.observations).toHaveLength(13);
    expect(loaded.revision).toBe(7);
  });
});
