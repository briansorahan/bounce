/**
 * Unit tests for src/renderer/results/midi.ts
 *
 * MidiSequenceResult.play() and .stop() call window.electron.midiStartPlayback /
 * midiStopPlayback. We install a temporary mock (with save + restore so the
 * test-hygiene no-unguarded-global-mock rule is satisfied) and tear it down
 * in afterAll.
 */

import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import {
  MidiDevicesResult,
  MidiDeviceResult,
  MidiSequenceResult,
  MidiSequencePromise,
  MidiRecordingHandleResult,
  MidiSequencesResult,
} from "./renderer/results/midi.js";

// ---------------------------------------------------------------------------
// Minimal window.electron mock
// ---------------------------------------------------------------------------

interface MockElectron {
  midiStartPlayback: (seqId: number, instrumentId: string) => Promise<void>;
  midiStopPlayback: () => Promise<void>;
  lastStartSeqId: number | undefined;
  lastStartInstrumentId: string | undefined;
  stopPlaybackCalled: boolean;
}

function makeMockElectron(): MockElectron {
  const mock: MockElectron = {
    lastStartSeqId: undefined,
    lastStartInstrumentId: undefined,
    stopPlaybackCalled: false,
    midiStartPlayback(seqId: number, instrumentId: string): Promise<void> {
      mock.lastStartSeqId = seqId;
      mock.lastStartInstrumentId = instrumentId;
      return Promise.resolve();
    },
    midiStopPlayback(): Promise<void> {
      mock.stopPlaybackCalled = true;
      return Promise.resolve();
    },
  };
  return mock;
}

// Save + restore to satisfy test-hygiene no-unguarded-global-mock rule
const originalWindow = (globalThis as Record<string, unknown>).window;
const mock = makeMockElectron();
(globalThis as Record<string, unknown>).window = { electron: mock };

afterAll(() => {
  (globalThis as Record<string, unknown>).window = originalWindow;
});

// ---------------------------------------------------------------------------
// MidiDevicesResult — empty
// ---------------------------------------------------------------------------

test("MidiDevicesResult (empty) shows no-devices message", () => {
  const r = new MidiDevicesResult([]);
  const text = r.toString();
  assert.ok(text.includes("No MIDI input devices found."), "empty message present");
});

// ---------------------------------------------------------------------------
// MidiDevicesResult — non-empty
// ---------------------------------------------------------------------------

test("MidiDevicesResult (non-empty) shows device list with index and name", () => {
  const r = new MidiDevicesResult([
    { index: 0, name: "Arturia KeyStep" },
    { index: 1, name: "IAC Driver Bus 1" },
  ]);
  const text = r.toString();
  assert.ok(text.includes("MIDI Input Devices"), "header present");
  assert.ok(text.includes("0"), "index 0 present");
  assert.ok(text.includes("Arturia KeyStep"), "first device name present");
  assert.ok(text.includes("1"), "index 1 present");
  assert.ok(text.includes("IAC Driver Bus 1"), "second device name present");
});

// ---------------------------------------------------------------------------
// MidiDevicesResult — help()
// ---------------------------------------------------------------------------

test("MidiDevicesResult.help mentions midi.devices and midi.open", () => {
  const r = new MidiDevicesResult([]);
  const text = r.help().toString();
  assert.ok(text.includes("midi.devices()"), "help mentions midi.devices()");
  assert.ok(text.includes("midi.open("), "help mentions midi.open");
});

// ---------------------------------------------------------------------------
// MidiDeviceResult — constructor format
// ---------------------------------------------------------------------------

test("MidiDeviceResult shows portName and connected status", () => {
  const r = new MidiDeviceResult("Arturia KeyStep");
  const text = r.toString();
  assert.ok(text.includes("Arturia KeyStep"), "portName in output");
  assert.ok(text.includes("connected"), "connected status in output");
  assert.ok(text.includes("MIDI Input"), "MIDI Input label in output");
});

test("MidiDeviceResult shows record and close hints", () => {
  const r = new MidiDeviceResult("My Device");
  const text = r.toString();
  assert.ok(text.includes("midi.record("), "record hint present");
  assert.ok(text.includes("midi.close()"), "close hint present");
});

// ---------------------------------------------------------------------------
// MidiDeviceResult — help()
// ---------------------------------------------------------------------------

