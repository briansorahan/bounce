import { test, expect } from "./fixtures";

test.describe("Runtime environment persistence", () => {
  test("scope survives a project switch and returns intact", async ({ window, sendCommand }) => {
    // Set up scope in default project
    await sendCommand("var x = 42");
    await sendCommand("var cfg = { rate: 44100 }");
    await sendCommand("function double(n) { return n * 2; }");

    // Switch to a different project (triggers save of current scope)
    await sendCommand('proj.load("other")');

    // Switch back (triggers clear + restore of default scope)
    await sendCommand('proj.load("default")');

    // Verify values are restored
    await sendCommand("x");
    await expect(window.locator(".xterm-rows")).toContainText("42", { timeout: 5000 });

    await sendCommand("cfg.rate");
    await expect(window.locator(".xterm-rows")).toContainText("44100", { timeout: 5000 });

    await sendCommand("double(5)");
    await expect(window.locator(".xterm-rows")).toContainText("10", { timeout: 5000 });
  });

  test("restore notice is printed after project switch", async ({ window, sendCommand }) => {
    await sendCommand("var alpha = 1");
    await sendCommand("var beta = 2");

    await sendCommand('proj.load("other")');

    await sendCommand('proj.load("default")');

    await expect(window.locator(".xterm-rows")).toContainText("Restored 2 variables", {
      timeout: 5000,
    });
  });

  test("stale scope is cleared when switching to a project with no saved scope", async ({ window, sendCommand }) => {
    // Define a variable in default project
    await sendCommand("var staleVar = 999");

    // Switch to a fresh project — staleVar should not be present
    await sendCommand('proj.load("fresh")');

    // env.vars() should not list staleVar
    await sendCommand("env.vars()");
    await expect(window.locator(".xterm-rows")).not.toContainText("staleVar", {
      timeout: 5000,
    });
  });

  test("scopes are isolated between projects", async ({ window, sendCommand }) => {
    // Project A: x = 1
    await sendCommand("var x = 1");
    await sendCommand('proj.load("projectB")');

    // Project B: x = 2
    await sendCommand("var x = 2");
    await sendCommand('proj.load("default")');

    // Back in project A — x should be 1.
    // Use a sentinel string so assertion is stable even when xterm row text is
    // flattened without hard line breaks.
    await sendCommand('"__SCOPE_CHECK__" + (x === 1 ? "YES" : "NO")');
    await expect(window.locator(".xterm-rows")).toContainText("__SCOPE_CHECK__YES", {
      timeout: 5000,
    });
  });
});
