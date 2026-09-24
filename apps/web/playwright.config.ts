import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * The smoke suite runs against a production build, which is where `runtime = 'nodejs'` and
 * the server-only database access have to hold. Port 3200 rather than 3000 so a dev server
 * left running does not get tested by accident, or shadowed by one.
 *
 * The suite has its own database, `data/e2e.db`, rebuilt from `content/` and `scenarios/` with
 * `db:reset --hard` before the server starts. `e2e/flows.spec.ts` creates scenarios and stores
 * runs, and `db:reset` never deletes a user row (ADR-0004), so sharing `data/app.db` would
 * leave the suite's rows in the database you use by hand.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3200);
const baseURL = `http://127.0.0.1:${PORT}`;
/** Playwright runs from `apps/web`, as `pnpm test:e2e` invokes it. */
const DATABASE_URL = resolve(process.cwd(), '..', '..', 'data', 'e2e.db');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm --dir ../.. db:reset --hard && pnpm build && pnpm start --port ${PORT}`,
    env: { DATABASE_URL },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
