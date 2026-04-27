import { ipcMain } from "electron";
import { createRequire } from "node:module";
import * as path from "path";
import type { HandlerDeps } from "./register";
import type { MidiEvent, MidiInputDevice, MidiSequenceRecord } from "../../shared/ipc-contract";
import { BounceError } from "../../shared/bounce-error";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Native MIDI addon — loaded from the same build as the audio engine.
// The path resolves relative to dist/electron/ipc/ → build/Release/.
// ---------------------------------------------------------------------------
interface MidiNative {
  listMidiInputs(): Array<{ index: number; name: string }>;
  openMidiInput(index: number): void;
  closeMidiInput(): void;
  drainMidiEvents(): Array<{ timestampUs: number; status: number; data1: number; data2: number }>;
  injectMidiEvent(status: number, data1: number, data2: number): void;
  parseMidiFile(path: string): {
    events: Array<{ timestampMs: number; status: number; data1: number; data2: number }>;
    durationMs: number;
    smfType: number;
  };
}

let _midiNative: MidiNative | null = null;

function getMidiNative(): MidiNative {
  if (_midiNative) return _midiNative;
  _midiNative = require(path.resolve(import.meta.dirname!, "../../../build/Release/audio_engine_native")) as MidiNative;
  return _midiNative;
}

