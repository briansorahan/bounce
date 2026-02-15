import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    launchOptions: {
      executablePath: require('electron'),
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    },
  },
});
