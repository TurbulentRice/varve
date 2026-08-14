import { describe, expect, it } from 'vitest';
import { Money, accountId, flowId, isoDate, m, observationId } from '@varve/core';
import { InMemoryRepository, emptySnapshot } from '@varve/store';
import {
  balanceIdFor,
  closingDate,
  contributionIdFor,
  feeIdFor,
  existingYearEntry,
  midYearDate,
  parseAmount,
  planYearEntry,
} from '../src/entry.js';
import { deriveHistory } from '../src/history.js';
import { loadLedger } from '../src/ledger.js';

const A = accountId('a');
const B = accountId('b');
const HOME = { id: 'h' as never, name: 'Test' };

describe('dating', () => {
  it('puts a closing balance on the last day of the year', () => {
    expect(closingDate(2024)).toBe('2024-12-31');
  });

  it('puts an undated annual total mid-year', () => {
    // A statement gives a total with no dates. Filing it in December credits
    // the money with no time invested; January credits it with a full year.
    expect(midYearDate(2024)).toBe('2024-07-01');
  });
});

describe('planning a year', () => {
  const plan = planYearEntry(2024, [
    { accountId: A, balance: m('100000'), contributed: m('6000'), fees: m('120') },
  ]);

  it('records the balance at the year end', () => {
    expect(plan.observations).toHaveLength(1);
    expect(plan.observations[0]!.asOf).toBe('2024-12-31');
    expect(plan.observations[0]!.amount.toString()).toBe('100000.0000');
    expect(plan.observations[0]!.source).toBe('manual');
  });

  it('records the flows mid-year', () => {
    for (const flow of plan.flows) expect(flow.occurredOn).toBe('2024-07-01');
  });

  it('stores a fee as an outflow though it was typed as a cost', () => {
    const fee = plan.flows.find((f) => f.kind === 'fee')!;
    expect(fee.amount.toString()).toBe('-120.0000');
  });

  it('files money taken out as a withdrawal, not a negative contribution', () => {
    const out = planYearEntry(2024, [
      { accountId: A, balance: m('90000'), contributed: m('-4000'), fees: null },
    ]);
    const flow = out.flows.find((f) => f.amount.isNegative())!;
    expect(flow.kind).toBe('withdrawal');
  });

  it('handles several accounts at once', () => {
    const both = planYearEntry(2024, [
      { accountId: A, balance: m('1'), contributed: null, fees: null },
      { accountId: B, balance: m('2'), contributed: null, fees: null },
    ]);
    expect(both.observations.map((o) => o.accountId)).toEqual([A, B]);
  });

  it('plans for the accounts it was given and cannot reach any other', () => {
    // The assumption the in-place account editor rests on (§26.1). This takes a
    // *list*, so it could plausibly have swept the whole year and cleared the
    // accounts it was not told about — which would make correcting one account's
    // 2019 figure silently delete every other account's. Every id it emits,
    // written or removed, names the account it was handed.
    const one = planYearEntry(2024, [
      { accountId: A, balance: m('1'), contributed: null, fees: null },
    ]);

    const touched = new Set<string>([
      ...one.observations.map((o) => o.id as string),
      ...one.flows.map((f) => f.id as string),
      ...(one.removedObservations as readonly string[]),
      ...(one.removedFlows as readonly string[]),
    ]);

    // Compared against the id derivations rather than by substring. The first
    // draft of this test matched `id.includes(B)` with B named 'b', and
    // `flow:a:2024:contribution` contains a 'b' — the test failed on the word
    // "contribution" while the code was right.
    expect(touched).toEqual(
      new Set([balanceIdFor(A, 2024), contributionIdFor(A, 2024), feeIdFor(A, 2024)] as string[]),
    );
    for (const id of [balanceIdFor(B, 2024), contributionIdFor(B, 2024), feeIdFor(B, 2024)]) {
      expect(touched.has(id)).toBe(false);
    }
  });
});

describe('clearing', () => {
  it('removes rather than writing zero when a box is emptied', () => {
    const plan = planYearEntry(2024, [
      { accountId: A, balance: null, contributed: null, fees: null },
    ]);
    expect(plan.observations).toEqual([]);
    expect(plan.flows).toEqual([]);
    expect(plan.removedObservations).toEqual([balanceIdFor(A, 2024)]);
    expect(plan.removedFlows).toHaveLength(2);
  });

  it('treats a typed zero as nothing to record', () => {
    const plan = planYearEntry(2024, [
      { accountId: A, balance: m('5'), contributed: m('0'), fees: m('0') },
    ]);
    expect(plan.flows).toEqual([]);
  });
});

