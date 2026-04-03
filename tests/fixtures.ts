import { test as base, expect, ElectronApplication, Page } from "@playwright/test";
import { _electron as electron } from "@playwright/test";
import electronPath from "electron";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { ELECTRON_MAIN, ELECTRON_ARGS, waitForReady } from "./helpers";

type BounceFixtures = {
  electronApp: ElectronApplication;
  window: Page;
  sendCommand: (command: string) => Promise<void>;
};

export const test = base.extend<BounceFixtures>({
  electronApp: async ({}, use) => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bounce-playwright-fixture-"),
    );

    const electronApp = await electron.launch({
      executablePath: electronPath,
      args: [ELECTRON_MAIN, ...ELECTRON_ARGS],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
        BOUNCE_USER_DATA_PATH: userDataDir,
      },
    });

    await use(electronApp);

    // Teardown: tell the app to kill the audio engine and exit, then close.
    try {
      const win = electronApp.windows()[0];
      if (win) {
        await win.evaluate(() => (window as any).electron.forceShutdown());
      }
    } catch { /* app may already be gone */ }

    const pid = electronApp.process().pid;
    const kill = () => {
      try {
        if (pid) process.kill(pid, "SIGKILL");
      } catch {
        /* already dead */
      }
    };
    const timer = setTimeout(kill, 5000);
    try {
      await electronApp.close();
    } catch {
      /* ignore — force-kill will handle it */
    } finally {
      clearTimeout(timer);
    }

    fs.rmSync(userDataDir, { recursive: true, force: true });
  },

  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await waitForReady(window);
    await use(window);
  },

  sendCommand: async ({ window }, use) => {
    const fn = async (command: string) => {
      await window.evaluate((cmd: string) => {
        const executeCommand = (window as any).__bounceExecuteCommand;
        if (!executeCommand) {
          throw new Error("Execute command function not exposed");
        }
        return executeCommand(cmd);
      }, command);
    };
    await use(fn);
  },
});

export { expect };
