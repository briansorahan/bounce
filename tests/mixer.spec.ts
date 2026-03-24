import { test, expect } from "@playwright/test";
import { launchApp, waitForReady, sendCommand } from "./helpers";

test.describe("Mixer REPL namespace", () => {
  test("mx.help() returns mixer help text", async () => {
    const app = await launchApp();
    const window = await app.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "mx.help()");

    await expect(window.locator(".xterm-rows")).toContainText("mx", { timeout: 5000 });
    await expect(window.locator(".xterm-rows")).toContainText("8-channel mixer", { timeout: 3000 });
    await expect(window.locator(".xterm-rows")).toContainText("mx.ch(n)", { timeout: 3000 });
    await expect(window.locator(".xterm-rows")).toContainText("mx.master", { timeout: 3000 });
    await expect(window.locator(".xterm-rows")).toContainText("mx.preview", { timeout: 3000 });

    await app.close();
  });

  test("mx.ch(1) returns channel control with toString", async () => {
    const app = await launchApp();
    const window = await app.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "mx.ch(1)");

    await expect(window.locator(".xterm-rows")).toContainText("ch1", { timeout: 5000 });

    await app.close();
  });

  test("mx.ch(1).gain(-12) shows updated gain", async () => {
    const app = await launchApp();
    const window = await app.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "mx.ch(1).gain(-12)");

    await expect(window.locator(".xterm-rows")).toContainText("-12.0 dB", { timeout: 5000 });

    await app.close();
  });

  test("mx.ch(1).gain() getter returns current gain", async () => {
    const app = await launchApp();
    const window = await app.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "mx.ch(1).gain(-9)");
    await sendCommand(window, "mx.ch(1).gain()");

    await expect(window.locator(".xterm-rows")).toContainText("-9.0 dB", { timeout: 5000 });

    await app.close();
  });

  test("mx.ch(0) returns error for out-of-range channel", async () => {
    const app = await launchApp();
    const window = await app.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "mx.ch(0)");

    await expect(window.locator(".xterm-rows")).toContainText("Channel must be an integer 1", { timeout: 5000 });

    await app.close();
  });

  test("mx.ch(9) returns error for out-of-range channel", async () => {
    const app = await launchApp();
    const window = await app.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "mx.ch(9)");

    await expect(window.locator(".xterm-rows")).toContainText("Channel must be an integer 1", { timeout: 5000 });

    await app.close();
  });

  test("mx.master.gain(-3) shows updated master gain", async () => {
    const app = await launchApp();
    const window = await app.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "mx.master.gain(-3)");

    await expect(window.locator(".xterm-rows")).toContainText("-3.0 dB", { timeout: 5000 });

    await app.close();
  });

  test("mx.master.help() returns master help text", async () => {
    const app = await launchApp();
    const window = await app.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "mx.master.help()");

    await expect(window.locator(".xterm-rows")).toContainText("master bus", { timeout: 5000 });

    await app.close();
  });

  test("mx.preview.gain(-6) shows updated preview gain", async () => {
    const app = await launchApp();
    const window = await app.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "mx.preview.gain(-6)");

    await expect(window.locator(".xterm-rows")).toContainText("-6.0 dB", { timeout: 5000 });

    await app.close();
  });

  test("mx.channels shows all 8 channels plus preview and master", async () => {
    const app = await launchApp();
    const window = await app.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "mx.channels");

    await expect(window.locator(".xterm-rows")).toContainText("Mixer Channels", { timeout: 5000 });
    await expect(window.locator(".xterm-rows")).toContainText("ch1", { timeout: 3000 });
    await expect(window.locator(".xterm-rows")).toContainText("ch8", { timeout: 3000 });
    await expect(window.locator(".xterm-rows")).toContainText("Preview", { timeout: 3000 });
    await expect(window.locator(".xterm-rows")).toContainText("Master", { timeout: 3000 });

    await app.close();
  });

  test("status bar contains mixer-meters canvas", async () => {
    const app = await launchApp();
    const window = await app.firstWindow();
    await waitForReady(window);

    const canvas = window.locator("#mixer-meters");
    await expect(canvas).toBeVisible({ timeout: 5000 });

    const width = await canvas.evaluate((el) => (el as HTMLCanvasElement).width);
    expect(width).toBeGreaterThan(0);

    await app.close();
  });
});
