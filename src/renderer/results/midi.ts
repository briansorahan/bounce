import { attachMethodHelp } from "../help.js";
import { BounceResult } from "./base.js";
import type { MidiInputDevice as MidiInputDeviceRecord } from "../../shared/ipc-contract.js";
import { porcelainTypeHelps } from "./porcelain-types.generated.js";

const midiSequenceMethodHelps = porcelainTypeHelps.find(t => t.name === "MidiSequence")?.methods ?? [];
const midiRecordingHandleMethodHelps = porcelainTypeHelps.find(t => t.name === "MidiRecordingHandle")?.methods ?? [];

// Re-export for convenience
export type { MidiInputDeviceRecord };

// ---------------------------------------------------------------------------
// Instrument duck-type accepted by record() and play()
// ---------------------------------------------------------------------------
export interface MidiTargetInstrument {
  instrumentId: string;
  name?: string;
}

// ---------------------------------------------------------------------------
// MidiDevicesResult — returned by midi.devices()
// ---------------------------------------------------------------------------
export class MidiDevicesResult extends BounceResult {
  constructor(public readonly devices: MidiInputDeviceRecord[]) {
    super(MidiDevicesResult.format(devices));
  }

  private static format(devices: MidiInputDeviceRecord[]): string {
    if (devices.length === 0) {
      return "\x1b[33mNo MIDI input devices found.\x1b[0m";
    }
    const lines = ["\x1b[1;36mMIDI Input Devices\x1b[0m", ""];
    for (const d of devices) {
      lines.push(`  ${d.index}  ${d.name}`);
    }
    return lines.join("\n");
  }

  help(): BounceResult {
    return new BounceResult(
      [
        "\x1b[1;36mmidi.devices()\x1b[0m",
        "",
        "  List available MIDI input devices.",
        "",
        "  \x1b[90mExample:\x1b[0m  midi.devices()",
        "           midi.open(0)",
      ].join("\n"),
    );
  }
}

// ---------------------------------------------------------------------------
// MidiDeviceResult — returned by midi.open()
// ---------------------------------------------------------------------------
export class MidiDeviceResult extends BounceResult {
  constructor(public readonly portName: string) {
    super(
      [
        `\x1b[1;36mMIDI Input\x1b[0m · \x1b[1m${portName}\x1b[0m · \x1b[32mconnected\x1b[0m`,
        "",
        `  \x1b[90mmidi.record(instrument)\x1b[0m  start recording`,
        `  \x1b[90mmidi.close()\x1b[0m             close device`,
      ].join("\n"),
    );
  }

  help(): BounceResult {
    return new BounceResult(
      [
        `\x1b[1;36mMidiDevice: ${this.portName}\x1b[0m`,
        "",
        "  An open MIDI input device. Incoming notes are routed to the target instrument",
        "  while recording is active.",
        "",
        "  \x1b[90mmidi.record(instrument)\x1b[0m  start recording with live-through",
        "  \x1b[90mmidi.record(instrument, { duration: 4 })\x1b[0m  record 4 seconds",
        "  \x1b[90mmidi.close()\x1b[0m              close this device",
      ].join("\n"),
    );
  }
}

// ---------------------------------------------------------------------------
// MidiSequenceResult — returned by h.stop() or midi.load()
// ---------------------------------------------------------------------------
export class MidiSequenceResult extends BounceResult {
  constructor(
    public readonly id: number,
    public readonly name: string,
    public readonly durationMs: number,
    public readonly eventCount: number,
    public readonly channels: number[],
  ) {
    super(
      [
        `\x1b[1;36mMidiSequence\x1b[0m · \x1b[1m"${name}"\x1b[0m`,
        `  Events     ${eventCount}`,
        `  Duration   ${(durationMs / 1000).toFixed(2)}s`,
        `  Channels   ${channels.length > 0 ? channels.join(", ") : "—"}`,
        "",
        `  \x1b[90mseq.play(instrument)\x1b[0m   play through instrument`,
        `  \x1b[90mseq.stop()\x1b[0m             stop playback`,
      ].join("\n"),
    );
    attachMethodHelp(this, "MidiSequence", midiSequenceMethodHelps);
  }

  play(inst: MidiTargetInstrument): MidiSequencePromise {
    return new MidiSequencePromise(
      window.electron.midiStartPlayback(this.id, inst.instrumentId).then(() => this),
    );
  }

  stop(): Promise<BounceResult> {
    return window.electron.midiStopPlayback().then(
      () => new BounceResult("\x1b[90mPlayback stopped.\x1b[0m"),
    );
  }

