import { BounceResult } from "../results/base.js";
import { renderNamespaceHelp, withHelp } from "../help.js";
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
import { midiCommands } from "./midi-commands.generated.js";
export { midiCommands } from "./midi-commands.generated.js";

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

/** @namespace midi */
export function buildMidiNamespace(_deps: NamespaceDeps) {
  // Wire up playback-ended telemetry so seq.stop() state stays consistent.
  window.electron.onMidiPlaybackEnded?.(() => {
    // No-op for now; future transport integration can hook here.
  });

  const midi = {
    help: () => renderNamespaceHelp("midi", "MIDI recording and playback", midiCommands),

    devices: withHelp(
      /**
       * List available MIDI input devices
       *
       * Returns a list of all available MIDI input devices on the system.
       *
       * @example midi.devices()
       */
      async function devices(): Promise<MidiDevicesResult> {
        const devices = await window.electron.midiListInputs();
        return new MidiDevicesResult(devices);
      },
      midiCommands[0],
    ),

    open: withHelp(
      /**
       * Open a MIDI input device by index
       *
       * Open the MIDI input device at the given index (from midi.devices()).
       * Only one device can be open at a time; call midi.close() first if needed.
       *
       * @param index Device index from midi.devices().
       * @example midi.open(0)
       */
      async function open(index: number): Promise<MidiDeviceResult> {
        const result = await window.electron.midiOpenInput(index);
        return new MidiDeviceResult(result.name);
      },
      midiCommands[1],
    ),

    close: withHelp(
      /**
       * Close the active MIDI input device
       *
       * Close the currently open MIDI input device.
       *
       * @example midi.close()
       */
      async function close(): Promise<BounceResult> {
        await window.electron.midiCloseInput();
        return new BounceResult("\x1b[90mMIDI input closed.\x1b[0m");
      },
      midiCommands[2],
    ),

    record: withHelp(
      /**
       * Start MIDI recording; returns handle or timed sequence
       *
       * Start recording MIDI events from the open input device.
       * Returns a MidiRecordingHandle when no duration is specified — call h.stop() to finish.
       * Returns a MidiSequencePromise when opts.duration is set, which resolves automatically.
       *
       * @param inst Target instrument to associate with the recording.
       * @param opts Recording options (duration in seconds, name for the saved sequence).
       * @example const h = midi.record(keys)\nconst seq = h.stop()\nseq.play(keys)
       * @example // Timed recording:\nconst seq = midi.record(keys, { duration: 4 })\nseq.play(keys)
       */
      function record(
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
      midiCommands[3],
    ),

    sequences: withHelp(
      /**
       * List saved sequences in the current project
       *
       * Returns all MIDI sequences saved in the current project.
       *
       * @example midi.sequences()
       */
      async function sequences(): Promise<MidiSequencesResult> {
        const records = await window.electron.midiListSequences();
        return new MidiSequencesResult(records);
      },
      midiCommands[4],
    ),

    load: withHelp(
      /**
       * Import a .mid file as a sequence
       *
       * Import a Standard MIDI File (.mid) and return it as a MidiSequenceResult.
       * The imported sequence is transient — it is not auto-saved to the project.
       *
       * @param filePath Absolute path to the .mid file.
       * @example midi.load('~/beats/groove.mid')
       */
      async function load(filePath: string): Promise<MidiSequenceResult> {
        const result = await window.electron.midiLoadFile(filePath);
        // Imported files are not auto-saved; user can call midi.record() pattern instead.
        // Return a transient result with id -1 until save is called.
        const channels = channelsFromEvents(result.events as Array<{ channel: number }>);
        const name = filePath.split("/").pop()?.replace(/\.mid$/i, "") ?? "imported";
        return new MidiSequenceResult(-1, name, result.durationMs, result.events.length, channels);
      },
      midiCommands[5],
    ),

    // Test-only helper exposed on the namespace for Playwright tests.
    __injectEvent: (status: number, data1: number, data2: number): Promise<void> =>
      window.electron.midiInjectEvent(status, data1, data2),
  };

  return { midi };
}