test("MidiDeviceResult.help mentions the portName and record/close commands", () => {
  const r = new MidiDeviceResult("Launchkey Mini");
  const text = r.help().toString();
  assert.ok(text.includes("Launchkey Mini"), "help mentions the portName");
  assert.ok(text.includes("midi.record("), "help mentions record");
  assert.ok(text.includes("midi.close()"), "help mentions close");
});

// ---------------------------------------------------------------------------
// MidiSequenceResult — constructor properties
// ---------------------------------------------------------------------------

test("MidiSequenceResult stores constructor arguments as properties", () => {
  const r = new MidiSequenceResult(42, "take-1", 3500, 128, [1, 2, 10]);
  assert.equal(r.id, 42, "id stored");
  assert.equal(r.name, "take-1", "name stored");
  assert.equal(r.durationMs, 3500, "durationMs stored");
  assert.equal(r.eventCount, 128, "eventCount stored");
  assert.deepEqual(r.channels, [1, 2, 10], "channels stored");
});

// ---------------------------------------------------------------------------
// MidiSequenceResult — toString format
// ---------------------------------------------------------------------------

test("MidiSequenceResult.toString shows name, events, duration, channels", () => {
  const r = new MidiSequenceResult(1, "my-loop", 2000, 64, [1]);
  const text = r.toString();
  assert.ok(text.includes("MidiSequence"), "MidiSequence label in output");
  assert.ok(text.includes('"my-loop"'), "name in output");
  assert.ok(text.includes("64"), "event count in output");
  assert.ok(text.includes("2.00s"), "duration formatted in seconds");
  assert.ok(text.includes("1"), "channel in output");
});

test("MidiSequenceResult.toString shows em-dash for empty channels", () => {
  const r = new MidiSequenceResult(2, "no-channels", 1000, 10, []);
  const text = r.toString();
  assert.ok(text.includes("—"), "em-dash shown when no channels");
});

test("MidiSequenceResult.toString shows play and stop hints", () => {
  const r = new MidiSequenceResult(3, "hint-test", 500, 5, []);
  const text = r.toString();
  assert.ok(text.includes("seq.play("), "play hint present");
  assert.ok(text.includes("seq.stop()"), "stop hint present");
});

// ---------------------------------------------------------------------------
// MidiSequenceResult — help()
// ---------------------------------------------------------------------------

test("MidiSequenceResult.help shows all properties and usage", () => {
  const r = new MidiSequenceResult(7, "riff", 4200, 200, [1, 3]);
  const text = r.help().toString();
  assert.ok(text.includes("MidiSequence"), "help mentions MidiSequence");
  assert.ok(text.includes("riff"), "help mentions name");
  assert.ok(text.includes("7"), "help shows id");
  assert.ok(text.includes("200"), "help shows eventCount");
  assert.ok(text.includes("4200"), "help shows durationMs");
  assert.ok(text.includes("seq.play("), "help shows play example");
  assert.ok(text.includes("seq.stop()"), "help shows stop example");
});

// ---------------------------------------------------------------------------
// MidiSequencePromise — then() resolves to MidiSequenceResult
// ---------------------------------------------------------------------------

test("MidiSequencePromise.then resolves to the underlying MidiSequenceResult", async () => {
  const seq = new MidiSequenceResult(10, "async-seq", 1500, 32, [1]);
  const promise = new MidiSequencePromise(Promise.resolve(seq));
  const resolved = await promise.then((s) => s);
  assert.equal(resolved.id, 10, "then resolves with correct id");
  assert.equal(resolved.name, "async-seq", "then resolves with correct name");
});

test("MidiSequencePromise.catch is invoked on rejection", async () => {
  const promise = new MidiSequencePromise(Promise.reject(new Error("oops")));
  let caught = false;
  await promise.catch(() => {
    caught = true;
  });
  assert.ok(caught, "catch handler was called on rejection");
});

// ---------------------------------------------------------------------------
// MidiSequencePromise — help() proxies to the underlying sequence
// ---------------------------------------------------------------------------

test("MidiSequencePromise.help proxies to MidiSequenceResult.help", async () => {
  const seq = new MidiSequenceResult(5, "proxy-help", 800, 20, [2]);
  const promise = new MidiSequencePromise(Promise.resolve(seq));
  const helpResult = await promise.help();
  const text = helpResult.toString();
  assert.ok(text.includes("proxy-help"), "help text includes sequence name");
  assert.ok(text.includes("MidiSequence"), "help text includes MidiSequence label");
});

// ---------------------------------------------------------------------------
// MidiRecordingHandleResult — constructor format
// ---------------------------------------------------------------------------

