import { defineConfig, devices } from '@playwright/test';

/**
 * The smoke suite runs against a production build, which is where `runtime = 'nodejs'` and
 * the server-only database access have to hold. Port 3200 rather than 3000 so a dev server
 * left running does not get tested by accident, or shadowed by one.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3200);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