  help(): BounceResult {
    return new BounceResult(
      [
        `\x1b[1;36mMidiSequence\x1b[0m · "${this.name}"`,
        "",
        "  A recorded or imported MIDI sequence.",
        "",
        "  \x1b[90mseq.play(instrument)\x1b[0m   play back through a sampler instrument",
        "  \x1b[90mseq.stop()\x1b[0m             stop playback",
        "",
        "  Properties:",
        `    \x1b[33mid\x1b[0m          ${this.id}`,
        `    \x1b[33mname\x1b[0m        "${this.name}"`,
        `    \x1b[33mdurationMs\x1b[0m  ${this.durationMs.toFixed(1)}`,
        `    \x1b[33meventCount\x1b[0m  ${this.eventCount}`,
        `    \x1b[33mchannels\x1b[0m    [${this.channels.join(", ")}]`,
      ].join("\n"),
    );
  }
}

// ---------------------------------------------------------------------------
// MidiSequencePromise — thenable wrapper enabling await-less REPL chaining
// ---------------------------------------------------------------------------
export class MidiSequencePromise implements PromiseLike<MidiSequenceResult> {
  constructor(protected readonly promise: Promise<MidiSequenceResult>) {}

  then<TResult1 = MidiSequenceResult, TResult2 = never>(
    onfulfilled?: ((value: MidiSequenceResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<MidiSequenceResult | TResult> {
    return this.promise.catch(onrejected);
  }

  play(inst: MidiTargetInstrument): MidiSequencePromise {
    return new MidiSequencePromise(this.promise.then((seq) => seq.play(inst)));
  }

  stop(): Promise<BounceResult> {
    return this.promise.then((seq) => seq.stop());
  }

  help(): Promise<BounceResult> {
    return this.promise.then((seq) => seq.help());
  }
}

// ---------------------------------------------------------------------------
// MidiRecordingHandleResult — returned by midi.record(inst) without a duration.
// Not PromiseLike — stores without blocking the REPL.
// ---------------------------------------------------------------------------
export class MidiRecordingHandleResult extends BounceResult {
  constructor(
    private readonly instrumentName: string,
    private readonly stopFn: () => Promise<MidiSequenceResult>,
  ) {
    super(
      [
        `\x1b[31m⏺ MIDI Recording\x1b[0m · \x1b[1m${instrumentName}\x1b[0m · in progress`,
        "",
        `  \x1b[90mh.stop()\x1b[0m  finish recording and get a MidiSequence`,
      ].join("\n"),
    );
    attachMethodHelp(this, "MidiRecordingHandle", midiRecordingHandleMethodHelps);
  }

  stop(): MidiSequencePromise {
    return new MidiSequencePromise(this.stopFn());
  }

  help(): BounceResult {
    return new BounceResult(
      [
        "\x1b[1;36mMidiRecordingHandle\x1b[0m",
        "",
        "  A handle to an active MIDI recording session.",
        "  Incoming notes are routed live to the target instrument while recording.",
        "",
        `  \x1b[90mh.stop()\x1b[0m  stop recording and return a MidiSequencePromise`,
        "",
        "  To record for a fixed duration (returns MidiSequence directly):",
        `  \x1b[90mmidi.record(inst, { duration: 4 })\x1b[0m`,
      ].join("\n"),
    );
  }
}

// ---------------------------------------------------------------------------
// MidiSequencesResult — returned by midi.sequences()
// ---------------------------------------------------------------------------
export class MidiSequencesResult extends BounceResult {
  constructor(
    public readonly sequences: Array<{
      id: number;
      name: string;
      duration_ms: number;
      event_count: number;
    }>,
  ) {
    super(MidiSequencesResult.format(sequences));
  }

  private static format(
    sequences: Array<{ id: number; name: string; duration_ms: number; event_count: number }>,
  ): string {
    if (sequences.length === 0) {
      return "\x1b[33mNo MIDI sequences in current project.\x1b[0m";
    }
    const lines = ["\x1b[1;36mMIDI Sequences\x1b[0m  (current project)", ""];
    for (const s of sequences) {
      const dur = `${(s.duration_ms / 1000).toFixed(1)}s`.padEnd(8);
      lines.push(`  \x1b[1m${s.name}\x1b[0m  ${String(s.event_count).padEnd(6)} events  ${dur}`);
    }
    return lines.join("\n");
  }

  help(): BounceResult {
    return new BounceResult(
      [
        "\x1b[1;36mmidi.sequences()\x1b[0m",
        "",
        "  List all MIDI sequences saved in the current project.",
        "",
        "  \x1b[90mExample:\x1b[0m  const seqs = midi.sequences()",
        "           const s = midi.load('take-1')",
        "           s.play(instrument)",
      ].join("\n"),
    );
  }
}