describe('re-saving a year', () => {
  it('replaces rather than duplicating', async () => {
    // The forgiving behaviour for a form someone visits once a year: typing it
    // again is how you fix it.
    const repo = new InMemoryRepository(emptySnapshot(HOME));

    for (const amount of ['100000', '123456']) {
      const plan = planYearEntry(2024, [
        { accountId: A, balance: m(amount), contributed: m('6000'), fees: null },
      ]);
      await repo.saveObservations(plan.observations);
      await repo.saveFlows(plan.flows);
      await repo.deleteObservations(plan.removedObservations);
      await repo.deleteFlows(plan.removedFlows);
    }

    const observations = await repo.observations();
    expect(observations).toHaveLength(1);
    expect(observations[0]!.amount.toString()).toBe('123456.0000');
    expect(await repo.flows()).toHaveLength(1);
  });

  it('round-trips into a history a UI can render', async () => {
    const repo = new InMemoryRepository(emptySnapshot(HOME));
    for (const [year, amount] of [
      [2023, '100000'],
      [2024, '118000'],
    ] as const) {
      const plan = planYearEntry(year, [
        { accountId: A, balance: m(amount), contributed: m('6000'), fees: null },
      ]);
      await repo.saveObservations(plan.observations);
      await repo.saveFlows(plan.flows);
    }
    await repo.saveAccounts([
      { id: A, householdId: HOME.id, name: 'Main', ownerIds: [], kind: 'retirement', active: true },
    ]);

    const history = deriveHistory(await loadLedger(repo));
    const year = history.years.find((y) => y.year === 2024)!;

    expect(year.endValue.toString()).toBe('118000.0000');
    expect(year.contributions.toString()).toBe('6000.0000');
    expect(year.organicGain.toString()).toBe('12000.0000'); // 118k − 100k − 6k
  });
});

describe('reading a year back into a form', () => {
  const plan = planYearEntry(2024, [
    { accountId: A, balance: m('100000'), contributed: m('6000'), fees: m('120') },
  ]);

  it('finds what it wrote', () => {
    const entry = existingYearEntry(A, 2024, plan.observations, plan.flows);
    expect(entry.balance?.toString()).toBe('100000.0000');
    expect(entry.contributed?.toString()).toBe('6000.0000');
    // Shown as the cost that was typed, not the outflow that was stored.
    expect(entry.fees?.toString()).toBe('120.0000');
    expect(entry.editable).toBe(true);
  });

  it('comes back blank for a year with nothing in it', () => {
    const entry = existingYearEntry(A, 2019, plan.observations, plan.flows);
    expect(entry.balance).toBeNull();
    expect(entry.contributed).toBeNull();
    expect(entry.fees).toBeNull();
  });

  it('refuses to offer an imported year for annual editing', () => {
    // A legacy year holds quarterly detail an annual form cannot represent.
    // Showing its December figure in a box invites overwriting four quarters
    // with one number.
    const imported = [
      {
        id: observationId('obs:4:2019:Q4'),
        accountId: A,
        asOf: isoDate('2019-12-31'),
        amount: Money.fromString('50000'),
        source: 'legacy-import' as const,
      },
    ];
    expect(existingYearEntry(A, 2019, imported, []).editable).toBe(false);
  });
});

describe('parsing what someone typed', () => {
  it('accepts the ways people write money', () => {
    expect(parseAmount('1,234.56')?.toString()).toBe('1234.5600');
    expect(parseAmount('$1,234')?.toString()).toBe('1234.0000');
    expect(parseAmount(' 890 ')?.toString()).toBe('890.0000');
    expect(parseAmount('-500')?.toString()).toBe('-500.0000');
  });

  it('treats a blank box as no value rather than zero', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount('-')).toBeNull();
  });

  it('returns null on nonsense instead of throwing at the keystroke', () => {
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('1.2.3')).toBeNull();
  });
});

describe('unused id helpers stay stable', () => {
  it('derives the same id for the same account and year', () => {
    expect(balanceIdFor(A, 2024)).toBe(balanceIdFor(A, 2024));
    expect(balanceIdFor(A, 2024)).not.toBe(balanceIdFor(B, 2024));
    expect(flowId('x')).toBe('x');
  });
});
