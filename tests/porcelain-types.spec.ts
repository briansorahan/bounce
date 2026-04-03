import { test, expect } from "@playwright/test";
import { launchApp, waitForReady, sendCommand } from "./helpers";

test.describe("Porcelain type help", () => {
  test("Sample.help() outputs type name, summary, and known methods", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "Sample.help()");
    const rows = window.locator(".xterm-rows");

    await expect(rows).toContainText("Sample");
    await expect(rows).toContainText("play()");
    await expect(rows).toContainText("loop(opts?)");
    await expect(rows).toContainText("onsetSlice(opts?)");
    await expect(rows).toContainText("nmf(opts?)");
    await expect(rows).toContainText("mfcc(opts?)");

    await electronApp.close();
  });

  test("SliceFeature.help() outputs type name and known methods/properties", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "SliceFeature.help()");
    const rows = window.locator(".xterm-rows");

    await expect(rows).toContainText("SliceFeature");
    await expect(rows).toContainText("slices");
    await expect(rows).toContainText("playSlice(index?)");

    await electronApp.close();
  });

  test("NmfFeature.help() outputs type name and known methods/properties", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "NmfFeature.help()");
    const rows = window.locator(".xterm-rows");

    await expect(rows).toContainText("NmfFeature");
    await expect(rows).toContainText("components");
    await expect(rows).toContainText("playComponent(index?)");
    await expect(rows).toContainText("sep(opts?)");

    await electronApp.close();
  });

  test("Pattern.help() outputs type name and known methods", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "Pattern.help()");
    const rows = window.locator(".xterm-rows");

    await expect(rows).toContainText("Pattern");
    await expect(rows).toContainText("play(channel)");
    await expect(rows).toContainText("stop()");

    await electronApp.close();
  });

  test("Evaluating Sample (no call) shows toString() summary", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "Sample");
    const rows = window.locator(".xterm-rows");

    // Evaluating Sample without calling help() shows the object with its method keys
    await expect(rows).toContainText("play");

    await electronApp.close();
  });
});
