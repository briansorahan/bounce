import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  // Electron tests are resource-intensive; run sequentially to avoid
  // parallel Electron instances exhausting Docker container resources.
  workers: 1,
  expect: {
    timeout: 5000,
  },
  use: {
    actionTimeout: 10000,
  },
});
