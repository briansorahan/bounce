import { test, expect } from "./fixtures";
import * as path from "path";
import * as fs from "fs";
import { createTestWavFile } from "./helpers";

test.describe("sn.list()", () => {
  const testDir = path.join(__dirname, "../test-results/list-samples-test");

  test.beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  test("sn.list() on empty database shows no-samples message", async ({ window, sendCommand }) => {
    await sendCommand("sn.list()");

    await expect(window.locator(".xterm-rows")).toContainText(
      "No samples in database",
      { timeout: 5000 },
    );
  });

  test("sn.list() after sn.read() shows the loaded sample", async ({ window, sendCommand }) => {
    const testFile = path.join(testDir, "list-test.wav");
    createTestWavFile(testFile);

    await sendCommand(`sn.read("${testFile}")`);
    await expect(window.locator(".xterm-rows")).toContainText("Loaded:", {
      timeout: 5000,
    });

    await sendCommand("sn.list()");

    await expect(window.locator(".xterm-rows")).toContainText("Stored Samples:", {
      timeout: 5000,
    });
    await expect(window.locator(".xterm-rows")).toContainText("list-test.wav", {
      timeout: 5000,
    });
    await expect(window.locator(".xterm-rows")).toContainText("Total: 1 sample(s)", {
      timeout: 5000,
    });

    fs.unlinkSync(testFile);
  });
});
