import { test, expect } from "./fixtures";

test.describe("Porcelain type help", () => {
  test("Sample.help() outputs type name, summary, and known methods", async ({ window, sendCommand }) => {
    await sendCommand("Sample.help()");
    const rows = window.locator(".xterm-rows");

    await expect(rows).toContainText("Sample");
    await expect(rows).toContainText("play()");
    await expect(rows).toContainText("loop(opts?)");
    await expect(rows).toContainText("onsetSlice(opts?)");
    await expect(rows).toContainText("nmf(opts?)");
    await expect(rows).toContainText("mfcc(opts?)");
  });

  test("SliceFeature.help() outputs type name and known methods/properties", async ({ window, sendCommand }) => {
    await sendCommand("SliceFeature.help()");
    const rows = window.locator(".xterm-rows");

    await expect(rows).toContainText("SliceFeature");
    await expect(rows).toContainText("slices");
    await expect(rows).toContainText("playSlice(index?)");
  });

  test("NmfFeature.help() outputs type name and known methods/properties", async ({ window, sendCommand }) => {
    await sendCommand("NmfFeature.help()");
    const rows = window.locator(".xterm-rows");

    await expect(rows).toContainText("NmfFeature");
    await expect(rows).toContainText("components");
    await expect(rows).toContainText("playComponent(index?)");
    await expect(rows).toContainText("sep(opts?)");
  });

  test("Pattern.help() outputs type name and known methods", async ({ window, sendCommand }) => {
    await sendCommand("Pattern.help()");
    const rows = window.locator(".xterm-rows");

    await expect(rows).toContainText("Pattern");
    await expect(rows).toContainText("play(channel)");
    await expect(rows).toContainText("stop()");
  });

  test("Evaluating Sample (no call) shows toString() summary", async ({ window, sendCommand }) => {
    await sendCommand("Sample");
    const rows = window.locator(".xterm-rows");

    // Evaluating Sample without calling help() shows the object with its method keys
    await expect(rows).toContainText("play");
  });
});
