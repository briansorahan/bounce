import * as assert from "assert";
import { parseMidiNote, velocityFromChar, parsePattern } from "./renderer/pattern-parser.js";

// ---------------------------------------------------------------------------
// parseMidiNote
// ---------------------------------------------------------------------------

function testParseMidiNote() {
  assert.strictEqual(parseMidiNote("c4"), 60, "c4 → 60");
  assert.strictEqual(parseMidiNote("c'4"), 61, "c'4 → 61");
  assert.strictEqual(parseMidiNote("a4"), 69, "a4 → 69");
  assert.strictEqual(parseMidiNote("c0"), 12, "c0 → 12");
  assert.strictEqual(parseMidiNote("b'3"), 48 + 12, "b'3 → 60"); // B#3 = C4 = 60

  // Invalid names throw
  assert.throws(() => parseMidiNote("x4"), /Invalid note name/, "invalid letter throws");
  assert.throws(() => parseMidiNote("c"), /Invalid note name/, "missing octave throws");
  assert.throws(() => parseMidiNote(""), /Invalid note name/, "empty string throws");

  console.log("  parseMidiNote: all tests passed");
}

// ---------------------------------------------------------------------------
// velocityFromChar
// ---------------------------------------------------------------------------

function testVelocityFromChar() {
  assert.strictEqual(velocityFromChar("a"), 1, "a → 1");
  assert.strictEqual(velocityFromChar("Z"), 127, "Z → 127");

  // Invalid characters throw
  assert.throws(() => velocityFromChar("."), /Invalid velocity character/, ". throws");
  assert.throws(() => velocityFromChar("1"), /Invalid velocity character/, "digit throws");

  console.log("  velocityFromChar: all tests passed");
}

// ---------------------------------------------------------------------------
// parsePattern
// ---------------------------------------------------------------------------

function testParsePattern() {
  // Single-row input
  const p1 = parsePattern("c4 = a . . . a . . . a . . . a . . .");
  assert.strictEqual(p1.steps.length, 16, "single row has 16 steps");
  assert.strictEqual(p1.channelIndex, -1, "channelIndex starts at -1");
  assert.strictEqual(p1.steps[0].events.length, 1, "step 0 has event");
  assert.strictEqual(p1.steps[0].events[0].note, 60, "step 0 note is c4=60");
  assert.strictEqual(p1.steps[0].events[0].velocity, 1, "step 0 velocity from 'a'");
  assert.strictEqual(p1.steps[1].events.length, 0, "step 1 is rest");

  // Multi-row input
  const p2 = parsePattern([
    "c4 = a . . . a . . . a . . . a . . .",
    "e4 = . . a . . . a . . . a . . . a .",
  ].join("\n"));
  assert.strictEqual(p2.steps.length, 16, "multi-row has 16 steps");
  assert.strictEqual(p2.steps[0].events.length, 1, "step 0 has c4 event only");
  assert.strictEqual(p2.steps[2].events.length, 1, "step 2 has e4 event");
  assert.strictEqual(p2.steps[2].events[0].note, 64, "step 2 note is e4=64");

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

  console.log("  parsePattern: all tests passed");
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

function main() {
  console.log("pattern-parser tests");
  testParseMidiNote();
  testVelocityFromChar();
  testParsePattern();
  console.log("All pattern-parser tests passed ✓");
}

main();
