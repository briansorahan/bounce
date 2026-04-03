import { test, expect } from "./fixtures";

test.describe("env namespace runtime introspection", () => {
  test("env.help() shows the runtime introspection namespace description", async ({ window, sendCommand }) => {
    await sendCommand("env.help()");

    await expect(window.locator(".xterm-rows")).toContainText(
      "Runtime introspection",
      { timeout: 5000 },
    );
  });

  test("env.globals() lists known Bounce globals", async ({ window, sendCommand }) => {
    await sendCommand("env.globals()");

    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Bounce Globals", { timeout: 5000 });
    await expect(rows).toContainText("sn", { timeout: 5000 });
    await expect(rows).toContainText("env", { timeout: 5000 });
    await expect(rows).toContainText("proj", { timeout: 5000 });
  });

  test("env.vars() shows empty message when no user variables are defined", async ({ window, sendCommand }) => {
    await sendCommand("env.vars()");

    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Runtime Variables", { timeout: 5000 });
    await expect(rows).toContainText("No user-defined variables in scope.", {
      timeout: 5000,
    });
  });

  test("env.vars() lists user-defined variables after they are defined", async ({ window, sendCommand }) => {
    await sendCommand("const answer = 42");
    await sendCommand("env.vars()");

    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("answer", { timeout: 5000 });
    await expect(rows).toContainText("number", { timeout: 5000 });
  });

  test("env.inspect() shows scope: global for Bounce globals", async ({ window, sendCommand }) => {
    await sendCommand('env.inspect("sn")');

    await expect(window.locator(".xterm-rows")).toContainText(
      "scope:     global",
      { timeout: 5000 },
    );
  });

  test("env.inspect() shows scope: user and type for user-defined variables", async ({ window, sendCommand }) => {
    await sendCommand("const myNum = 99");
    await sendCommand('env.inspect("myNum")');

    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("scope:     user", { timeout: 5000 });
    await expect(rows).toContainText("type:      number", { timeout: 5000 });
  });

  test("env.functions() lists callable members of a global", async ({ window, sendCommand }) => {
    await sendCommand('env.functions("sn")');

    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Callable Members", { timeout: 5000 });
    await expect(rows).toContainText("read()", { timeout: 5000 });
    await expect(rows).toContainText("current()", { timeout: 5000 });
  });

  test("env.functions() with no argument lists user-defined functions", async ({ window, sendCommand }) => {
    await sendCommand("function greet() { return 'hi'; }");
    await sendCommand("env.functions()");

    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("User-Defined Functions", { timeout: 5000 });
    await expect(rows).toContainText("greet()", { timeout: 5000 });
  });

  test("env.vars.help() describes the vars command", async ({ window, sendCommand }) => {
    await sendCommand("env.vars.help()");

    await expect(window.locator(".xterm-rows")).toContainText(
      "user-defined bindings",
      { timeout: 5000 },
    );
  });

  test("env.globals.help() describes the globals command", async ({ window, sendCommand }) => {
    await sendCommand("env.globals.help()");

    await expect(window.locator(".xterm-rows")).toContainText(
      "Bounce-provided globals",
      { timeout: 5000 },
    );
  });

  test("env.inspect.help() describes the inspect command", async ({ window, sendCommand }) => {
    await sendCommand("env.inspect.help()");

    await expect(window.locator(".xterm-rows")).toContainText(
      "Inspect one runtime binding",
      { timeout: 5000 },
    );
  });

  test("env.functions.help() describes the functions command", async ({ window, sendCommand }) => {
    await sendCommand("env.functions.help()");

    await expect(window.locator(".xterm-rows")).toContainText(
      "callable members",
      { timeout: 5000 },
    );
  });
});
