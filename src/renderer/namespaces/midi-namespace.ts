import { BounceResult } from "../results/base.js";
import { type CommandHelp, renderNamespaceHelp, withHelp } from "../help.js";
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

export const midiCommands: CommandHelp[] = [
  {
    name: "devices",
    signature: "midi.devices()",
    summary: "List available MIDI input devices",
    description: "Returns a list of all available MIDI input devices on the system.",
    examples: ["midi.devices()"],
  },
  {
    name: "open",
    signature: "midi.open(index)",
    summary: "Open a MIDI input device by index",
    description:
      "Open the MIDI input device at the given index (from midi.devices()).\n" +
      "Only one device can be open at a time; call midi.close() first if needed.",
    params: [
      { name: "index", type: "number", description: "Device index from midi.devices()." },
    ],
    examples: ["midi.open(0)"],
  },
  {
    name: "close",
    signature: "midi.close()",
    summary: "Close the active MIDI input device",
    description: "Close the currently open MIDI input device.",
    examples: ["midi.close()"],
  },
  {
    name: "record",
    signature: "midi.record(instrument, opts?)",
    summary: "Start MIDI recording; returns handle or timed sequence",
    description:
      "Start recording MIDI events from the open input device.\n" +
      "Returns a MidiRecordingHandle when no duration is specified — call h.stop() to finish.\n" +
      "Returns a MidiSequencePromise when opts.duration is set, which resolves automatically.",
    params: [
      { name: "instrument", type: "MidiTargetInstrument", description: "Target instrument to associate with the recording." },
      { name: "opts.duration", type: "number", description: "Auto-stop after N seconds.", optional: true },
      { name: "opts.name", type: "string", description: "Name for the saved sequence.", optional: true },
    ],
    examples: [
      "const h = midi.record(keys)\nconst seq = h.stop()\nseq.play(keys)",
      "// Timed recording:\nconst seq = midi.record(keys, { duration: 4 })\nseq.play(keys)",
    ],
  },
  {
    name: "sequences",
    signature: "midi.sequences()",
    summary: "List saved sequences in the current project",
    description: "Returns all MIDI sequences saved in the current project.",
    examples: ["midi.sequences()"],
  },
  {
    name: "load",
    signature: "midi.load(filePath)",
    summary: "Import a .mid file as a sequence",
    description:
      "Import a Standard MIDI File (.mid) and return it as a MidiSequenceResult.\n" +
      "The imported sequence is transient — it is not auto-saved to the project.",
    params: [
      { name: "filePath", type: "string", description: "Absolute path to the .mid file." },
    ],
    examples: ["midi.load('~/beats/groove.mid')"],
  },
];

export function buildMidiNamespace(_deps: NamespaceDeps) {
  // Wire up playback-ended telemetry so seq.stop() state stays consistent.
  window.electron.onMidiPlaybackEnded?.(() => {
    // No-op for now; future transport integration can hook here.
  });

  const midi = {
    help: () => renderNamespaceHelp("midi", "MIDI recording and playback", midiCommands),

    devices: withHelp(
      async function devices(): Promise<MidiDevicesResult> {
        const devices = await window.electron.midiListInputs();
        return new MidiDevicesResult(devices);
      },
      midiCommands[0],
    ),

    open: withHelp(
      async function open(index: number): Promise<MidiDeviceResult> {
        const result = await window.electron.midiOpenInput(index);
        return new MidiDeviceResult(result.name);
      },
      midiCommands[1],
    ),

    close: withHelp(
      async function close(): Promise<BounceResult> {
        await window.electron.midiCloseInput();
        return new BounceResult("\x1b[90mMIDI input closed.\x1b[0m");
      },
      midiCommands[2],
    ),

    record: withHelp(
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
      async function sequences(): Promise<MidiSequencesResult> {
        const records = await window.electron.midiListSequences();
        return new MidiSequencesResult(records);
      },
      midiCommands[4],
    ),

    load: withHelp(
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
