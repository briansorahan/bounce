import { test } from "vitest";
import * as assert from "assert";
import { parseMidiNote, velocityFromChar, parsePattern } from "./renderer/pattern-parser.js";

// ---------------------------------------------------------------------------
// parseMidiNote
// ---------------------------------------------------------------------------

test("parseMidiNote", () => {
  assert.strictEqual(parseMidiNote("c4"), 60, "c4 → 60");
  assert.strictEqual(parseMidiNote("C4"), 60, "C4 → 60 (case insensitive)");
  assert.strictEqual(parseMidiNote("c'4"), 61, "c'4 → 61 (C#4)");
  assert.strictEqual(parseMidiNote("d4"), 62, "d4 → 62");
  assert.strictEqual(parseMidiNote("e4"), 64, "e4 → 64");
  assert.strictEqual(parseMidiNote("f4"), 65, "f4 → 65");
  assert.strictEqual(parseMidiNote("g4"), 67, "g4 → 67");
  assert.strictEqual(parseMidiNote("a4"), 69, "a4 → 69");
  assert.strictEqual(parseMidiNote("b4"), 71, "b4 → 71");
  assert.strictEqual(parseMidiNote("c0"), 12, "c0 → 12");
  assert.strictEqual(parseMidiNote("b'3"), 48 + 12, "b'3 → 60"); // B#3 = C4 = 60
  assert.strictEqual(parseMidiNote("b3"), 59, "b3 → 59");
  assert.strictEqual(parseMidiNote("c5"), 72, "c5 → 72 (octave boundary)");
  assert.strictEqual(parseMidiNote("g9"), 127, "g9 → 127 (MIDI max)");

  // Out-of-range throws
  assert.throws(() => parseMidiNote("g'9"), /out of MIDI range/, "G#9=128 out of range");

  // Invalid names throw
  assert.throws(() => parseMidiNote("h4"), /Invalid note name/, "invalid letter throws");
  assert.throws(() => parseMidiNote("x4"), /Invalid note name/, "invalid letter throws");
  assert.throws(() => parseMidiNote("c"), /Invalid note name/, "missing octave throws");
  assert.throws(() => parseMidiNote("4c"), /Invalid note name/, "wrong order throws");
  assert.throws(() => parseMidiNote("cc4"), /Invalid note name/, "double letter throws");
  assert.throws(() => parseMidiNote(""), /Invalid note name/, "empty string throws");
});

// ---------------------------------------------------------------------------
// velocityFromChar
// ---------------------------------------------------------------------------

test("velocityFromChar", () => {
  // Boundary values
  assert.strictEqual(velocityFromChar("a"), 1, "a → 1 (minimum)");
  assert.strictEqual(velocityFromChar("Z"), 127, "Z → 127 (maximum)");

  // Lowercase z is between 1 and 127
  const zVel = velocityFromChar("z");
  assert.ok(zVel > 1 && zVel < 127, `z velocity (${zVel}) must be in (1,127)`);

  // Uppercase A is above lowercase z (indices 26 > 25)
  assert.ok(velocityFromChar("A") > velocityFromChar("z"), "A > z in velocity");

  // Monotonically increasing through a-z then A-Z
  let prev = 0;
  for (const ch of "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const v = velocityFromChar(ch);
    assert.ok(v > prev, `'${ch}' must be monotonically increasing`);
    prev = v;
  }

  // Invalid characters throw
  assert.throws(() => velocityFromChar("."), /Invalid velocity character/, ". throws");
  assert.throws(() => velocityFromChar("1"), /Invalid velocity character/, "digit throws");
  assert.throws(() => velocityFromChar(" "), /Invalid velocity character/, "space throws");
  assert.throws(() => velocityFromChar("!"), /Invalid velocity character/, "! throws");
});

// ---------------------------------------------------------------------------
// parsePattern
// ---------------------------------------------------------------------------

