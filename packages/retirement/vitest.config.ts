import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@varve/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@varve/store': fileURLToPath(new URL('../store/src/index.ts', import.meta.url)),
    },
  },
});
