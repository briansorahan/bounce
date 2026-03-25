import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { launchApp, waitForReady, sendCommand } from "./helpers";

test.describe("Transport and Pattern DSL", () => {
  const testDir = path.join(__dirname, "../test-results/transport-pattern-test");

  test.beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  test("transport.help() shows usage", async () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bounce-transport-help-"),
    );
    const electronApp = await launchApp(userDataDir);
    const window = await electronApp.firstWindow();
    await waitForReady(window);
    const rows = window.locator(".xterm-rows");

    await sendCommand(window, "transport.help()");

    await expect(rows).toContainText("bpm", { timeout: 5000 });
    await expect(rows).toContainText("start", { timeout: 5000 });
    await expect(rows).toContainText("stop", { timeout: 5000 });

    await electronApp.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test("pat.help() shows usage", async () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bounce-pat-help-"),
    );
    const electronApp = await launchApp(userDataDir);
    const window = await electronApp.firstWindow();
    await waitForReady(window);
    const rows = window.locator(".xterm-rows");

    await sendCommand(window, "pat.help()");

    await expect(rows).toContainText("xox", { timeout: 5000 });
    await expect(rows).toContainText("notation", { timeout: 5000 });

    await electronApp.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test("transport.bpm() sets and reads BPM", async () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bounce-transport-bpm-"),
    );
    const electronApp = await launchApp(userDataDir);
    const window = await electronApp.firstWindow();
    await waitForReady(window);
    const rows = window.locator(".xterm-rows");

    await sendCommand(window, "transport.bpm(180)");
    await expect(rows).toContainText("180", { timeout: 5000 });

    await sendCommand(window, "transport.bpm()");
    await expect(rows).toContainText("180", { timeout: 5000 });

    await electronApp.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test("transport.bpm() rejects invalid values", async () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bounce-transport-bpm-invalid-"),
    );
    const electronApp = await launchApp(userDataDir);
    const window = await electronApp.firstWindow();
    await waitForReady(window);
    const rows = window.locator(".xterm-rows");

    await sendCommand(window, "transport.bpm(-1)");
    await expect(rows).toContainText(/[Ee]rror|invalid|out of range/i, {
      timeout: 5000,
    });

    await sendCommand(window, "transport.bpm(401)");
    await expect(rows).toContainText(/[Ee]rror|invalid|out of range/i, {
      timeout: 5000,
    });

    await electronApp.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test("transport start and stop", async () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bounce-transport-startstop-"),
    );
    const electronApp = await launchApp(userDataDir);
    const window = await electronApp.firstWindow();
    await waitForReady(window);
    const rows = window.locator(".xterm-rows");

    await sendCommand(window, "transport.bpm(240)");
    await expect(rows).toContainText("240", { timeout: 5000 });

    await sendCommand(window, "transport.start()");
    await expect(rows).toContainText("started", { timeout: 5000 });

    await window.waitForTimeout(500);

    await sendCommand(window, "transport.stop()");
    await expect(rows).toContainText("stopped", { timeout: 5000 });

    await electronApp.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test("pat.xox() shows ASCII grid", async () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bounce-pat-xox-"),
    );
    const electronApp = await launchApp(userDataDir);
    const window = await electronApp.firstWindow();
    await waitForReady(window);
    const rows = window.locator(".xterm-rows");

    const notation = "c4 = a . . . a . . . a . . . a . . .";
    await sendCommand(window, `pat.xox(\`${notation}\`)`);

    await expect(rows).toContainText("Pattern", { timeout: 5000 });
    await expect(rows).toContainText("c4", { timeout: 5000 });

    await electronApp.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test("Pattern.help() shows usage", async () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bounce-pattern-help-"),
    );
    const electronApp = await launchApp(userDataDir);
    const window = await electronApp.firstWindow();
    await waitForReady(window);
    const rows = window.locator(".xterm-rows");

    await sendCommand(
      window,
      "pat.xox(`c4 = a . . . . . . . . . . . . . . .`).help()",
    );

    await expect(rows).toContainText("play", { timeout: 5000 });

    await electronApp.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test("transport tick telemetry fires", async () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bounce-transport-tick-"),
    );
    const electronApp = await launchApp(userDataDir);
    const window = await electronApp.firstWindow();
    await waitForReady(window);
    const rows = window.locator(".xterm-rows");

    // Register a tick counter via the IPC bridge exposed on window.electron
    await window.evaluate(() => {
      (window as any).__tickCount = 0;
      (window as any).electron.onTransportTick(() => {
        (window as any).__tickCount =
          ((window as any).__tickCount || 0) + 1;
      });
    });

    await sendCommand(window, "transport.bpm(240)");
    await expect(rows).toContainText("240", { timeout: 5000 });

    await sendCommand(window, "transport.start()");
    await expect(rows).toContainText("started", { timeout: 5000 });

    // At 240 BPM, 16th-note ticks fire at ~16/s; wait 1s → expect ~16 ticks
    await window.waitForTimeout(1000);

    await sendCommand(window, "transport.stop()");
    await expect(rows).toContainText("stopped", { timeout: 5000 });

    const tickCount = await window.evaluate(
      () => (window as any).__tickCount as number,
    );
    expect(tickCount).toBeGreaterThan(5);

    await electronApp.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });
});
