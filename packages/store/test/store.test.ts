import { describe, expect, it } from 'vitest';
import {
  Money,
  accountId,
  flowId,
  householdId,
  isoDate,
  observationId,
  ownerId,
  type Account,
  type BalanceObservation,
  type Flow,
  type Household,
} from '@varve/core';
import { InMemoryRepository } from '../src/memory.js';
import {
  SNAPSHOT_SCHEMA_VERSION,
  SnapshotFormatError,
  decodeSnapshot,
  emptySnapshot,
  encodeSnapshot,
  type Snapshot,
} from '../src/snapshot.js';

const HOME: Household = { id: householdId('h1'), name: 'Test' };
const A = accountId('a');
const B = accountId('b');

const account = (id: typeof A, name: string): Account => ({
  id,
  householdId: HOME.id,
  name,
  ownerIds: [ownerId('o1')],
  kind: 'retirement',
  active: true,
});

const observation = (id: string, when: string, amount: string, acct = A): BalanceObservation => ({
  id: observationId(id),
  accountId: acct,
  asOf: isoDate(when),
  amount: Money.fromString(amount),
  source: 'manual',
});

const flow = (id: string, when: string, amount: string, acct = A): Flow => ({
  id: flowId(id),
  accountId: acct,
  occurredOn: isoDate(when),
  amount: Money.fromString(amount),
  kind: 'contribution',
});

function sample(): Snapshot {
  return {
    ...emptySnapshot(HOME),
    revision: 3,
    accounts: [account(A, 'First'), account(B, 'Second')],
    observations: [
      observation('o1', '2020-03-31', '1000'),
      observation('o2', '2020-06-30', '1100'),
      observation('o3', '2020-06-30', '500', B),
    ],
    flows: [flow('f1', '2020-05-15', '100'), flow('f2', '2020-08-15', '200', B)],
  };
}

