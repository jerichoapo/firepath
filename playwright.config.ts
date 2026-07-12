import { defineConfig, devices } from '@playwright/test';

// Local-only E2E harness (no CI): runs against the vite dev server, reusing one
// that's already up. Each test gets an isolated browser context — and therefore
// its own IndexedDB — so tests are parallel-safe against a single shared server.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
