/// <reference path="../types.d.ts" />
import { attachMethodHelpFromRegistry } from "../help.js";
import { BounceResult } from "./base.js";
import type { CompiledPattern } from "../pattern-parser.js";
import { replType, describe, param } from "../../shared/repl-registry.js";

@replType("Pattern", { summary: "A compiled X0X step-sequencer pattern" })
export class PatternResult extends BounceResult {
  private readonly notation: string;
  private readonly compiled: CompiledPattern;

  constructor(notation: string, compiled: CompiledPattern) {
    super(""); // overridden by toString()
    this.notation = notation;
    this.compiled = compiled;
    attachMethodHelpFromRegistry(this, "Pattern");
  }

  @describe({ summary: "Start playing on mixer channel N (1–8).", returns: "BounceResult" })
  @param("channel", { summary: "Mixer channel 1–8.", kind: "plain" })
  play(channel: number): BounceResult {
    if (channel < 1 || channel > 8) {
      return new BounceResult(`\x1b[31mChannel must be 1–8 (got ${channel})\x1b[0m`);
    }
    this.compiled.channelIndex = channel - 1; // convert to 0-indexed
    const stepsJson = JSON.stringify(this.compiled.steps);
    window.electron.transportSetPattern(channel - 1, stepsJson);
    return new BounceResult(`PatternResult playing on channel ${channel}  bar: next`);
  }

  @describe({ summary: "Stop the pattern on its mixer channel.", returns: "BounceResult" })
  stop(): BounceResult {
    if (this.compiled.channelIndex >= 0) {
      window.electron.transportClearPattern(this.compiled.channelIndex);
    }
    return new BounceResult("PatternResult stopped");
  }

  help(): BounceResult {
    return new BounceResult(
      `PatternResult — a compiled X0X step pattern\n` +
      `  p.play(1)     start playing on mixer channel 1 (1–8)\n` +
      `  p.stop()      stop the pattern on that channel\n` +
      `  p.help()      show this message\n` +
      `\nNotation guide:\n` +
      `  Each line: NOTE = STEPS   (16 non-whitespace chars)\n` +
      `  NOTE: c4, c'4 (sharp), a4, etc.\n` +
      `  STEPS: . = rest, a-z = soft (vel 1–50), A-Z = loud (vel 51–127)\n` +
      `\nexample:\n` +
      `  pat.xox(\`\n` +
      `    c4 = a . . . a . . . a . . . a . . .\n` +
      `    e4 = . . a . . . a . . . a . . . a .\n` +
      `  \`).play(1)`,
    );
  }

  toString(): string {
    // Build ASCII grid — collect unique notes from all steps
    const noteEvents = new Map<number, string[]>(); // note → 16 chars
    const noteNames = new Map<number, string>();

    for (let step = 0; step < 16; step++) {
      for (const ev of this.compiled.steps[step].events) {
        if (!noteEvents.has(ev.note)) {
          noteEvents.set(ev.note, Array(16).fill("."));
          noteNames.set(ev.note, midiToNoteName(ev.note));
        }
        const chars = noteEvents.get(ev.note)!;
        chars[step] = velocityToChar(ev.velocity);
      }
    }

    const noteCount = noteEvents.size;
    let out = `PatternResult  steps: 16  notes: ${noteCount}\n`;
    for (const [note, chars] of noteEvents) {
      const name = noteNames.get(note)!.padEnd(4);
      out += `  ${name}  ${chars.join(" ")}\n`;
    }
    out += `play: p.play(1)   stop: p.stop()   help: p.help()`;
    return out;
  }
}

function midiToNoteName(midi: number): string {
  const notes = ["c", "c'", "d", "d'", "e", "f", "f'", "g", "g'", "a", "a'", "b"];
  const octave = Math.floor(midi / 12) - 1;
  return notes[midi % 12] + octave;
}

function velocityToChar(velocity: number): string {
  // Reverse of velocityFromChar: map 1–127 back to a-z / A-Z
  const index = Math.round((velocity - 1) / 126 * 51);
  if (index < 26) return String.fromCharCode(97 + index); // a-z
  return String.fromCharCode(65 + (index - 26));          // A-Z
}
