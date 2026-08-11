import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Money, accountId, householdId, isoDate, observationId } from '@varve/core';
import { InMemoryRepository } from '../src/memory.js';
import {
  PersistingRepository,
  localSnapshotStore,
  memorySnapshotStore,
  type SnapshotStore,
} from '../src/persistence.js';
import { emptySnapshot, type Snapshot } from '../src/snapshot.js';

const HOME = { id: householdId('h'), name: 'Test' };
const A = accountId('a');

const observation = (id: string, amount: string) => ({
  id: observationId(id),
  accountId: A,
  asOf: isoDate('2024-12-31'),
  amount: Money.fromString(amount),
  source: 'manual' as const,
});

function wired(store: SnapshotStore = memorySnapshotStore(), initial?: Snapshot) {
  const inner = new InMemoryRepository(initial ?? emptySnapshot(HOME));
  return { repo: new PersistingRepository(inner, store), store, inner };
}

describe('persisting repository', () => {
  it('writes after a change without being asked', async () => {
    const { repo, store } = wired();
    await repo.saveObservations([observation('o1', '100')]);

    const saved = await store.load();
    expect(saved?.observations).toHaveLength(1);
  });

  it('persists every kind of write', async () => {
    const { repo, store } = wired();

    await repo.saveAccounts([
      { id: A, householdId: HOME.id, name: 'Main', ownerIds: [], kind: 'retirement', active: true },
    ]);
    await repo.saveObservations([observation('o1', '100')]);
    await repo.saveFlows([]);
    await repo.saveNotes([{ id: 'n1' as never, householdId: HOME.id, year: 2024, text: 'hi' }]);

    const saved = await store.load();
    expect(saved?.accounts).toHaveLength(1);
    expect(saved?.notes).toHaveLength(1);
  });

  it('persists deletions too', async () => {
    const { repo, store } = wired();
    await repo.saveObservations([observation('o1', '100')]);
    await repo.deleteObservations([observationId('o1')]);
    expect((await store.load())?.observations).toEqual([]);
  });

  it('leaves reads untouched', async () => {
    const save = vi.fn(async () => {});
    const { repo } = wired({ load: async () => null, save, clear: async () => {} });

    await repo.accounts();
    await repo.observations();
    await repo.revision();

    expect(save).not.toHaveBeenCalled();
  });

  it('does not persist a write the inner repository rejected', async () => {
    const save = vi.fn(async () => {});
    const inner = new InMemoryRepository(emptySnapshot(HOME));
    vi.spyOn(inner, 'saveObservations').mockRejectedValueOnce(new Error('nope'));
    const repo = new PersistingRepository(inner, {
      load: async () => null,
      save,
      clear: async () => {},
    });

    await expect(repo.saveObservations([observation('o1', '100')])).rejects.toThrow('nope');
    expect(save).not.toHaveBeenCalled();
  });

  it('carries the revision through', async () => {
    const { repo } = wired();
    expect(await repo.saveObservations([observation('o1', '1')])).toBe(1);
    expect(await repo.saveObservations([observation('o2', '2')])).toBe(2);
  });

  it('survives a round trip through storage', async () => {
    const store = memorySnapshotStore();
    const first = wired(store).repo;
    await first.saveObservations([observation('o1', '4242.5000')]);

    const restored = new InMemoryRepository((await store.load())!);
    const [only] = await restored.observations();
    expect(only!.amount.toString()).toBe('4242.5000');
  });
});

describe('local storage store', () => {
  beforeEach(() => globalThis.localStorage?.clear());

  it('returns null before anything has been written', async () => {
    expect(await localSnapshotStore('test.empty').load()).toBeNull();
  });

  it('round-trips a ledger through the browser', async () => {
    const store = localSnapshotStore('test.ledger');
    const snapshot: Snapshot = { ...emptySnapshot(HOME), observations: [observation('o1', '99.5')] };

    await store.save(snapshot);
    const loaded = await store.load();

    expect(loaded?.observations[0]!.amount.toString()).toBe('99.5000');
    expect(loaded?.household.name).toBe('Test');
  });

  it('forgets on clear', async () => {
    const store = localSnapshotStore('test.clear');
    await store.save(emptySnapshot(HOME));
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it('degrades quietly where storage is unavailable', async () => {
    // Private browsing and non-DOM runtimes both land here; the app should keep
    // working in memory rather than failing to start.
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });

    const store = localSnapshotStore('test.blocked');
    await expect(store.load()).resolves.toBeNull();
    await expect(store.save(emptySnapshot(HOME))).resolves.toBeUndefined();

    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
});
