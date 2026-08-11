import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Resolve workspace packages to source so the app rebuilds on a domain change
// without a separate build step in between.
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
  server: { port: 5173 },
});
