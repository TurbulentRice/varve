import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The app's first tests. Routing is a parser and a printer over plain data, so
// it is testable without a DOM — which is the point of keeping it that way.
export default defineConfig({
  resolve: {
    alias: {
      '@varve/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      '@varve/store': fileURLToPath(new URL('../../packages/store/src/index.ts', import.meta.url)),
      '@varve/retirement': fileURLToPath(
        new URL('../../packages/retirement/src/index.ts', import.meta.url),
      ),
    },
  },
});
