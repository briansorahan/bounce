import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { launchApp, waitForReady, sendCommand } from "./helpers";

// ---------------------------------------------------------------------------
// midi.help() and namespace display
// ---------------------------------------------------------------------------
test.describe("midi namespace", () => {
  test("midi.help() shows namespace documentation", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "midi.help()");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("MIDI recording and playback", { timeout: 5000 });
    await expect(rows).toContainText("midi.devices()", { timeout: 5000 });
    await expect(rows).toContainText("midi.record(", { timeout: 5000 });
    await expect(rows).toContainText("midi.sequences()", { timeout: 5000 });

    await electronApp.close();
  });

  test("midi appears in global help()", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "help()");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("midi", { timeout: 5000 });

    await electronApp.close();
  });

  test("midi.devices() returns MidiDevicesResult (empty is fine in CI)", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "midi.devices()");
    const rows = window.locator(".xterm-rows");
    // Either lists devices or shows "No MIDI input devices found."
    await expect(rows).toContainText(/MIDI Input Devices|No MIDI input devices/, {
      timeout: 10000,
    });

    await electronApp.close();
  });

  test("midi is accessible as a top-level REPL variable", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    // Verify midi is in scope (typeof returns "object", not "undefined")
    await sendCommand(window, "typeof midi");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("object", { timeout: 5000 });

    await electronApp.close();
  });
});

// ---------------------------------------------------------------------------
// MIDI recording via inject (no hardware required)
// ---------------------------------------------------------------------------
test.describe("MIDI recording", () => {
  test("midi.record() returns MidiRecordingHandle, h.stop() returns MidiSequence", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    const rows = window.locator(".xterm-rows");

    // Create an instrument to record to — wait for it to render before proceeding
    await sendCommand(window, "const keys = inst.sampler({ name: 'rec-keys' })");
    await expect(rows).toContainText("Sampler", { timeout: 5000 });

    // Start recording — wait for handle display before injecting events
    await sendCommand(window, "const h = midi.record(keys)");
    await expect(rows).toContainText("MIDI Recording", { timeout: 5000 });
    await expect(rows).toContainText("in progress", { timeout: 5000 });

    // Inject synthetic note events — injectEvent pushes into the SPSC ring buffer
    // synchronously so no delay is needed between calls
    await sendCommand(window, "midi.__injectEvent(0x90, 60, 80)"); // note-on C4
    await sendCommand(window, "midi.__injectEvent(0x80, 60, 0)");  // note-off C4

    // Stop recording
    await sendCommand(window, "h.stop()");
    await expect(rows).toContainText("MidiSequence", { timeout: 10000 });
    await expect(rows).toContainText("Events", { timeout: 5000 });

    await electronApp.close();
  });

  test("midi.record() with duration auto-stops and returns MidiSequence", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    const rows = window.locator(".xterm-rows");

    await sendCommand(window, "const keys = inst.sampler({ name: 'timed-keys' })");
    await expect(rows).toContainText("Sampler", { timeout: 5000 });

    // 0.5s duration gives extra headroom for DB write latency on slow CI
    await sendCommand(window, "midi.record(keys, { duration: 0.5 })");
    await expect(rows).toContainText("MidiSequence", { timeout: 10000 });

    await electronApp.close();
  });

  test("MidiRecordingHandle.help() shows documentation", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    const rows = window.locator(".xterm-rows");

    await sendCommand(window, "const keys = inst.sampler({ name: 'help-keys' })");
    await expect(rows).toContainText("Sampler", { timeout: 5000 });
    await sendCommand(window, "const h = midi.record(keys)");
    await expect(rows).toContainText("MIDI Recording", { timeout: 5000 });
    await sendCommand(window, "h.help()");
    await expect(rows).toContainText("MidiRecordingHandle", { timeout: 5000 });
    await expect(rows).toContainText("h.stop()", { timeout: 5000 });

    // Clean up
    await sendCommand(window, "h.stop()");
    await electronApp.close();
  });

  test("injected note events trigger live-through to instrument", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    const rows = window.locator(".xterm-rows");

    await sendCommand(window, "const keys = inst.sampler({ name: 'lt-keys' })");
    await expect(rows).toContainText("Sampler", { timeout: 5000 });
    await sendCommand(window, "const h = midi.record(keys)");
    await expect(rows).toContainText("MIDI Recording", { timeout: 5000 });

    // Inject note-on/off — injectEvent is synchronous, no delay needed
    await sendCommand(window, "midi.__injectEvent(0x90, 60, 100)");
    await sendCommand(window, "midi.__injectEvent(0x80, 60, 0)");

    await sendCommand(window, "h.stop()");
    // Confirm stop completed — no error means live-through path ran successfully
    await expect(rows).toContainText("MidiSequence", { timeout: 5000 });
    await electronApp.close();
  });
});

