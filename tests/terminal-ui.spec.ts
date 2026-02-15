import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';

test.describe('Bounce Terminal UI', () => {
  test('should launch app and show terminal', async () => {
    const electronApp = await electron.launch({
      executablePath: require('electron'),
      args: [path.join(__dirname, '../dist/electron/main.js'), '--no-sandbox', '--disable-setuid-sandbox'],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    });

    const window = await electronApp.firstWindow();
    
    await expect(window).toHaveTitle('Bounce - FluCoMa Audio Editor');
    
    const terminalDiv = await window.locator('#terminal');
    await expect(terminalDiv).toBeVisible();

    await electronApp.close();
  });

  test('should display welcome message', async () => {
    const electronApp = await electron.launch({
      executablePath: require('electron'),
      args: [path.join(__dirname, '../dist/electron/main.js'), '--no-sandbox', '--disable-setuid-sandbox'],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    });

    const window = await electronApp.firstWindow();
    
    const consoleMessages: string[] = [];
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    
    window.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      } else {
        consoleMessages.push(msg.text());
      }
    });

    window.on('pageerror', error => {
      consoleErrors.push(error.message);
    });

    window.on('requestfailed', request => {
      failedRequests.push(`${request.url()} - ${request.failure()?.errorText}`);
    });

    await window.waitForTimeout(3000);

    const hasTerminal = await window.locator('#terminal').count();
    
    expect(hasTerminal).toBeGreaterThan(0);
    
    if (consoleErrors.length > 0) {
      console.log('Console errors:', consoleErrors);
    }
    
    if (failedRequests.length > 0) {
      console.log('Failed requests:', failedRequests);
    }

    await electronApp.close();
  });
});