// ---------------------------------------------------------------------------
// Raw MIDI byte decoding → MidiEvent
// ---------------------------------------------------------------------------
function decodeRawEvent(
  raw: { timestampUs: number; status: number; data1: number; data2: number },
  baseTimestampUs: number,
): MidiEvent | null {
  const msgType = raw.status & 0xf0;
  const channel = raw.status & 0x0f;
  const timestampMs = (raw.timestampUs - baseTimestampUs) / 1000;

  if (msgType === 0x90 && raw.data2 > 0) {
    return { timestampMs, type: "note_on", channel, note: raw.data1, velocity: raw.data2 / 127 };
  }
  if (msgType === 0x80 || (msgType === 0x90 && raw.data2 === 0)) {
    return { timestampMs, type: "note_off", channel, note: raw.data1, velocity: 0 };
  }
  if (msgType === 0xb0) {
    return { timestampMs, type: "cc", channel, ccNumber: raw.data1, ccValue: raw.data2 / 127 };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Poll state — one interval drives all MIDI event processing while any
// device is open or inject events are in flight (e.g. during tests).
// ---------------------------------------------------------------------------
let pollInterval: ReturnType<typeof setInterval> | null = null;
let isRecording = false;
let recordingInstrumentId: string | null = null;
let recordingEvents: MidiEvent[] = [];
let recordingBaseUs = 0;

// ---------------------------------------------------------------------------
// Playback state
// ---------------------------------------------------------------------------
let playbackTimeouts: ReturnType<typeof setTimeout>[] = [];
let activePlaybackSequenceId: number | null = null;

function startPoll(deps: HandlerDeps): void {
  if (pollInterval) return;
  pollInterval = setInterval(() => {
    let rawEvents: ReturnType<MidiNative["drainMidiEvents"]>;
    try {
      rawEvents = getMidiNative().drainMidiEvents();
    } catch {
      return;
    }
    if (rawEvents.length === 0) return;

    // Anchor the recording timestamp to the first event of this recording.
    if (isRecording && recordingBaseUs === 0 && rawEvents.length > 0) {
      recordingBaseUs = rawEvents[0].timestampUs;
    }

    for (const raw of rawEvents) {
      const baseUs = isRecording ? recordingBaseUs : raw.timestampUs;
      const ev = decodeRawEvent(raw, baseUs);
      if (!ev) continue;

      if (isRecording) {
        recordingEvents.push(ev);
      }

      // Live-through: note events during recording → instrument.
      if (recordingInstrumentId && (ev.type === "note_on" || ev.type === "note_off")) {
        const port = deps.getAudioEnginePort();
        if (port) {
          if (ev.type === "note_on") {
            port.postMessage({
              type: "instrument-note-on",
              instrumentId: recordingInstrumentId,
              note: ev.note,
              velocity: ev.velocity,
            });
          } else {
            port.postMessage({
              type: "instrument-note-off",
              instrumentId: recordingInstrumentId,
              note: ev.note,
            });
          }
        }
      }

      // Telemetry to renderer.
      deps.getMainWindow()?.webContents.send("midi-input-event", ev);
    }
  }, 5);
}

function stopPoll(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------
export function registerMidiHandlers(deps: HandlerDeps): void {
  ipcMain.handle("midi-list-inputs", (): MidiInputDevice[] => {
    try {
      return getMidiNative().listMidiInputs();
    } catch (e) {
      throw new BounceError(
        "MIDI_ERROR",
        `Failed to list MIDI inputs: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  });

  ipcMain.handle("midi-open-input", (_event, index: number) => {
    try {
      const native = getMidiNative();
      const ports = native.listMidiInputs();
      if (!ports[index]) {
        throw new BounceError("MIDI_ERROR", `No MIDI input device at index ${index}`);
      }
      native.openMidiInput(index);
      startPoll(deps);
      return { name: ports[index].name };
    } catch (e) {
      if (e instanceof BounceError) throw e;
      throw new BounceError(
        "MIDI_ERROR",
        `Failed to open MIDI input: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  });

  ipcMain.handle("midi-close-input", () => {
    stopPoll();
    recordingInstrumentId = null;
    isRecording = false;
    try {
      getMidiNative().closeMidiInput();
    } catch {
      // ignore
    }
  });

  ipcMain.handle("midi-inject-event", (_event, status: number, data1: number, data2: number) => {
    // Ensure poll is running so injected events are processed.
    startPoll(deps);
    getMidiNative().injectMidiEvent(status, data1, data2);
  });

  ipcMain.handle("midi-start-recording", (_event, instrumentId: string) => {
    recordingInstrumentId = instrumentId;
    recordingEvents = [];
    recordingBaseUs = 0;
    isRecording = true;
    startPoll(deps);
  });

  ipcMain.handle("midi-stop-recording", (): MidiEvent[] => {
    isRecording = false;
    recordingInstrumentId = null;
    const events = recordingEvents;
    recordingEvents = [];
    recordingBaseUs = 0;
    return events;
  });
  ipcMain.handle(
    "midi-save-sequence",
    (_event, name: string, events: MidiEvent[], durationMs: number): MidiSequenceRecord => {
      if (!deps.dbManager) throw new BounceError("MIDI_DB_NOT_READY", "Database not initialised");
      return deps.dbManager.saveMidiSequence(name, events, durationMs);
    },
  );

  ipcMain.handle("midi-load-sequence", (_event, id: number) => {
    if (!deps.dbManager) throw new BounceError("MIDI_DB_NOT_READY", "Database not initialised");
    return deps.dbManager.getMidiSequence(id);
  });

  ipcMain.handle("midi-list-sequences", (): MidiSequenceRecord[] => {
    if (!deps.dbManager) throw new BounceError("MIDI_DB_NOT_READY", "Database not initialised");
    return deps.dbManager.listMidiSequences();
  });

  ipcMain.handle("midi-delete-sequence", (_event, id: number) => {
    if (!deps.dbManager) throw new BounceError("MIDI_DB_NOT_READY", "Database not initialised");
    deps.dbManager.deleteMidiSequence(id);
  });

  ipcMain.handle("midi-load-file", (_event, filePath: string) => {
    try {
      const raw = getMidiNative().parseMidiFile(filePath);
      const events: MidiEvent[] = [];
      for (const r of raw.events) {
        const ev = decodeRawEvent(
          { timestampUs: r.timestampMs * 1000, status: r.status, data1: r.data1, data2: r.data2 },
          0,
        );
        if (ev) events.push(ev);
      }
      return { events, durationMs: raw.durationMs, smfType: raw.smfType };
    } catch (e) {
      throw new BounceError(
        "MIDI_PARSE_ERROR",
        `Failed to parse MIDI file: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  });

  ipcMain.handle("midi-start-playback", (_event, sequenceId: number, instrumentId: string) => {
    if (!deps.dbManager) throw new BounceError("MIDI_DB_NOT_READY", "Database not initialised");

    // Cancel any running playback first.
    for (const t of playbackTimeouts) clearTimeout(t);
    playbackTimeouts = [];
    activePlaybackSequenceId = sequenceId;

    const seq = deps.dbManager.getMidiSequence(sequenceId);
    if (!seq) throw new BounceError("MIDI_ERROR", `Sequence ${sequenceId} not found`);

    const port = deps.getAudioEnginePort();
    if (!port) throw new BounceError("AUDIO_ENGINE_NOT_READY", "Audio engine not running");

    const events = seq.events.filter((e) => e.type === "note_on" || e.type === "note_off");
    if (events.length === 0) return;

    const startMs = Date.now();

    for (const ev of events) {
      const delay = Math.max(0, ev.timestampMs);
      const t = setTimeout(() => {
        if (activePlaybackSequenceId !== sequenceId) return; // cancelled
        if (ev.type === "note_on") {
          port.postMessage({
            type: "instrument-note-on",
            instrumentId,
            note: ev.note,
            velocity: ev.velocity ?? 1,
          });
        } else {
          port.postMessage({
            type: "instrument-note-off",
            instrumentId,
            note: ev.note,
          });
        }
      }, delay);
      playbackTimeouts.push(t);
    }

    // Send playback-ended after the last event.
    const lastMs = events[events.length - 1].timestampMs;
    const endTimeout = setTimeout(() => {
      if (activePlaybackSequenceId !== sequenceId) return;
      activePlaybackSequenceId = null;
      playbackTimeouts = [];
      deps.getMainWindow()?.webContents.send("midi-playback-ended", { sequenceId });
    }, lastMs + 50);
    playbackTimeouts.push(endTimeout);

    void startMs; // suppress unused warning
  });

  ipcMain.handle("midi-stop-playback", () => {
    for (const t of playbackTimeouts) clearTimeout(t);
    playbackTimeouts = [];
    activePlaybackSequenceId = null;
  });
}
