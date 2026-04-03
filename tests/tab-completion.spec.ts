import { test, expect } from "@playwright/test";
import { launchApp, waitForReady } from "./helpers";

test.describe("Tab completion", () => {
  test("ghost text appears inline for a single-match partial method name", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    // Type a partial method name that has exactly one match: sn.read
    await window.keyboard.type("sn.rea");

    // The inline ghost text suffix "d()" should be visible in the terminal row
    // toContainText polls automatically, no explicit delay needed
    await expect(window.locator(".xterm-rows")).toContainText("d()", {
      timeout: 5000,
    });

    await electronApp.close();
  });

  test("Tab accepts a single-match completion and updates the input buffer", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await window.keyboard.type("sn.rea");
    await expect(window.locator(".xterm-rows")).toContainText("d()", { timeout: 5000 });

    await window.keyboard.press("Tab");

    // After acceptance the prompt should show the completed text
    await expect(window.locator(".xterm-rows")).toContainText("sn.read()", {
      timeout: 5000,
    });

    await electronApp.close();
  });

  test("Tab on a multi-match prefix shows a completion list", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    // "sn." matches multiple methods — wait for ghost text to appear before Tab
    await window.keyboard.type("sn.");
    await expect(window.locator(".xterm-rows")).toContainText("read()", { timeout: 5000 });

    await window.keyboard.press("Tab");

    // At least two method names should be visible in the ghost-text list
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("read()", { timeout: 5000 });
    await expect(rows).toContainText("list()", { timeout: 5000 });

    await electronApp.close();
  });

  test("pressing Tab repeatedly cycles through multi-match candidates", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await window.keyboard.type("sn.");
    await expect(window.locator(".xterm-rows")).toContainText("read()", { timeout: 5000 });

    // First Tab shows the list with the first candidate selected
    await window.keyboard.press("Tab");
    // Wait for the completion list to appear
    await expect(window.locator(".xterm-rows")).toContainText("read()");

    const rowsAfterFirst = await window.locator(".xterm-rows").textContent();

    // Second Tab cycles to the next candidate — wait until the text changes
    await window.keyboard.press("Tab");
    await window.waitForFunction(
      (prevText: string | null) => {
        const el = document.querySelector(".xterm-rows");
        return el && el.textContent !== prevText;
      },
      rowsAfterFirst,
    );

    const rowsAfterSecond = await window.locator(".xterm-rows").textContent();

    // The selection indicator should have moved (the two states are different)
    expect(rowsAfterFirst).not.toEqual(rowsAfterSecond);

    await electronApp.close();
  });

  test("ghost text disappears after submitting a command", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    // Type partial input to trigger ghost text
    await window.keyboard.type("sn.rea");
    await expect(window.locator(".xterm-rows")).toContainText("d()", { timeout: 5000 });

    // Accept the completion
    await window.keyboard.press("Tab");
    await expect(window.locator(".xterm-rows")).toContainText("sn.read()", { timeout: 5000 });

    // Submit the completed command
    await window.keyboard.press("Enter");

    // After submission the prompt line is new; the ghost text rows should be gone
    await expect(window.locator(".xterm-rows")).not.toContainText("> read()", {
      timeout: 5000,
    });

    await electronApp.close();
  });
});
