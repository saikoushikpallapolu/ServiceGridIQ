import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, retries: 0,
  timeout: 45_000, reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080', browserName: 'chromium',
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    trace: 'off', screenshot: 'only-on-failure', video: 'off',
  },
});
