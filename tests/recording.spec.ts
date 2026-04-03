import { test, expect } from "./fixtures";

test.describe("Audio Recording", () => {
  test("sn.inputs() lists at least one device", async ({ window, sendCommand }) => {
    await sendCommand("sn.inputs()");

    await expect(window.locator(".xterm-rows")).toContainText("Available audio inputs", {
      timeout: 10000,
    });
    await expect(window.locator(".xterm-rows")).toContainText("[0]", { timeout: 5000 });
  });

  test("sn.dev(0) returns an AudioDevice", async ({ window, sendCommand }) => {
    await sendCommand("sn.dev(0)");

    await expect(window.locator(".xterm-rows")).toContainText("AudioDevice [0]", {
      timeout: 10000,
    });
  });

  test("mic.record() returns RecordingHandle, h.stop() returns Sample", async ({ window, sendCommand }) => {
    await sendCommand("const mic = sn.dev(0)");
    await expect(window.locator(".xterm-rows")).toContainText("AudioDevice", { timeout: 5000 });

    await sendCommand('const h = mic.record("test-take")');
    await expect(window.locator(".xterm-rows")).toContainText("Recording", {
      timeout: 10000,
    });

    await window.waitForTimeout(process.env.CI ? 1000 : 300); // flaky-ok: MediaRecorder needs time to buffer at least one audio chunk before stop() or decodeAudioData fails on an empty blob
    await sendCommand("h.stop()");

    await expect(window.locator(".xterm-rows")).toContainText("Sample", {
      timeout: 10000,
    });
    await expect(window.locator(".xterm-rows")).toContainText("test-take", {
      timeout: 5000,
    });
  });

  test("mic.record() with duration auto-stops and returns Sample", async ({ window, sendCommand }) => {
    await sendCommand("const mic = sn.dev(0)");
    await expect(window.locator(".xterm-rows")).toContainText("AudioDevice", { timeout: 5000 });

    // This resolves to Sample after 0.3s
    await sendCommand('mic.record("timed-take", { duration: 0.3 })');

    await expect(window.locator(".xterm-rows")).toContainText("Sample", {
      timeout: 10000,
    });
    await expect(window.locator(".xterm-rows")).toContainText("timed-take", {
      timeout: 5000,
    });
  });

  test("sn.read() retrieves a recording by name after it is stored", async ({ window, sendCommand }) => {
    await sendCommand("const mic = sn.dev(0)");
    await expect(window.locator(".xterm-rows")).toContainText("AudioDevice", { timeout: 5000 });
    await sendCommand('mic.record("retrieval-take", { duration: 0.3 })');
    await expect(window.locator(".xterm-rows")).toContainText("Sample", { timeout: 10000 });

    await sendCommand('sn.read("retrieval-take")');
    await expect(window.locator(".xterm-rows")).toContainText("retrieval-take", {
      timeout: 5000,
    });
  });

  test("recording an existing name without overwrite throws an error", async ({ window, sendCommand }) => {
    await sendCommand("const mic = sn.dev(0)");
    await expect(window.locator(".xterm-rows")).toContainText("AudioDevice", { timeout: 5000 });
    await sendCommand('mic.record("dup-take", { duration: 0.3 })');
    await expect(window.locator(".xterm-rows")).toContainText("Sample", { timeout: 10000 });

    // Second attempt without overwrite should error
    await sendCommand('mic.record("dup-take")');
    await expect(window.locator(".xterm-rows")).toContainText("already exists", {
      timeout: 5000,
    });
  });

  test("recording an existing name with overwrite: true succeeds", async ({ window, sendCommand }) => {
    await sendCommand("const mic = sn.dev(0)");
    await expect(window.locator(".xterm-rows")).toContainText("AudioDevice", { timeout: 5000 });
    await sendCommand('mic.record("overwrite-take", { duration: 0.3 })');
    await expect(window.locator(".xterm-rows")).toContainText("Sample", { timeout: 10000 });

    // Second attempt with overwrite should succeed
    await sendCommand('mic.record("overwrite-take", { duration: 0.3, overwrite: true })');
    await expect(window.locator(".xterm-rows")).toContainText("Sample", { timeout: 10000 });
  });

  test("sn.inputs.help() and sn.dev.help() return usage docs", async ({ window, sendCommand }) => {
    await sendCommand("sn.inputs.help()");
    await expect(window.locator(".xterm-rows")).toContainText("sn.inputs()", { timeout: 5000 });
    await expect(window.locator(".xterm-rows")).toContainText("sn.dev", { timeout: 5000 });

    await sendCommand("sn.dev.help()");
    await expect(window.locator(".xterm-rows")).toContainText("sn.dev(index)", { timeout: 5000 });
    await expect(window.locator(".xterm-rows")).toContainText("record(", { timeout: 5000 });
  });
});
