import { test, expect } from "@playwright/test";
import { launchApp, waitForReady } from "./helpers";

async function evalInRepl(window: import("@playwright/test").Page, expr: string, waitMs = 800): Promise<string> {
  await window.keyboard.type(expr);
  await window.keyboard.press("Enter");
  await window.waitForTimeout(waitMs);
  return window.locator(".xterm-rows").textContent() ?? "";
}

test.describe("Porcelain type help", () => {
  test("Sample.help() outputs type name, summary, and known methods", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    const output = await evalInRepl(window, "Sample.help()");

    expect(output).toContain("Sample");
    expect(output).toContain("play()");
    expect(output).toContain("loop(opts?)");
    expect(output).toContain("onsetSlice(opts?)");
    expect(output).toContain("nmf(opts?)");
    expect(output).toContain("mfcc(opts?)");

    await electronApp.close();
  });

  test("SliceFeature.help() outputs type name and known methods/properties", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    const output = await evalInRepl(window, "SliceFeature.help()");

    expect(output).toContain("SliceFeature");
    expect(output).toContain("slices");
    expect(output).toContain("playSlice(index?)");

    await electronApp.close();
  });

  test("NmfFeature.help() outputs type name and known methods/properties", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    const output = await evalInRepl(window, "NmfFeature.help()");

    expect(output).toContain("NmfFeature");
    expect(output).toContain("components");
    expect(output).toContain("playComponent(index?)");
    expect(output).toContain("sep(opts?)");

    await electronApp.close();
  });

  test("Pattern.help() outputs type name and known methods", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    const output = await evalInRepl(window, "Pattern.help()");

    expect(output).toContain("Pattern");
    expect(output).toContain("play(channel)");
    expect(output).toContain("stop()");

    await electronApp.close();
  });

  test("Evaluating Sample (no call) shows toString() summary", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    const output = await evalInRepl(window, "Sample");

    // toString() on the help object should show the type name and summary
    expect(output).toContain("Sample");

    await electronApp.close();
  });
});
