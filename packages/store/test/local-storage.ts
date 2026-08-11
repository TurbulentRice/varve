/**
 * A `localStorage` standing in for the browser's, for tests.
 *
 * This package used to run its suite under jsdom to get one API: the four
 * methods `localSnapshotStore` calls. jsdom is an entire HTML implementation,
 * and it brought in a transitive `undici` that calls a Node built-in absent
 * before Node 22 — so the suite could not run on the Node 20 that `engines`
 * promises. CI on a version matrix is what surfaced that; nothing about the
 * package had changed.
 *
 * A `Map` behind the `Storage` interface is the whole requirement. It also
 * makes the tests faster and the dependency tree smaller, which is the usual
 * result of noticing that a large tool was fetched for a small job.
 *
 * Defined as a *configurable* property deliberately: one test replaces it with
 * a throwing getter to prove the app degrades quietly where storage is blocked,
 * and then restores it.
 */

class MapStorage implements Storage {
  readonly #entries = new Map<string, string>();

  get length(): number {
    return this.#entries.size;
  }

  key(index: number): string | null {
    return [...this.#entries.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.#entries.get(key) ?? null;
  }

  // The DOM coerces both arguments to strings; matching that keeps a test from
  // passing here and failing in a browser.
  setItem(key: string, value: string): void {
    this.#entries.set(String(key), String(value));
  }

  removeItem(key: string): void {
    this.#entries.delete(key);
  }

  clear(): void {
    this.#entries.clear();
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: new MapStorage(),
});
