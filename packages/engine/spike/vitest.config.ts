import { defineConfig } from 'vitest/config';

// SPIKE-only config; the package's own vitest.config.ts deliberately does not
// pick these up (`pnpm test` must not run the spike).
export default defineConfig({
  test: { environment: 'node', include: ['*.test.ts'], root: import.meta.dirname },
});
