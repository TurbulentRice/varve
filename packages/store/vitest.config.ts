import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // localStorage needs a DOM; the rest of the package is environment-free.
  test: { environment: 'jsdom' },
  resolve: {
    alias: {
      '@varve/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
});