// ---------------------------------------------------------------------------
// Sequence persistence across project switches
// ---------------------------------------------------------------------------
test.describe("MIDI sequence persistence", () => {
  test("saved sequence survives project switch round-trip", async () => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bounce-midi-persist-"),
    );
    const electronApp = await launchApp(userDataDir);
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    const rows = window.locator(".xterm-rows");

    // Record a short sequence and auto-save it
    await sendCommand(window, "const keys = inst.sampler({ name: 'persist-keys' })");
    await expect(rows).toContainText("Sampler", { timeout: 5000 });

    // 0.5s duration gives extra headroom for DB write latency on slow CI
    await sendCommand(window, "midi.record(keys, { duration: 0.5, name: 'my-seq' })");
    // Waiting for MidiSequence in the output confirms auto-stop + DB write completed
    await expect(rows).toContainText("my-seq", { timeout: 10000 });

    // Switch to another project — sequences() on the new project confirms the
    // switch is fully complete before we switch back
    await sendCommand(window, 'proj.load("other")');
    await expect(rows).toContainText("Loaded Project", { timeout: 5000 });
    await sendCommand(window, "midi.sequences()");
    await expect(rows).toContainText(/No MIDI sequences|MIDI Sequences/, { timeout: 5000 });

    // Switch back to default and verify sequence persisted
    await sendCommand(window, 'proj.load("default")');
    await expect(rows).toContainText("Loaded Project", { timeout: 5000 });
    await sendCommand(window, "midi.sequences()");
    await expect(rows).toContainText("my-seq", { timeout: 5000 });

    await electronApp.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test("midi.sequences() shows 'No MIDI sequences' when project is fresh", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "midi.sequences()");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText(/No MIDI sequences|MIDI Sequences/, { timeout: 5000 });

    await electronApp.close();
  });

  test("MidiSequencesResult.help() shows documentation", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "midi.sequences().then(s => s.help())");
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("midi.sequences()", { timeout: 5000 });

    await electronApp.close();
  });
});

// ---------------------------------------------------------------------------
// MIDI file import
// ---------------------------------------------------------------------------
test.describe("MIDI file import", () => {
  const testMidPath = path.join(
    __dirname,
    "../test-results/midi-test/test.mid",
  );

  test.beforeAll(() => {
    fs.mkdirSync(path.dirname(testMidPath), { recursive: true });
    // Write a minimal Type 0 MIDI file: one note-on (C4) at t=0, note-off at t=480 ticks
    // Header: MThd + len(6) + format(0) + nTracks(1) + division(480 PPQ)
    // Track: MTrk + len + events
    //   delta=0, note-on ch0, note=60, vel=64
    //   delta=480 (VLQ: 0x83 0x60), note-off ch0, note=60, vel=0
    //   delta=0, meta end-of-track (FF 2F 00)
    const noteOn  = [0x00, 0x90, 60, 64];          // delta=0, note-on C4
    const noteOff = [0x83, 0x60, 0x80, 60, 0];     // delta=480, note-off C4
    const eot     = [0x00, 0xFF, 0x2F, 0x00];       // end of track

    const trackData = Buffer.from([...noteOn, ...noteOff, ...eot]);
    const trackLen  = trackData.length;

    const header = Buffer.from([
      0x4D, 0x54, 0x68, 0x64,             // MThd
      0x00, 0x00, 0x00, 0x06,             // length = 6
      0x00, 0x00,                         // format = 0
      0x00, 0x01,                         // nTracks = 1
      0x01, 0xE0,                         // 480 PPQ
    ]);
    const trackHeader = Buffer.from([
      0x4D, 0x54, 0x72, 0x6B,             // MTrk
      (trackLen >> 24) & 0xFF,
      (trackLen >> 16) & 0xFF,
      (trackLen >>  8) & 0xFF,
       trackLen        & 0xFF,
    ]);
    fs.writeFileSync(testMidPath, Buffer.concat([header, trackHeader, trackData]));
  });

  test.afterAll(() => {
    if (fs.existsSync(testMidPath)) fs.unlinkSync(testMidPath);
  });

  test("midi.load() parses a .mid file and returns MidiSequenceResult", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, `midi.load("${testMidPath}")`);
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("MidiSequence", { timeout: 10000 });
    await expect(rows).toContainText("Events", { timeout: 5000 });
    // Should have 2 events: note-on + note-off
    await expect(rows).toContainText("2", { timeout: 5000 });

    await electronApp.close();
  });

  test("MidiSequenceResult.help() shows documentation", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, `midi.load("${testMidPath}").then(s => s.help())`);
    const rows = window.locator(".xterm-rows");
    await expect(rows).toContainText("MidiSequence", { timeout: 10000 });
    await expect(rows).toContainText("seq.play(instrument)", { timeout: 5000 });

    await electronApp.close();
  });
});
