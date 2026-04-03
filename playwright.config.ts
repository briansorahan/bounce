import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  timeout: isCI ? 60000 : 30000,
  // Electron tests are resource-intensive; run sequentially to avoid
  // parallel Electron instances exhausting Docker container resources.
  workers: 1,
  retries: isCI ? 1 : 0,
  expect: {
    timeout: isCI ? 15000 : 5000,
  },
  use: {
    actionTimeout: isCI ? 30000 : 10000,
  },
});
