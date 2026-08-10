import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Resolve the core package to its source so the importer and its reconciliation
// tests can be iterated on without a build step in between.
export default defineConfig({
  resolve: {
    alias: {
      '@cairn/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
});
