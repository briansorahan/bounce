import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { launchApp, waitForReady, sendCommand } from "./helpers";

test.describe("Runtime environment persistence", () => {
  test("scope survives a project switch and returns intact", async () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bounce-runtime-persistence-"),
    );
    const electronApp = await launchApp(userDataDir);
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    // Set up scope in default project
    await sendCommand(window, "var x = 42");
    await sendCommand(window, "var cfg = { rate: 44100 }");
    await sendCommand(window, "function double(n) { return n * 2; }");

    // Switch to a different project (triggers save of current scope)
    await sendCommand(window, 'proj.load("other")');

    // Switch back (triggers clear + restore of default scope)
    await sendCommand(window, 'proj.load("default")');

    // Verify values are restored
    await sendCommand(window, "x");
    await expect(window.locator(".xterm-rows")).toContainText("42", { timeout: 5000 });

    await sendCommand(window, "cfg.rate");
    await expect(window.locator(".xterm-rows")).toContainText("44100", { timeout: 5000 });

    await sendCommand(window, "double(5)");
    await expect(window.locator(".xterm-rows")).toContainText("10", { timeout: 5000 });

    await electronApp.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test("restore notice is printed after project switch", async () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bounce-runtime-persistence-"),
    );
    const electronApp = await launchApp(userDataDir);
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "var alpha = 1");
    await sendCommand(window, "var beta = 2");

    await sendCommand(window, 'proj.load("other")');

    await sendCommand(window, 'proj.load("default")');

    await expect(window.locator(".xterm-rows")).toContainText("Restored 2 variables", {
      timeout: 5000,
    });

    await electronApp.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test("stale scope is cleared when switching to a project with no saved scope", async () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bounce-runtime-persistence-"),
    );
    const electronApp = await launchApp(userDataDir);
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    // Define a variable in default project
    await sendCommand(window, "var staleVar = 999");

    // Switch to a fresh project — staleVar should not be present
    await sendCommand(window, 'proj.load("fresh")');

    // env.vars() should not list staleVar
    await sendCommand(window, "env.vars()");
    await expect(window.locator(".xterm-rows")).not.toContainText("staleVar", {
      timeout: 5000,
    });

    await electronApp.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test("scopes are isolated between projects", async () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bounce-runtime-persistence-"),
    );
    const electronApp = await launchApp(userDataDir);
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    // Project A: x = 1
    await sendCommand(window, "var x = 1");
    await sendCommand(window, 'proj.load("projectB")');

    // Project B: x = 2
    await sendCommand(window, "var x = 2");
    await sendCommand(window, 'proj.load("default")');

    // Back in project A — x should be 1
    await sendCommand(window, "x");

    // Use toPass to retry until xterm.js flushes its async render cycle and
    // the evaluation result appears in the DOM. Without this, textContent()
    // can be read before the "1" is painted, leaving "commands: 2" from the
    // project-load display as the last digit match.
    await expect(async () => {
      const terminalText = await window.locator(".xterm-rows").textContent();
      const matches = [...(terminalText ?? "").matchAll(/\b(1|2)\b/g)];
      const lastMatch = matches[matches.length - 1];
      expect(lastMatch?.[0]).toBe("1");
    }).toPass({ timeout: 5000 });

    await electronApp.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });
});