test("parsePattern", () => {
  // Empty string → 16 empty steps
  const empty = parsePattern("");
  assert.strictEqual(empty.steps.length, 16, "empty string → 16 steps");
  assert.ok(empty.steps.every(s => s.events.length === 0), "empty string → all steps empty");
  assert.strictEqual(empty.channelIndex, -1, "channelIndex starts at -1");

  // All-dot row → 16 empty steps
  const allDots = parsePattern("c4 = . . . . . . . . . . . . . . . .");
  assert.ok(allDots.steps.every(s => s.events.length === 0), "all-dot row → all steps empty");

  // Single-row input
  const p1 = parsePattern("c4 = a . . . a . . . a . . . a . . .");
  assert.strictEqual(p1.steps.length, 16, "single row has 16 steps");
  assert.strictEqual(p1.channelIndex, -1, "channelIndex starts at -1");
  assert.strictEqual(p1.steps[0].events.length, 1, "step 0 has event");
  assert.strictEqual(p1.steps[0].events[0].note, 60, "step 0 note is c4=60");
  assert.strictEqual(p1.steps[0].events[0].velocity, 1, "step 0 velocity from 'a'");
  assert.strictEqual(p1.steps[1].events.length, 0, "step 1 is rest");

  // Fewer than 16 chars → pads to 16 steps
  const short = parsePattern("c4 = a");
  assert.strictEqual(short.steps.length, 16, "short row pads to 16 steps");
  assert.strictEqual(short.steps[0].events.length, 1, "padded: step 0 has event");
  for (let i = 1; i < 16; i++) {
    assert.strictEqual(short.steps[i].events.length, 0, `padded: step ${i} is empty`);
  }

  // Maximum velocity character
  const maxVel = parsePattern("a4 = Z . . . . . . . . . . . . . . .");
  assert.strictEqual(maxVel.steps[0].events[0].velocity, 127, "'Z' → velocity 127");

  // Multi-row input
  const p2 = parsePattern([
    "c4 = a . . . a . . . a . . . a . . .",
    "e4 = . . a . . . a . . . a . . . a .",
  ].join("\n"));
  assert.strictEqual(p2.steps.length, 16, "multi-row has 16 steps");
  assert.strictEqual(p2.steps[0].events.length, 1, "step 0 has c4 event only");
  assert.strictEqual(p2.steps[2].events.length, 1, "step 2 has e4 event");
  assert.strictEqual(p2.steps[2].events[0].note, 64, "step 2 note is e4=64");

  // Two notes on same step → chord (2 events)
  const chord = parsePattern([
    "c4 = a . . . . . . . . . . . . . . .",
    "e4 = a . . . . . . . . . . . . . . .",
  ].join("\n"));
  assert.strictEqual(chord.steps[0].events.length, 2, "step 0 is a chord with 2 events");
  const chordNotes = chord.steps[0].events.map(e => e.note).sort((a, b) => a - b);
  assert.deepStrictEqual(chordNotes, [60, 64], "chord contains c4 and e4");

  // Blank lines and leading/trailing whitespace are ignored
  const withBlanks = parsePattern("\n\n  \nc4 = a . . . . . . . . . . . . . . .\n\n");
  assert.strictEqual(withBlanks.steps[0].events.length, 1, "blank lines are ignored");

  // >16 steps throws
  assert.throws(
    () => parsePattern("c4 = a a a a a a a a a a a a a a a a a"),
    /17 steps/,
    ">16 steps throws",
  );

  // Missing '=' throws
  assert.throws(
    () => parsePattern("c4 a . . ."),
    /missing '='/,
    "missing = throws",
  );

  // Invalid note name throws
  assert.throws(
    () => parsePattern("h4 = a . . . . . . . . . . . . . . ."),
    /Invalid note name/,
    "invalid note name throws",
  );

  // Invalid velocity character in step data throws
  assert.throws(
    () => parsePattern("c4 = 1 . . . . . . . . . . . . . . ."),
    /Invalid velocity character/,
    "invalid velocity char throws",
  );
});
