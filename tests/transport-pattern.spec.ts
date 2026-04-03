import { test, expect } from "./fixtures";

test.describe("Transport and Pattern DSL", () => {
  test("transport.help() shows usage", async ({ window, sendCommand }) => {
    const rows = window.locator(".xterm-rows");

    await sendCommand("transport.help()");

    await expect(rows).toContainText("bpm", { timeout: 5000 });
    await expect(rows).toContainText("start", { timeout: 5000 });
    await expect(rows).toContainText("stop", { timeout: 5000 });
  });

  test("pat.help() shows usage", async ({ window, sendCommand }) => {
    const rows = window.locator(".xterm-rows");

    await sendCommand("pat.help()");

    await expect(rows).toContainText("xox", { timeout: 5000 });
    await expect(rows).toContainText("notation", { timeout: 5000 });
  });

  test("transport.bpm() sets and reads BPM", async ({ window, sendCommand }) => {
    const rows = window.locator(".xterm-rows");

    await sendCommand("transport.bpm(180)");
    await expect(rows).toContainText("180", { timeout: 5000 });

    await sendCommand("transport.bpm()");
    await expect(rows).toContainText("180", { timeout: 5000 });
  });

  test("transport.bpm() rejects invalid values", async ({ window, sendCommand }) => {
    const rows = window.locator(".xterm-rows");

    await sendCommand("transport.bpm(-1)");
    await expect(rows).toContainText(/BPM must be between|[Ee]rror|invalid|out of range/i, {
      timeout: 5000,
    });

    await sendCommand("transport.bpm(401)");
    await expect(rows).toContainText(/BPM must be between|[Ee]rror|invalid|out of range/i, {
      timeout: 5000,
    });
  });

  test("transport start and stop", async ({ window, sendCommand }) => {
    const rows = window.locator(".xterm-rows");

    await sendCommand("transport.bpm(240)");
    await expect(rows).toContainText("240", { timeout: 5000 });

    await sendCommand("transport.start()");
    await expect(rows).toContainText("started", { timeout: 5000 });

    await sendCommand("transport.stop()");
    await expect(rows).toContainText("stopped", { timeout: 5000 });
  });

  test("pat.xox() shows ASCII grid", async ({ window, sendCommand }) => {
    const rows = window.locator(".xterm-rows");

    const notation = "c4 = a . . . a . . . a . . . a . . .";
    await sendCommand(`pat.xox(\`${notation}\`)`);

    await expect(rows).toContainText("Pattern", { timeout: 5000 });
    await expect(rows).toContainText("c4", { timeout: 5000 });
  });

  test("Pattern.help() shows usage", async ({ window, sendCommand }) => {
    const rows = window.locator(".xterm-rows");

    await sendCommand(
      "pat.xox(`c4 = a . . . . . . . . . . . . . . .`).help()",
    );

    await expect(rows).toContainText("play", { timeout: 5000 });
  });

  test("transport tick telemetry fires", async ({ window, sendCommand }) => {
    const rows = window.locator(".xterm-rows");

    // Register a tick counter via the IPC bridge exposed on window.electron
    await window.evaluate(() => {
      (window as any).__tickCount = 0;
      (window as any).electron.onTransportTick(() => {
        (window as any).__tickCount =
          ((window as any).__tickCount || 0) + 1;
      });
    });

    await sendCommand("transport.bpm(240)");
    await expect(rows).toContainText("240", { timeout: 5000 });

    await sendCommand("transport.start()");
    await expect(rows).toContainText("started", { timeout: 5000 });

    // At 240 BPM, 16th-note ticks fire at ~16/s; poll until enough arrive
    await window.waitForFunction(() => {
      return ((window as any).__tickCount ?? 0) > 5;
    }, { timeout: 5000 });

    await sendCommand("transport.stop()");
    await expect(rows).toContainText("stopped", { timeout: 5000 });

    const tickCount = await window.evaluate(
      () => (window as any).__tickCount as number,
    );
    expect(tickCount).toBeGreaterThan(5);
  });
});
