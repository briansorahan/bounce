import {
  test,
  expect,
  _electron as electron,
  ElectronApplication,
  Page,
} from "@playwright/test";
import path from "path";
import { ELECTRON_MAIN, ELECTRON_ARGS, waitForReady } from "./helpers";

const electronPath = require("electron") as string;

let electronApp: ElectronApplication;
let window: Page;

async function sendCommand(command: string) {
  await window.evaluate((cmd: string) => {
    const executeCommand = (window as unknown as { __bounceExecuteCommand?: (source: string) => Promise<void> }).__bounceExecuteCommand;
    if (!executeCommand) {
      throw new Error("Execute command function not exposed");
    }
    return executeCommand(cmd);
  }, command);
}

test.beforeAll(async () => {
  electronApp = await electron.launch({
    executablePath: electronPath,
    args: [ELECTRON_MAIN, ...ELECTRON_ARGS],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
  });
  window = await electronApp.firstWindow();
  await waitForReady(window);
});

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close();
  }
});

test.describe("Play Component Then Play Full", () => {
  test("should reload full audio after playing component", async () => {
    const testAudioPath = path.join(__dirname, "test-multi-viz.wav");
    const expectedHash = await window.evaluate(async (audioPath) => {
      const audio = await window.electron.readAudioFile(audioPath);
      return audio.hash;
    }, testAudioPath);

    await sendCommand(`const samp = sn.read("${testAudioPath}")`);
    await sendCommand("const feature = samp.nmf({ components: 3 })");
    await window.evaluate(async (hash) => {
      await window.electron.sep([hash]);
    }, expectedHash);
    await sendCommand("feature.playComponent(1)");
    await sendCommand("samp.play()");
    await sendCommand("const current = sn.current()");
    await sendCommand("current?.hash");

    await expect(window.locator(".xterm-rows")).toContainText(expectedHash, {
      timeout: 5000,
    });
  });
});