test("MidiRecordingHandleResult shows instrument name and in-progress status", () => {
  const stopFn = (): Promise<MidiSequenceResult> =>
    Promise.resolve(new MidiSequenceResult(0, "rec", 0, 0, []));
  const r = new MidiRecordingHandleResult("DrumKit", stopFn);
  const text = r.toString();
  assert.ok(text.includes("DrumKit"), "instrument name in output");
  assert.ok(text.includes("in progress"), "in progress label present");
  assert.ok(text.includes("MIDI Recording"), "MIDI Recording label present");
});

test("MidiRecordingHandleResult shows h.stop() hint", () => {
  const stopFn = (): Promise<MidiSequenceResult> =>
    Promise.resolve(new MidiSequenceResult(0, "rec", 0, 0, []));
  const r = new MidiRecordingHandleResult("Synth", stopFn);
  const text = r.toString();
  assert.ok(text.includes("h.stop()"), "stop hint present");
});

// ---------------------------------------------------------------------------
// MidiRecordingHandleResult — stop() calls stopFn and returns MidiSequencePromise
// ---------------------------------------------------------------------------

test("MidiRecordingHandleResult.stop calls stopFn and resolves to MidiSequenceResult", async () => {
  let stopCalled = false;
  const expectedSeq = new MidiSequenceResult(99, "recorded", 3000, 50, [1]);
  const stopFn = (): Promise<MidiSequenceResult> => {
    stopCalled = true;
    return Promise.resolve(expectedSeq);
  };
  const r = new MidiRecordingHandleResult("Piano", stopFn);
  const seqPromise = r.stop();
  assert.ok(seqPromise instanceof MidiSequencePromise, "stop returns MidiSequencePromise");
  const seq = await seqPromise;
  assert.ok(stopCalled, "stopFn was called");
  assert.equal(seq.id, 99, "resolved sequence has correct id");
  assert.equal(seq.name, "recorded", "resolved sequence has correct name");
});

// ---------------------------------------------------------------------------
// MidiRecordingHandleResult — help()
// ---------------------------------------------------------------------------

test("MidiRecordingHandleResult.help describes recording session and commands", () => {
  const stopFn = (): Promise<MidiSequenceResult> =>
    Promise.resolve(new MidiSequenceResult(0, "rec", 0, 0, []));
  const r = new MidiRecordingHandleResult("Bass", stopFn);
  const text = r.help().toString();
  assert.ok(text.includes("MidiRecordingHandle"), "help mentions MidiRecordingHandle");
  assert.ok(text.includes("h.stop()"), "help mentions stop command");
  assert.ok(text.includes("midi.record("), "help mentions fixed-duration recording");
});

// ---------------------------------------------------------------------------
// MidiSequencesResult — empty
// ---------------------------------------------------------------------------

test("MidiSequencesResult (empty) shows no-sequences message", () => {
  const r = new MidiSequencesResult([]);
  const text = r.toString();
  assert.ok(text.includes("No MIDI sequences"), "empty message present");
  assert.ok(text.includes("current project"), "message refers to current project");
});

// ---------------------------------------------------------------------------
// MidiSequencesResult — non-empty
// ---------------------------------------------------------------------------

test("MidiSequencesResult (non-empty) shows header and each sequence", () => {
  const r = new MidiSequencesResult([
    { id: 1, name: "intro", duration_ms: 2000, event_count: 40 },
    { id: 2, name: "verse", duration_ms: 8000, event_count: 200 },
  ]);
  const text = r.toString();
  assert.ok(text.includes("MIDI Sequences"), "header present");
  assert.ok(text.includes("intro"), "first sequence name present");
  assert.ok(text.includes("verse"), "second sequence name present");
  assert.ok(text.includes("40"), "first event count present");
  assert.ok(text.includes("200"), "second event count present");
  assert.ok(text.includes("2.0s"), "first duration formatted");
  assert.ok(text.includes("8.0s"), "second duration formatted");
});

// ---------------------------------------------------------------------------
// MidiSequencesResult — help()
// ---------------------------------------------------------------------------

test("MidiSequencesResult.help mentions midi.sequences and midi.load", () => {
  const r = new MidiSequencesResult([]);
  const text = r.help().toString();
  assert.ok(text.includes("midi.sequences()"), "help mentions midi.sequences()");
  assert.ok(text.includes("midi.load("), "help mentions midi.load");
});
