import { BounceResult } from "../results/base.js";
import {
  MidiDevicesResult,
  MidiDeviceResult,
  MidiRecordingHandleResult,
  MidiSequenceResult,
  MidiSequencePromise,
  MidiSequencesResult,
  type MidiTargetInstrument,
} from "../results/midi.js";
import type { NamespaceDeps } from "./types.js";
import { namespace, describe, param } from "../../shared/repl-registry.js";
import { midiCommands } from "./midi-commands.generated.js";
export { midiCommands } from "./midi-commands.generated.js";

export interface MidiRecordOptions {
  duration?: number;
  name?: string;
}

@namespace("midi", { summary: "MIDI recording and playback" })
export class MidiNamespace {
  /** Namespace summary — used by the globals help() function. */
  readonly description = "MIDI recording and playback";

  private sequenceNameCounter = 1;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_deps: NamespaceDeps) {
    // Wire up playback-ended telemetry so seq.stop() state stays consistent.
    window.electron.onMidiPlaybackEnded?.(() => {
      // No-op for now; future transport integration can hook here.
    });
  }

  // ── Injected by @namespace decorator — do not implement manually ──────────

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  help(): unknown {
    // Replaced at class definition time by the @namespace decorator.
    return undefined;
  }

  toString(): string {
    return String(this.help());
  }

  // ── Public REPL-facing methods ────────────────────────────────────────────

  @describe({
    summary: "List available MIDI input devices on the system.",
    returns: "MidiDevicesResult",
  })
  async devices(): Promise<MidiDevicesResult> {
    const devices = await window.electron.midiListInputs();
    return new MidiDevicesResult(devices);
  }

  @describe({
    summary: "Open the MIDI input device at the given index (from midi.devices()). Only one device can be open at a time.",
    returns: "MidiDeviceResult",
  })
  @param("index", { summary: "Device index from midi.devices().", kind: "plain" })
  async open(index: number): Promise<MidiDeviceResult> {
    const result = await window.electron.midiOpenInput(index);
    return new MidiDeviceResult(result.name);
  }

  @describe({
    summary: "Close the currently open MIDI input device.",
    returns: "BounceResult",
  })
  async close(): Promise<BounceResult> {
    await window.electron.midiCloseInput();
    return new BounceResult("\x1b[90mMIDI input closed.\x1b[0m");
  }

  @describe({
    summary: "Start MIDI recording. Returns a handle (call h.stop()) or a timed MidiSequencePromise when opts.duration is set.",
    returns: "MidiRecordingHandle",
  })
  @param("inst", {
    summary: "Target instrument to associate with the recording.",
    kind: "typed",
    expectedType: "InstrumentResult",
  })
  @param("opts", {
    summary: "Recording options: { duration?: number, name?: string }.",
    kind: "plain",
  })
  record(
    inst: MidiTargetInstrument,
    opts?: MidiRecordOptions,
  ): MidiRecordingHandleResult | MidiSequencePromise {
    const instrName = inst.name ?? inst.instrumentId;
    const sequenceName = opts?.name ?? this.generateSequenceName();

    window.electron.midiStartRecording(inst.instrumentId).catch((err: unknown) => {
      console.error("[midi] Failed to start recording:", err);
    });

    const stopAndSave = async (): Promise<MidiSequenceResult> => {
      const events = await window.electron.midiStopRecording();
      const durationMs = events.length > 0 ? events[events.length - 1].timestampMs : 0;
      const record = await window.electron.midiSaveSequence(sequenceName, events, durationMs);
      return new MidiSequenceResult(
        record.id,
        record.name,
        record.duration_ms,
        record.event_count,
        this.channelsFromEvents(events),
      );
    };

    if (opts?.duration !== undefined) {
      const duration = opts.duration;
      return new MidiSequencePromise(
        new Promise<MidiSequenceResult>((resolve, reject) => {
          setTimeout(() => { stopAndSave().then(resolve, reject); }, duration * 1000);
        }),
      );
    }

    return new MidiRecordingHandleResult(instrName, stopAndSave);
  }

  @describe({
    summary: "List all MIDI sequences saved in the current project.",
    returns: "MidiSequencesResult",
  })
  async sequences(): Promise<MidiSequencesResult> {
    const records = await window.electron.midiListSequences();
    return new MidiSequencesResult(records);
  }

  @describe({
    summary: "Import a .mid file as a transient MidiSequenceResult (not auto-saved to the project).",
    returns: "MidiSequence",
  })
  @param("filePath", {
    summary: "Absolute path to the .mid file.",
    kind: "filePath",
  })
  async load(filePath: string): Promise<MidiSequenceResult> {
    const result = await window.electron.midiLoadFile(filePath);
    const channels = this.channelsFromEvents(result.events as Array<{ channel: number }>);
    const name = filePath.split("/").pop()?.replace(/\.mid$/i, "") ?? "imported";
    return new MidiSequenceResult(-1, name, result.durationMs, result.events.length, channels);
  }

  // Test-only helper exposed on the namespace for Playwright tests.
  @describe({ summary: "Inject a raw MIDI event for testing.", visibility: "plumbing" })
  @param("status", { summary: "MIDI status byte.", kind: "plain" })
  @param("data1", { summary: "MIDI data byte 1.", kind: "plain" })
  @param("data2", { summary: "MIDI data byte 2.", kind: "plain" })
  __injectEvent(status: number, data1: number, data2: number): Promise<void> {
    return window.electron.midiInjectEvent(status, data1, data2);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private generateSequenceName(): string {
    return `seq-${this.sequenceNameCounter++}`;
  }

  private channelsFromEvents(events: Array<{ channel: number }>): number[] {
    return [...new Set(events.map((e) => e.channel))].sort((a, b) => a - b);
  }
}

/** @deprecated Use `new MidiNamespace(deps)` directly. Kept for backward compatibility. */
export function buildMidiNamespace(deps: NamespaceDeps): { midi: MidiNamespace } {
  return { midi: new MidiNamespace(deps) };
}

// Re-export commands array for any consumers of the old JSDoc-generated metadata.
export { midiCommands as midiNamespaceCommands };
