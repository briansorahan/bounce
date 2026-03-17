import { test, expect, _electron as electron } from "@playwright/test";
import * as path from "path";

const electronPath = require("electron") as string;

async function launchApp() {
  return electron.launch({
    executablePath: electronPath,
    args: [
      path.join(__dirname, "../dist/electron/main.js"),
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
  });
}

async function sendCommand(window: any, command: string): Promise<void> {
  await window.evaluate((cmd: string) => {
    const executeCommand = (window as any).__bounceExecuteCommand;
    if (!executeCommand) throw new Error("__bounceExecuteCommand not exposed");
    return executeCommand(cmd);
  }, command);
}

test.describe("env namespace runtime introspection", () => {
  test("env.help() shows the runtime introspection namespace description", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, "env.help()");

    await expect(window.locator(".xterm-rows")).toContainText(
      "runtime introspection namespace",
      { timeout: 5000 },
    );

    await electronApp.close();
  });

  test("env.globals() lists known Bounce globals", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, "env.globals()");

    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Bounce Globals", { timeout: 5000 });
    await expect(rows).toContainText("sn", { timeout: 5000 });
    await expect(rows).toContainText("env", { timeout: 5000 });
    await expect(rows).toContainText("proj", { timeout: 5000 });

    await electronApp.close();
  });

  test("env.vars() shows empty message when no user variables are defined", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, "env.vars()");

    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Runtime Variables", { timeout: 5000 });
    await expect(rows).toContainText("No user-defined variables in scope.", {
      timeout: 5000,
    });

    await electronApp.close();
  });

  test("env.vars() lists user-defined variables after they are defined", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, "const answer = 42");
    await sendCommand(window, "env.vars()");

    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("answer", { timeout: 5000 });
    await expect(rows).toContainText("number", { timeout: 5000 });

    await electronApp.close();
  });

  test("env.inspect() shows scope: global for Bounce globals", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, 'env.inspect("sn")');

    await expect(window.locator(".xterm-rows")).toContainText(
      "scope:     global",
      { timeout: 5000 },
    );

    await electronApp.close();
  });

  test("env.inspect() shows scope: user and type for user-defined variables", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, "const myNum = 99");
    await sendCommand(window, 'env.inspect("myNum")');

    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("scope:     user", { timeout: 5000 });
    await expect(rows).toContainText("type:      number", { timeout: 5000 });

    await electronApp.close();
  });

  test("env.functions() lists callable members of a global", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, 'env.functions("sn")');

    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Callable Members", { timeout: 5000 });
    await expect(rows).toContainText("read()", { timeout: 5000 });
    await expect(rows).toContainText("current()", { timeout: 5000 });

    await electronApp.close();
  });

  test("env.functions() with no argument lists user-defined functions", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, "function greet() { return 'hi'; }");
    await sendCommand(window, "env.functions()");

    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("User-Defined Functions", { timeout: 5000 });
    await expect(rows).toContainText("greet()", { timeout: 5000 });

    await electronApp.close();
  });

  test("env.vars.help() describes the vars command", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, "env.vars.help()");

    await expect(window.locator(".xterm-rows")).toContainText(
      "user-defined bindings",
      { timeout: 5000 },
    );

    await electronApp.close();
  });

  test("env.globals.help() describes the globals command", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, "env.globals.help()");

    await expect(window.locator(".xterm-rows")).toContainText(
      "Bounce-provided globals",
      { timeout: 5000 },
    );

    await electronApp.close();
  });

  test("env.inspect.help() describes the inspect command", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, "env.inspect.help()");

    await expect(window.locator(".xterm-rows")).toContainText(
      "Inspect one runtime binding",
      { timeout: 5000 },
    );

    await electronApp.close();
  });

  test("env.functions.help() describes the functions command", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, "env.functions.help()");

    await expect(window.locator(".xterm-rows")).toContainText(
      "callable members",
      { timeout: 5000 },
    );

    await electronApp.close();
  });
});
