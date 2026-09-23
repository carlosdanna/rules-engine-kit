import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  // `server-only` throws on import unless the `react-server` condition picks its empty build.
  // Next applies that condition to server components; Vitest has to be told, and told for the
  // SSR graph specifically, which is where these modules are loaded.
  ssr: { resolve: { conditions: ['react-server'] } },
  test: {
    environment: 'node',
    server: { deps: { inline: ['server-only'] } },
    // `e2e/` is Playwright's, and its specs would fail under Vitest's runner.
    include: ['lib/**/*.test.ts', 'components/**/*.test.ts'],
  },
});
