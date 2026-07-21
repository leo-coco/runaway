import { defineConfig, devices } from '@playwright/test';

/**
 * Post-deploy smoke config. Runs `e2e/*.spec.ts` against a live URL:
 *   - CI: the deployed URL from the Vercel `deployment_status` event.
 *   - Local: `SMOKE_BASE_URL=http://localhost:4321 npm run test:e2e` (dev:all).
 * There is no `webServer` here on purpose — the point is to exercise a real
 * deployment, not to boot one. Sign-in uses a pre-provisioned verified user
 * (SMOKE_TEST_EMAIL / SMOKE_TEST_PASSWORD); see docs/testing-strategy.md.
 */
const baseURL = process.env.SMOKE_BASE_URL ?? 'http://localhost:4321';
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    // Authenticated traces retain form values, cookies, and request headers.
    // Keep them disabled for this real-account smoke; the report still contains
    // sanitized runtime diagnostics, screenshots, video, and browser errors.
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...(bypassSecret && {
      extraHTTPHeaders: { 'x-vercel-protection-bypass': bypassSecret },
    }),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
