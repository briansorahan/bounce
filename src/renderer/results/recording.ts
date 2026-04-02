import { attachMethodHelp } from "../help.js";
import { BounceResult } from "./base.js";
import { SamplePromise, type SampleResult } from "./sample.js";
import { porcelainTypeHelps } from "./porcelain-types.generated.js";

const audioDeviceMethodHelps = porcelainTypeHelps.find(t => t.name === "AudioDevice")?.methods ?? [];
const recordingHandleMethodHelps = porcelainTypeHelps.find(t => t.name === "RecordingHandle")?.methods ?? [];

/** A single audio input device as seen by the REPL. */
export interface AudioInputDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

/** Options for mic.record(). */
export interface RecordOptions {
  duration?: number;
  overwrite?: boolean;
}

/** Bindings injected into AudioDeviceResult from bounce-api. */
export interface AudioDeviceBindings {
  record: (sampleId: string, opts?: RecordOptions) => Promise<RecordingHandleResult> | SamplePromise;
}

/**
 * REPL object returned by sn.dev(index). Represents an audio input device.
 */
export class AudioDeviceResult extends BounceResult {
  constructor(
    public readonly index: number,
    public readonly deviceId: string,
    public readonly label: string,
    public readonly channels: number,
    private readonly bindings: AudioDeviceBindings,
  ) {
    super(
      [
        `\x1b[1;36mAudioDevice [${index}]: ${label}\x1b[0m`,
        "",
        `  deviceId  \x1b[90m${deviceId.substring(0, 16)}…\x1b[0m  · ${channels}ch`,
        "",
        `  \x1b[90mrecord(sampleId)           — start recording\x1b[0m`,
        `  \x1b[90mrecord(sampleId, {duration: N})  — record for N seconds\x1b[0m`,
      ].join("\n"),
    );
    attachMethodHelp(this, "AudioDevice", audioDeviceMethodHelps);
  }

  record(sampleId: string, opts?: RecordOptions): Promise<RecordingHandleResult> | SamplePromise {
    return this.bindings.record(sampleId, opts);
  }

  help(): BounceResult {
    return new BounceResult(
      [
        `\x1b[1;36mAudioDevice [${this.index}]: ${this.label}\x1b[0m`,
        "",
        "  Start recording audio from this device:",
        "",
        `  \x1b[90mconst h = mic.record("my-take")\x1b[0m   — start recording`,
        `  \x1b[90mh.stop()\x1b[0m                           — stop recording, returns SampleResult`,
        "",
        `  \x1b[90mmic.record("my-take", { duration: 5 })\x1b[0m  — record 5 seconds, returns SampleResult`,
        "",
        "  Options:",
        `    \x1b[33mduration\x1b[0m   Number of seconds to record before auto-stopping.`,
        `    \x1b[33moverwrite\x1b[0m  If true, replace an existing sample with the same name.`,
        "",
        "  The SampleResult returned is identical to sn.read() — all analysis methods apply.",
      ].join("\n"),
    );
  }
}

/**
 * REPL object returned by mic.record(sampleId) (no duration).
 * Holds a reference to the active MediaRecorder; call stop() to end recording
 * and get back a SamplePromise.
 * Not PromiseLike — assignment stores the handle without blocking.
 */
export class RecordingHandleResult extends BounceResult {
  constructor(
    private readonly deviceLabel: string,
    private readonly stopFn: () => void,
    private readonly promise: Promise<SampleResult>,
  ) {
    super(
      [
        `\x1b[31m⏺ Recording\x1b[0m · \x1b[1m${deviceLabel}\x1b[0m · in progress`,
        "",
        `  \x1b[90mh.stop()\x1b[0m to finish recording and get a SampleResult`,
      ].join("\n"),
    );
    attachMethodHelp(this, "RecordingHandle", recordingHandleMethodHelps);
  }

  stop(): SamplePromise {
    this.stopFn();
    return new SamplePromise(this.promise);
  }

  help(): BounceResult {
    return new BounceResult(
      [
        "\x1b[1;36mRecordingHandle\x1b[0m",
        "",
        "  A handle to an active recording session.",
        "  The recording continues until you call stop() or the device is released.",
        "",
        `  \x1b[90mh.stop()\x1b[0m — stop recording and return a SamplePromise that resolves to SampleResult`,
        "",
        "  To record for a fixed duration (returns SampleResult directly, no handle needed):",
        `  \x1b[90mmic.record("take", { duration: 5 })\x1b[0m`,
      ].join("\n"),
    );
  }
}

/**
 * REPL object returned by sn.inputs(). Displays a numbered table of audio inputs.
 */
export class InputsResult extends BounceResult {
  constructor(public readonly devices: AudioInputDevice[]) {
    super(InputsResult.format(devices));
  }

  private static format(devices: AudioInputDevice[]): string {
    if (devices.length === 0) {
      return "\x1b[33mNo audio input devices found.\x1b[0m";
    }
    const lines = ["\x1b[1;36mAvailable audio inputs:\x1b[0m", ""];
    for (let i = 0; i < devices.length; i++) {
      const label = devices[i].label || "[unlabeled]";
      lines.push(`  [${i}]  ${label}`);
    }
    return lines.join("\n");
  }

  help(): BounceResult {
    return new BounceResult(
      [
        "\x1b[1;36msn.inputs()\x1b[0m",
        "",
        "  List all available audio input devices.",
        "  Triggers a microphone permission request on first call.",
        "",
        "  \x1b[90mExample:\x1b[0m  sn.inputs()",
        "           sn.dev(0)",
        "           const mic = sn.dev(0)",
        "           const h = mic.record(\"take1\")",
        "           const samp = h.stop()",
        "           vis.waveform(samp).show()",
      ].join("\n"),
    );
  }
}
