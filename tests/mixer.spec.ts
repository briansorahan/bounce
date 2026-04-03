import { test, expect } from "./fixtures";

test.describe("Mixer REPL namespace", () => {
  test("mx.help() returns mixer help text", async ({ window, sendCommand }) => {
    await sendCommand("mx.help()");

    await expect(window.locator(".xterm-rows")).toContainText("mx", { timeout: 5000 });
    await expect(window.locator(".xterm-rows")).toContainText("8-channel mixer", { timeout: 3000 });
    await expect(window.locator(".xterm-rows")).toContainText("mx.ch(n)", { timeout: 3000 });
    await expect(window.locator(".xterm-rows")).toContainText("mx.master", { timeout: 3000 });
    await expect(window.locator(".xterm-rows")).toContainText("mx.preview", { timeout: 3000 });
  });

  test("mx.ch(1) returns channel control with toString", async ({ window, sendCommand }) => {
    await sendCommand("mx.ch(1)");

    await expect(window.locator(".xterm-rows")).toContainText("ch1", { timeout: 5000 });
  });

  test("mx.ch(1).gain(-12) shows updated gain", async ({ window, sendCommand }) => {
    await sendCommand("mx.ch(1).gain(-12)");

    await expect(window.locator(".xterm-rows")).toContainText("-12.0 dB", { timeout: 5000 });
  });

  test("mx.ch(1).gain() getter returns current gain", async ({ window, sendCommand }) => {
    await sendCommand("mx.ch(1).gain(-9)");
    await sendCommand("mx.ch(1).gain()");

    await expect(window.locator(".xterm-rows")).toContainText("-9.0 dB", { timeout: 5000 });
  });

  test("mx.ch(1).pan(-0.5) shows updated pan", async ({ window, sendCommand }) => {
    await sendCommand("mx.ch(1).pan(-0.5)");

    // pan(-0.5) → "L50"
    await expect(window.locator(".xterm-rows")).toContainText("L50", { timeout: 5000 });
  });

  test("mx.ch(1).pan() getter returns current pan", async ({ window, sendCommand }) => {
    await sendCommand("mx.ch(1).pan(0.5)");
    await sendCommand("mx.ch(1).pan()");

    await expect(window.locator(".xterm-rows")).toContainText("R50", { timeout: 5000 });
  });

  test("mx.ch(1).pan() rejects out-of-range value", async ({ window, sendCommand }) => {
    await sendCommand("mx.ch(1).pan(2)");

    await expect(window.locator(".xterm-rows")).toContainText("Pan must be between", { timeout: 5000 });
  });

  test("mx.ch(1).mute() toggles mute on", async ({ window, sendCommand }) => {
    await sendCommand("mx.ch(1).mute()");

    await expect(window.locator(".xterm-rows")).toContainText("muted", { timeout: 5000 });
  });

  test("mx.ch(1).mute().mute() toggles mute back off", async ({ window, sendCommand }) => {
    // Mute on then off in a single chain
    await sendCommand("mx.ch(1).mute().mute()");
    await sendCommand("clear()");
    // After two toggles the channel is un-muted; inspect the fresh state
    await sendCommand("mx.ch(1)");

    await expect(window.locator(".xterm-rows")).toContainText("ch1", { timeout: 5000 });
    await expect(window.locator(".xterm-rows")).not.toContainText("muted", { timeout: 3000 });
  });

  test("mx.ch(1).solo() toggles solo on", async ({ window, sendCommand }) => {
    await sendCommand("mx.ch(1).solo()");

    await expect(window.locator(".xterm-rows")).toContainText("solo", { timeout: 5000 });
  });

  test("mx.ch(1).gain(-6).pan(-0.2) chains correctly", async ({ window, sendCommand }) => {
    await sendCommand("mx.ch(1).gain(-6).pan(-0.2)");

    // Final display should reflect the pan setting (L20) since pan() was last
    await expect(window.locator(".xterm-rows")).toContainText("L20", { timeout: 5000 });
  });

  test("mx.ch(1).attach() and detach() update instrument label", async ({ window, sendCommand }) => {
    // Attach by instrument ID string (no actual instrument needed for routing label)
    await sendCommand('mx.ch(1).attach("my-synth")');
    await expect(window.locator(".xterm-rows")).toContainText("my-synth", { timeout: 5000 });

    // Detach clears the label
    await sendCommand("mx.ch(1).detach()");
    await expect(window.locator(".xterm-rows")).toContainText("ch1", { timeout: 3000 });
  });

  test("mx.ch(n).help() returns per-channel help text", async ({ window, sendCommand }) => {
    await sendCommand("mx.ch(3).help()");

    await expect(window.locator(".xterm-rows")).toContainText("mx.ch(3)", { timeout: 5000 });
    await expect(window.locator(".xterm-rows")).toContainText(".gain(db?)", { timeout: 3000 });
    await expect(window.locator(".xterm-rows")).toContainText(".pan(val?)", { timeout: 3000 });
  });

  test("mx.ch(0) returns error for out-of-range channel", async ({ window, sendCommand }) => {
    await sendCommand("mx.ch(0)");

    await expect(window.locator(".xterm-rows")).toContainText("Channel must be an integer 1", { timeout: 5000 });
  });

  test("mx.ch(9) returns error for out-of-range channel", async ({ window, sendCommand }) => {
    await sendCommand("mx.ch(9)");

    await expect(window.locator(".xterm-rows")).toContainText("Channel must be an integer 1", { timeout: 5000 });
  });

  test("mx.master.gain(-3) shows updated master gain", async ({ window, sendCommand }) => {
    await sendCommand("mx.master.gain(-3)");

    await expect(window.locator(".xterm-rows")).toContainText("-3.0 dB", { timeout: 5000 });
  });

  test("mx.master.mute() toggles master mute on", async ({ window, sendCommand }) => {
    await sendCommand("mx.master.mute()");

    await expect(window.locator(".xterm-rows")).toContainText("muted", { timeout: 5000 });
  });

  test("mx.master.help() returns master help text", async ({ window, sendCommand }) => {
    await sendCommand("mx.master.help()");

    await expect(window.locator(".xterm-rows")).toContainText("master bus", { timeout: 5000 });
  });

  test("mx.preview.gain(-6) shows updated preview gain", async ({ window, sendCommand }) => {
    await sendCommand("mx.preview.gain(-6)");

    await expect(window.locator(".xterm-rows")).toContainText("-6.0 dB", { timeout: 5000 });
  });

  test("mx.preview.mute() toggles preview mute on", async ({ window, sendCommand }) => {
    await sendCommand("mx.preview.mute()");

    await expect(window.locator(".xterm-rows")).toContainText("muted", { timeout: 5000 });
  });

  test("mx.preview.help() returns preview help text", async ({ window, sendCommand }) => {
    await sendCommand("mx.preview.help()");

    await expect(window.locator(".xterm-rows")).toContainText("preview channel", { timeout: 5000 });
  });

  test("mx.channels shows all 8 channels plus preview and master", async ({ window, sendCommand }) => {
    await sendCommand("mx.channels");

    await expect(window.locator(".xterm-rows")).toContainText("Mixer Channels", { timeout: 5000 });
    await expect(window.locator(".xterm-rows")).toContainText("ch1", { timeout: 3000 });
    await expect(window.locator(".xterm-rows")).toContainText("ch8", { timeout: 3000 });
    await expect(window.locator(".xterm-rows")).toContainText("Preview", { timeout: 3000 });
    await expect(window.locator(".xterm-rows")).toContainText("Master", { timeout: 3000 });
  });

  test("status bar contains mixer-meters canvas", async ({ window }) => {
    const canvas = window.locator("#mixer-meters");
    await expect(canvas).toBeVisible({ timeout: 5000 });

    const width = await canvas.evaluate((el) => (el as HTMLCanvasElement).width);
    expect(width).toBeGreaterThan(0);
  });
});
