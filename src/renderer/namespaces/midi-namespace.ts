import { BounceResult } from "../results/base.js";
import {
  MidiDevicesResult,
  MidiDeviceResult,
  MidiRecordingHandle,
  MidiSequenceResult,
  MidiSequencePromise,
  MidiSequencesResult,
  type MidiTargetInstrument,
} from "../results/midi.js";
import type { NamespaceDeps } from "./types.js";

export interface MidiRecordOptions {
  duration?: number;
  name?: string;
}

let sequenceNameCounter = 1;

function generateSequenceName(): string {
  return `seq-${sequenceNameCounter++}`;
}

function channelsFromEvents(events: Array<{ channel: number }>): number[] {
  return [...new Set(events.map((e) => e.channel))].sort((a, b) => a - b);
}

export function buildMidiNamespace(_deps: NamespaceDeps) {
  // Wire up playback-ended telemetry so seq.stop() state stays consistent.
  window.electron.onMidiPlaybackEnded?.(() => {
    // No-op for now; future transport integration can hook here.
  });

  const midi = {
    help: (): BounceResult =>
      new BounceResult(
        [
          "\x1b[1;36mmidi\x1b[0m  — MIDI recording and playback",
          "",
          "\x1b[1mDevice:\x1b[0m",
          "  midi.devices()                        List available MIDI input devices",
          "  midi.open(index)                      Open a device",
          "  midi.close()                          Close the active device",
          "",
          "\x1b[1mRecording:\x1b[0m",
          "  midi.record(instrument)               Start recording; returns MidiRecordingHandle",
          "  midi.record(instrument, {duration:N}) Record N seconds; returns MidiSequence",
          "  h.stop()                              Stop recording; returns MidiSequence",
          "",
          "\x1b[1mSequences:\x1b[0m",
          "  midi.sequences()                      List saved sequences in current project",
          "  midi.load(path)                       Import a .mid file as a sequence",
          "",
          "\x1b[1mPlayback:\x1b[0m",
          "  seq.play(instrument)                  Play sequence through instrument",
          "  seq.stop()                            Stop playback",
          "",
          "\x1b[1mExample:\x1b[0m",
          "  midi.devices()",
          "  midi.open(0)",
          "  keys = inst.sampler({ name: 'keys' })",
          "  const h = midi.record(keys)",
          "  const seq = h.stop()",
          "  seq.play(keys)",
        ].join("\n"),
      ),

    devices: async (): Promise<MidiDevicesResult> => {
      const devices = await window.electron.midiListInputs();
      return new MidiDevicesResult(devices);
    },

    open: async (index: number): Promise<MidiDeviceResult> => {
      const result = await window.electron.midiOpenInput(index);
      return new MidiDeviceResult(result.name);
    },

    close: async (): Promise<BounceResult> => {
      await window.electron.midiCloseInput();
      return new BounceResult("\x1b[90mMIDI input closed.\x1b[0m");
    },

    record(
      inst: MidiTargetInstrument,
      opts?: MidiRecordOptions,
    ): MidiRecordingHandle | MidiSequencePromise {
      const instrName = inst.name ?? inst.instrumentId;
      const sequenceName = opts?.name ?? generateSequenceName();

      // Fire-and-forget: start recording in main process. The few-ms IPC delay
      // before the first event is negligible for human-played MIDI.
      window.electron.midiStartRecording(inst.instrumentId).catch((err: unknown) => {
        console.error("[midi] Failed to start recording:", err);
      });

      const stopAndSave = async (): Promise<MidiSequenceResult> => {
        const events = await window.electron.midiStopRecording();
        const durationMs =
          events.length > 0 ? events[events.length - 1].timestampMs : 0;
        const record = await window.electron.midiSaveSequence(
          sequenceName,
          events,
          durationMs,
        );
        return new MidiSequenceResult(
          record.id,
          record.name,
          record.duration_ms,
          record.event_count,
          channelsFromEvents(events),
        );
      };

      if (opts?.duration !== undefined) {
        const duration = opts.duration;
        return new MidiSequencePromise(
          new Promise<MidiSequenceResult>((resolve, reject) => {
            setTimeout(() => {
              stopAndSave().then(resolve, reject);
            }, duration * 1000);
          }),
        );
      }

      return new MidiRecordingHandle(instrName, stopAndSave);
    },

    sequences: async (): Promise<MidiSequencesResult> => {
      const records = await window.electron.midiListSequences();
      return new MidiSequencesResult(records);
    },

    load: async (filePath: string): Promise<MidiSequenceResult> => {
      const result = await window.electron.midiLoadFile(filePath);
      // Imported files are not auto-saved; user can call midi.record() pattern instead.
      // Return a transient result with id -1 until save is called.
      const channels = channelsFromEvents(result.events as Array<{ channel: number }>);
      const name = filePath.split("/").pop()?.replace(/\.mid$/i, "") ?? "imported";
      return new MidiSequenceResult(-1, name, result.durationMs, result.events.length, channels);
    },

    // Test-only helper exposed on the namespace for Playwright tests.
    __injectEvent: (status: number, data1: number, data2: number): Promise<void> =>
      window.electron.midiInjectEvent(status, data1, data2),
  };

  return { midi };
}
