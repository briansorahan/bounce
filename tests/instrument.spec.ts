import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { launchApp, waitForReady, sendCommand, createTestWavFile } from "./helpers";

const testDir = path.join(__dirname, "../test-results/instrument-test");

test.beforeAll(() => {
  fs.mkdirSync(testDir, { recursive: true });
});

test.describe("Sampler Instrument", () => {
  const testFile = path.join(testDir, "inst-test.wav");

  test.beforeAll(() => {
    createTestWavFile(testFile, 0.5);
  });

  test.afterAll(() => {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  });

  test("inst.help() shows namespace documentation", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "inst.help()");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Create and manage sample-based and synthesizer instruments", { timeout: 5000 });
    await expect(rows).toContainText("inst.sampler", { timeout: 5000 });
    await expect(rows).toContainText("inst.list()", { timeout: 5000 });
    await expect(rows).toContainText("inst.get(name)", { timeout: 5000 });

    await electronApp.close();
  });

  test("create a sampler instrument", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "const keys = inst.sampler({ name: 'keys' })");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Sampler 'keys'", { timeout: 5000 });
    await expect(rows).toContainText("poly 16", { timeout: 5000 });

    await electronApp.close();
  });

  test("create a sampler with custom polyphony", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "const pad = inst.sampler({ name: 'pad', polyphony: 4 })");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Sampler 'pad'", { timeout: 5000 });
    await expect(rows).toContainText("poly 4", { timeout: 5000 });

    await electronApp.close();
  });

  test("load a sample into an instrument", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "const keys = inst.sampler({ name: 'keys' })");
    await sendCommand(window, `const samp = sn.read("${testFile}")`);
    await sendCommand(window, "keys.loadSample(60, samp)");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Loaded sample at note 60", { timeout: 5000 });

    await electronApp.close();
  });

  test("noteOn and noteOff", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "const keys = inst.sampler({ name: 'keys' })");
    await sendCommand(window, `const samp = sn.read("${testFile}")`);
    await sendCommand(window, "keys.loadSample(60, samp)");
    await sendCommand(window, "keys.noteOn(60)");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Note on: 60 (velocity 1)", { timeout: 5000 });

    await sendCommand(window, "keys.noteOff(60)");
    await expect(rows).toContainText("Note off: 60", { timeout: 5000 });

    await electronApp.close();
  });

  test("noteOn with custom velocity", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "const keys = inst.sampler({ name: 'keys' })");
    await sendCommand(window, `const samp = sn.read("${testFile}")`);
    await sendCommand(window, "keys.loadSample(60, samp)");
    await sendCommand(window, "keys.noteOn(60, { velocity: 0.5 })");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Note on: 60 (velocity 0.5)", { timeout: 5000 });

    await electronApp.close();
  });

  test("load a sample with loop option", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "const keys = inst.sampler({ name: 'keys' })");
    await sendCommand(window, `const samp = sn.read("${testFile}")`);
    await sendCommand(window, "keys.loadSample(60, samp, { loop: true })");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Loaded sample at note 60 (loop)", { timeout: 5000 });

    await electronApp.close();
  });

  test("load a sample with loop start/end", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "const keys = inst.sampler({ name: 'keys' })");
    await sendCommand(window, `const samp = sn.read("${testFile}")`);
    await sendCommand(window, "keys.loadSample(60, samp, { loop: true, loopStart: 0.1, loopEnd: 0.4 })");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Loaded sample at note 60 (loop 0.1s", { timeout: 5000 });

    await electronApp.close();
  });

  test("stop all voices", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "const keys = inst.sampler({ name: 'keys' })");
    await sendCommand(window, `const samp = sn.read("${testFile}")`);
    await sendCommand(window, "keys.loadSample(60, samp)");
    await sendCommand(window, "keys.noteOn(60)");
    await sendCommand(window, "keys.stop()");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Stopped all voices on 'keys'", { timeout: 5000 });

    await electronApp.close();
  });

  test("free an instrument", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "const keys = inst.sampler({ name: 'keys' })");
    await sendCommand(window, "keys.free()");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Freed instrument 'keys'", { timeout: 5000 });

    // After free, inst.list() should show no instruments
    await sendCommand(window, "inst.list()");
    await expect(rows).toContainText("No instruments defined", { timeout: 5000 });

    await electronApp.close();
  });

  test("inst.list() shows instruments", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "inst.sampler({ name: 'keys' })");
    await sendCommand(window, "inst.sampler({ name: 'drums' })");
    await sendCommand(window, "inst.list()");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("keys", { timeout: 5000 });
    await expect(rows).toContainText("drums", { timeout: 5000 });
    await expect(rows).toContainText("sampler", { timeout: 5000 });

    await electronApp.close();
  });

  test("inst.get() retrieves an instrument", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "inst.sampler({ name: 'keys' })");
    await sendCommand(window, "const retrieved = inst.get('keys')");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Sampler 'keys'", { timeout: 5000 });

    await electronApp.close();
  });

  test("inst.get() for nonexistent instrument shows error", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "inst.get('nope')");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("not found", { timeout: 5000 });

    await electronApp.close();
  });

  test("instrument .help() shows method documentation", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "const keys = inst.sampler({ name: 'keys' })");
    await sendCommand(window, "keys.help()");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("sampler instrument", { timeout: 5000 });
    await expect(rows).toContainText(".loadSample(note, sample)", { timeout: 5000 });
    await expect(rows).toContainText(".noteOn(note)", { timeout: 5000 });
    await expect(rows).toContainText(".noteOff(note)", { timeout: 5000 });
    await expect(rows).toContainText(".stop()", { timeout: 5000 });
    await expect(rows).toContainText(".free()", { timeout: 5000 });

    await electronApp.close();
  });

  test("loadSample validates note range", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "const keys = inst.sampler({ name: 'keys' })");
    await sendCommand(window, "keys.loadSample(200, { hash: 'abc' })");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("note must be 0", { timeout: 5000 });

    await electronApp.close();
  });

  test("inst.sampler requires a name", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "inst.sampler({})");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("requires", { timeout: 5000 });

    await electronApp.close();
  });

  test("instrument method help()", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "const keys = inst.sampler({ name: 'keys' })");

    await sendCommand(window, "keys.loadSample.help()");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("loadSample(note, sample, options?)", { timeout: 5000 });

    await sendCommand(window, "keys.noteOn.help()");
    await expect(rows).toContainText("noteOn(note, options?)", { timeout: 5000 });

    await electronApp.close();
  });
});
