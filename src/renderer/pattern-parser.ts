import { BounceError } from "../shared/bounce-error.js";

export interface CompiledStep {
  events: Array<{ note: number; velocity: number }>;
}

export interface CompiledPattern {
  channelIndex: number;  // -1 until .play() assigns it
  steps: CompiledStep[]; // always exactly 16 entries
}

export function velocityFromChar(ch: string): number {
  const code = ch.charCodeAt(0);
  let index: number;
  if (code >= 97 && code <= 122) {        // a-z → indices 0-25
    index = code - 97;
  } else if (code >= 65 && code <= 90) {  // A-Z → indices 26-51
    index = code - 65 + 26;
  } else {
    throw new BounceError("INVALID_VELOCITY_CHAR", `Invalid velocity character: '${ch}'`);
  }
  return Math.round(1 + (index / 51) * 126); // 1–127
}

export function parseMidiNote(name: string): number {
  // Format: [a-gA-G]'?[0-9]+
  // Examples: c4→60, c'4→61, a4→69, b'3→58
  const match = name.match(/^([a-gA-G])('?)(\d+)$/);
  if (!match) throw new BounceError("INVALID_NOTE_NAME", `Invalid note name: '${name}'`);
  const [, letter, sharp, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);
  const baseNotes: Record<string, number> = {
    c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11,
  };
  const base = baseNotes[letter.toLowerCase()];
  const semitone = base + (sharp === "'" ? 1 : 0);
  // MIDI: C-1=0, C0=12, C4=60
  const midi = (octave + 1) * 12 + semitone;
  if (midi < 0 || midi > 127) throw new BounceError("NOTE_OUT_OF_RANGE", `Note '${name}' out of MIDI range (0–127)`);
  return midi;
}

export function parsePattern(notation: string): CompiledPattern {
  const steps: CompiledStep[] = Array.from({ length: 16 }, () => ({ events: [] }));

  const lines = notation.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  for (const line of lines) {
    // Format: "NOTE = STEPS"
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) throw new BounceError("INVALID_PATTERN_LINE", `Invalid pattern line (missing '='): '${line}'`);

    const noteName = line.slice(0, eqIdx).trim();
    const stepsStr = line.slice(eqIdx + 1).trim();

    const note = parseMidiNote(noteName);

    // Extract non-whitespace characters as steps
    const chars = stepsStr.split("").filter(c => !/\s/.test(c));

    if (chars.length > 16) {
      throw new BounceError(
        "TOO_MANY_STEPS",
        `Pattern row '${noteName}' has ${chars.length} steps — expected at most 16`,
      );
    }

    // Pad to 16 with rests if fewer
    while (chars.length < 16) chars.push(".");

    for (let i = 0; i < 16; i++) {
      const ch = chars[i];
      if (ch !== ".") {
        const velocity = velocityFromChar(ch);
        steps[i].events.push({ note, velocity });
      }
    }
  }

  return { channelIndex: -1, steps };
}
