import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { launchApp, waitForReady, sendCommand } from "./helpers";

test.describe("Audio Recording", () => {
  test("sn.inputs() lists at least one device", async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-recording-"));
    const electronApp = await launchApp(userDataDir);

    try {
      const window = await electronApp.firstWindow();
      await waitForReady(window);

      await sendCommand(window, "sn.inputs()");

      await expect(window.locator(".xterm-rows")).toContainText("Available audio inputs", {
        timeout: 10000,
      });
      await expect(window.locator(".xterm-rows")).toContainText("[0]", { timeout: 5000 });
    } finally {
      await electronApp.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test("sn.dev(0) returns an AudioDevice", async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-recording-"));
    const electronApp = await launchApp(userDataDir);

    try {
      const window = await electronApp.firstWindow();
      await waitForReady(window);

      await sendCommand(window, "sn.dev(0)");

      await expect(window.locator(".xterm-rows")).toContainText("AudioDevice [0]", {
        timeout: 10000,
      });
    } finally {
      await electronApp.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test("mic.record() returns RecordingHandle, h.stop() returns Sample", async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-recording-"));
    const electronApp = await launchApp(userDataDir);

    try {
      const window = await electronApp.firstWindow();
      await waitForReady(window);

      await sendCommand(window, "const mic = sn.dev(0)");
      await expect(window.locator(".xterm-rows")).toContainText("AudioDevice", { timeout: 5000 });

      await sendCommand(window, 'const h = mic.record("test-take")');
      await expect(window.locator(".xterm-rows")).toContainText("Recording", {
        timeout: 10000,
      });

      await window.waitForTimeout(300); // flaky-ok: MediaRecorder needs time to buffer at least one audio chunk before stop() or decodeAudioData fails on an empty blob
      await sendCommand(window, "h.stop()");

      await expect(window.locator(".xterm-rows")).toContainText("Sample", {
        timeout: 10000,
      });
      await expect(window.locator(".xterm-rows")).toContainText("test-take", {
        timeout: 5000,
      });
    } finally {
      await electronApp.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test("mic.record() with duration auto-stops and returns Sample", async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-recording-"));
    const electronApp = await launchApp(userDataDir);

    try {
      const window = await electronApp.firstWindow();
      await waitForReady(window);

      await sendCommand(window, "const mic = sn.dev(0)");
      await expect(window.locator(".xterm-rows")).toContainText("AudioDevice", { timeout: 5000 });

      // This resolves to Sample after 0.3s
      await sendCommand(window, 'mic.record("timed-take", { duration: 0.3 })');

      await expect(window.locator(".xterm-rows")).toContainText("Sample", {
        timeout: 10000,
      });
      await expect(window.locator(".xterm-rows")).toContainText("timed-take", {
        timeout: 5000,
      });
    } finally {
      await electronApp.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test("sn.read() retrieves a recording by name after it is stored", async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-recording-"));
    const electronApp = await launchApp(userDataDir);

    try {
      const window = await electronApp.firstWindow();
      await waitForReady(window);

      await sendCommand(window, "const mic = sn.dev(0)");
      await expect(window.locator(".xterm-rows")).toContainText("AudioDevice", { timeout: 5000 });
      await sendCommand(window, 'mic.record("retrieval-take", { duration: 0.3 })');
      await expect(window.locator(".xterm-rows")).toContainText("Sample", { timeout: 10000 });

      await sendCommand(window, 'sn.read("retrieval-take")');
      await expect(window.locator(".xterm-rows")).toContainText("retrieval-take", {
        timeout: 5000,
      });
    } finally {
      await electronApp.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test("recording an existing name without overwrite throws an error", async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-recording-"));
    const electronApp = await launchApp(userDataDir);

    try {
      const window = await electronApp.firstWindow();
      await waitForReady(window);

      await sendCommand(window, "const mic = sn.dev(0)");
      await expect(window.locator(".xterm-rows")).toContainText("AudioDevice", { timeout: 5000 });
      await sendCommand(window, 'mic.record("dup-take", { duration: 0.3 })');
      await expect(window.locator(".xterm-rows")).toContainText("Sample", { timeout: 10000 });

      // Second attempt without overwrite should error
      await sendCommand(window, 'mic.record("dup-take")');
      await expect(window.locator(".xterm-rows")).toContainText("already exists", {
        timeout: 5000,
      });
    } finally {
      await electronApp.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test("recording an existing name with overwrite: true succeeds", async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-recording-"));
    const electronApp = await launchApp(userDataDir);

    try {
      const window = await electronApp.firstWindow();
      await waitForReady(window);

      await sendCommand(window, "const mic = sn.dev(0)");
      await expect(window.locator(".xterm-rows")).toContainText("AudioDevice", { timeout: 5000 });
      await sendCommand(window, 'mic.record("overwrite-take", { duration: 0.3 })');
      await expect(window.locator(".xterm-rows")).toContainText("Sample", { timeout: 10000 });

      // Second attempt with overwrite should succeed
      await sendCommand(window, 'mic.record("overwrite-take", { duration: 0.3, overwrite: true })');
      await expect(window.locator(".xterm-rows")).toContainText("Sample", { timeout: 10000 });
    } finally {
      await electronApp.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test("sn.inputs.help() and sn.dev.help() return usage docs", async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-recording-"));
    const electronApp = await launchApp(userDataDir);

    try {
      const window = await electronApp.firstWindow();
      await waitForReady(window);

      await sendCommand(window, "sn.inputs.help()");
      await expect(window.locator(".xterm-rows")).toContainText("sn.inputs()", { timeout: 5000 });
      await expect(window.locator(".xterm-rows")).toContainText("sn.dev", { timeout: 5000 });

      await sendCommand(window, "sn.dev.help()");
      await expect(window.locator(".xterm-rows")).toContainText("sn.dev(index)", { timeout: 5000 });
      await expect(window.locator(".xterm-rows")).toContainText("record(", { timeout: 5000 });
    } finally {
      await electronApp.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
