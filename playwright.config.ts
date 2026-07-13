import { defineConfig, devices } from '@playwright/test';

// E2E harness: runs against the vite dev server — locally it reuses one that's
// already up; in CI it starts its own. Each test gets an isolated browser context —
// and therefore its own IndexedDB — so tests are parallel-safe against one server.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // One retry in CI only: a couple of tests assert inside real timing windows
  // (debounce + Monte Carlo runtimes) that shared runners can stretch.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