describe('snapshot format', () => {
  it('round-trips exactly', () => {
    const original = sample();
    const revived = decodeSnapshot(encodeSnapshot(original));

    expect(revived.revision).toBe(original.revision);
    expect(revived.accounts).toEqual(original.accounts);
    expect(revived.observations[0]!.amount.equals(original.observations[0]!.amount)).toBe(true);
  });

  it('keeps money as strings, never as JSON numbers', () => {
    const raw = JSON.parse(encodeSnapshot(sample()));
    for (const o of raw.observations) expect(typeof o.amount).toBe('string');
    for (const f of raw.flows) expect(typeof f.amount).toBe('string');
  });

  it('refuses a document whose amounts arrived as numbers', () => {
    // A float has already lost precision by the time it is parsed, so this has
    // to fail loudly rather than be quietly coerced.
    const raw = JSON.parse(encodeSnapshot(sample()));
    raw.observations[0].amount = 43821.3468;
    expect(() => decodeSnapshot(JSON.stringify(raw))).toThrow(/must be strings/);
  });

  it('refuses a document with no schema version', () => {
    const raw = JSON.parse(encodeSnapshot(sample()));
    delete raw.schemaVersion;
    expect(() => decodeSnapshot(JSON.stringify(raw))).toThrow(SnapshotFormatError);
  });

  it('refuses a document from a newer build', () => {
    const raw = JSON.parse(encodeSnapshot(sample()));
    raw.schemaVersion = SNAPSHOT_SCHEMA_VERSION + 1;
    expect(() => decodeSnapshot(JSON.stringify(raw))).toThrow(/Upgrade before opening/);
  });

  it('refuses malformed input rather than half-loading it', () => {
    expect(() => decodeSnapshot('not json')).toThrow(SnapshotFormatError);
    expect(() => decodeSnapshot('[]')).toThrow(SnapshotFormatError);
    expect(() => decodeSnapshot('{"schemaVersion":1}')).toThrow(/household/);
  });

  it('omits absent optional fields instead of writing nulls', () => {
    const raw = JSON.parse(encodeSnapshot(sample()));
    expect('counterpartyAccountId' in raw.flows[0]).toBe(false);
    expect('note' in raw.flows[0]).toBe(false);
  });

  it('starts an empty ledger at revision zero', () => {
    expect(emptySnapshot(HOME).revision).toBe(0);
    expect(emptySnapshot(HOME).schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
  });
});

describe('in-memory repository', () => {
  it('reads back what it was constructed with', async () => {
    const repo = new InMemoryRepository(sample());
    expect(await repo.accounts()).toHaveLength(2);
    expect(await repo.observations()).toHaveLength(3);
    expect(await repo.revision()).toBe(3);
  });

  it('filters observations by account and window', async () => {
    const repo = new InMemoryRepository(sample());
    expect(await repo.observations({ accountId: A })).toHaveLength(2);
    expect(await repo.observations({ from: isoDate('2020-04-01') })).toHaveLength(2);
    expect(await repo.observations({ to: isoDate('2020-04-01') })).toHaveLength(1);
    expect(
      await repo.observations({ accountId: A, from: isoDate('2020-04-01') }),
    ).toHaveLength(1);
  });

  it('filters flows by kind', async () => {
    const repo = new InMemoryRepository(sample());
    expect(await repo.flows({ kinds: ['contribution'] })).toHaveLength(2);
    expect(await repo.flows({ kinds: ['fee'] })).toHaveLength(0);
  });

  it('returns observations in date order regardless of input order', async () => {
    const scrambled: Snapshot = {
      ...sample(),
      observations: [
        observation('o2', '2020-06-30', '1100'),
        observation('o1', '2020-03-31', '1000'),
      ],
    };
    const dates = (await new InMemoryRepository(scrambled).observations()).map((o) => o.asOf);
    expect(dates).toEqual(['2020-03-31', '2020-06-30']);
  });

  it('bumps the revision on every write', async () => {
    const repo = new InMemoryRepository(sample());
    expect(await repo.saveObservations([observation('o4', '2020-09-30', '1200')])).toBe(4);
    expect(await repo.saveFlows([flow('f3', '2020-09-15', '50')])).toBe(5);
    expect(await repo.revision()).toBe(5);
  });

  it('replaces by id rather than duplicating', async () => {
    const repo = new InMemoryRepository(sample());
    await repo.saveObservations([observation('o1', '2020-03-31', '9999')]);

    const all = await repo.observations({ accountId: A });
    expect(all).toHaveLength(2);
    expect(all.find((o) => o.id === 'o1')!.amount.toString()).toBe('9999.0000');
  });

  it('deletes by id', async () => {
    const repo = new InMemoryRepository(sample());
    await repo.deleteObservations([observationId('o1')]);
    expect(await repo.observations()).toHaveLength(2);
  });

  it('exports what can be re-imported', async () => {
    const repo = new InMemoryRepository(sample());
    await repo.saveObservations([observation('o9', '2021-01-01', '4242')]);

    const exported = await repo.export();
    const restored = new InMemoryRepository(decodeSnapshot(encodeSnapshot(exported)));

    expect(await restored.revision()).toBe(await repo.revision());
    expect((await restored.observations()).map((o) => o.id)).toEqual(
      (await repo.observations()).map((o) => o.id),
    );
  });

  it('does not alias the snapshot it was given', async () => {
    const original = sample();
    const repo = new InMemoryRepository(original);
    await repo.saveObservations([observation('o5', '2020-12-31', '1')]);
    expect(original.observations).toHaveLength(3);
  });

  it('replaces wholesale, as a sync pulling remote state would', async () => {
    const repo = new InMemoryRepository(sample());
    await repo.replace({ ...emptySnapshot(HOME), revision: 42 });
    expect(await repo.observations()).toHaveLength(0);
    expect(await repo.revision()).toBe(42);
  });
});
