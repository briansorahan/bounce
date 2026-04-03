import { test, expect } from "./fixtures";
import * as path from "path";
import * as fs from "fs";
import { createTestWavFile } from "./helpers";

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

  test("inst.help() shows namespace documentation", async ({ sendCommand, window }) => {
    await sendCommand("inst.help()");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Create and manage sample-based and synthesizer instruments", { timeout: 5000 });
    await expect(rows).toContainText("inst.sampler", { timeout: 5000 });
    await expect(rows).toContainText("inst.list()", { timeout: 5000 });
    await expect(rows).toContainText("inst.get(name)", { timeout: 5000 });
  });

  test("create a sampler instrument", async ({ sendCommand, window }) => {
    await sendCommand("const keys = inst.sampler({ name: 'keys' })");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Sampler 'keys'", { timeout: 5000 });
    await expect(rows).toContainText("poly 16", { timeout: 5000 });
  });

  test("create a sampler with custom polyphony", async ({ sendCommand, window }) => {
    await sendCommand("const pad = inst.sampler({ name: 'pad', polyphony: 4 })");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Sampler 'pad'", { timeout: 5000 });
    await expect(rows).toContainText("poly 4", { timeout: 5000 });
  });

  test("load a sample into an instrument", async ({ sendCommand, window }) => {
    await sendCommand("const keys = inst.sampler({ name: 'keys' })");
    await sendCommand(`const samp = sn.read("${testFile}")`);
    await sendCommand("keys.loadSample(60, samp)");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Loaded sample at note 60", { timeout: 5000 });
  });

  test("noteOn and noteOff", async ({ sendCommand, window }) => {
    await sendCommand("const keys = inst.sampler({ name: 'keys' })");
    await sendCommand(`const samp = sn.read("${testFile}")`);
    await sendCommand("keys.loadSample(60, samp)");
    await sendCommand("keys.noteOn(60)");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Note on: 60 (velocity 1)", { timeout: 5000 });

    await sendCommand("keys.noteOff(60)");
    await expect(rows).toContainText("Note off: 60", { timeout: 5000 });
  });

  test("noteOn with custom velocity", async ({ sendCommand, window }) => {
    await sendCommand("const keys = inst.sampler({ name: 'keys' })");
    await sendCommand(`const samp = sn.read("${testFile}")`);
    await sendCommand("keys.loadSample(60, samp)");
    await sendCommand("keys.noteOn(60, { velocity: 0.5 })");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Note on: 60 (velocity 0.5)", { timeout: 5000 });
  });

  test("load a sample with loop option", async ({ sendCommand, window }) => {
    await sendCommand("const keys = inst.sampler({ name: 'keys' })");
    await sendCommand(`const samp = sn.read("${testFile}")`);
    await sendCommand("keys.loadSample(60, samp, { loop: true })");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Loaded sample at note 60 (loop)", { timeout: 5000 });
  });

  test("load a sample with loop start/end", async ({ sendCommand, window }) => {
    await sendCommand("const keys = inst.sampler({ name: 'keys' })");
    await sendCommand(`const samp = sn.read("${testFile}")`);
    await sendCommand("keys.loadSample(60, samp, { loop: true, loopStart: 0.1, loopEnd: 0.4 })");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Loaded sample at note 60 (loop 0.1s", { timeout: 5000 });
  });

  test("stop all voices", async ({ sendCommand, window }) => {
    await sendCommand("const keys = inst.sampler({ name: 'keys' })");
    await sendCommand(`const samp = sn.read("${testFile}")`);
    await sendCommand("keys.loadSample(60, samp)");
    await sendCommand("keys.noteOn(60)");
    await sendCommand("keys.stop()");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Stopped all voices on 'keys'", { timeout: 5000 });
  });

  test("free an instrument", async ({ sendCommand, window }) => {
    await sendCommand("const keys = inst.sampler({ name: 'keys' })");
    await sendCommand("keys.free()");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Freed instrument 'keys'", { timeout: 5000 });

    // After free, inst.list() should show no instruments
    await sendCommand("inst.list()");
    await expect(rows).toContainText("No instruments defined", { timeout: 5000 });
  });

  test("inst.list() shows instruments", async ({ sendCommand, window }) => {
    await sendCommand("inst.sampler({ name: 'keys' })");
    await sendCommand("inst.sampler({ name: 'drums' })");
    await sendCommand("inst.list()");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("keys", { timeout: 5000 });
    await expect(rows).toContainText("drums", { timeout: 5000 });
    await expect(rows).toContainText("sampler", { timeout: 5000 });
  });

  test("inst.get() retrieves an instrument", async ({ sendCommand, window }) => {
    await sendCommand("inst.sampler({ name: 'keys' })");
    await sendCommand("const retrieved = inst.get('keys')");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("Sampler 'keys'", { timeout: 5000 });
  });

  test("inst.get() for nonexistent instrument shows error", async ({ sendCommand, window }) => {
    await sendCommand("inst.get('nope')");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("not found", { timeout: 5000 });
  });

  test("instrument .help() shows method documentation", async ({ sendCommand, window }) => {
    await sendCommand("const keys = inst.sampler({ name: 'keys' })");
    await sendCommand("keys.help()");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("sampler instrument", { timeout: 5000 });
    await expect(rows).toContainText(".loadSample(note, sample)", { timeout: 5000 });
    await expect(rows).toContainText(".noteOn(note)", { timeout: 5000 });
    await expect(rows).toContainText(".noteOff(note)", { timeout: 5000 });
    await expect(rows).toContainText(".stop()", { timeout: 5000 });
    await expect(rows).toContainText(".free()", { timeout: 5000 });
  });

  test("loadSample validates note range", async ({ sendCommand, window }) => {
    await sendCommand("const keys = inst.sampler({ name: 'keys' })");
    await sendCommand("keys.loadSample(200, { hash: 'abc' })");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("note must be 0", { timeout: 5000 });
  });

  test("inst.sampler requires a name", async ({ sendCommand, window }) => {
    await sendCommand("inst.sampler({})");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("requires", { timeout: 5000 });
  });

  test("instrument method help()", async ({ sendCommand, window }) => {
    await sendCommand("const keys = inst.sampler({ name: 'keys' })");

    await sendCommand("keys.loadSample.help()");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("loadSample(note, sample, options?)", { timeout: 5000 });

    await sendCommand("keys.noteOn.help()");
    await expect(rows).toContainText("noteOn(note, options?)", { timeout: 5000 });
  });
});
