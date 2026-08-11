import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The only browser API this package touches is localStorage, so it gets a
  // Map-backed stand-in rather than a whole HTML implementation. jsdom used to
  // provide it, and dragged in an undici that cannot load on Node 20.
  test: { setupFiles: ['./test/local-storage.ts'] },
  resolve: {
    alias: {
      '@varve/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
});
