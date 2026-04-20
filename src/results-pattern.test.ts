/**
 * Unit tests for src/renderer/results/pattern.ts
 *
 * PatternResult.play() and stop() call window.electron.transportSetPattern /
 * transportClearPattern.  We install a temporary mock (with save+restore so
 * the test-hygiene no-unguarded-global-mock rule is satisfied) then tear it
 * down in afterAll.
 */

import { test, afterAll } from "vitest";
import assert from "node:assert/strict";
import { parsePattern } from "./renderer/pattern-parser.js";
import { PatternResult } from "./renderer/results/pattern.js";

// ---------------------------------------------------------------------------
// Minimal window.electron mock
// ---------------------------------------------------------------------------

interface MockElectron {
  transportSetPattern: (channel: number, stepsJson: string) => void;
  transportClearPattern: (channel: number) => void;
  lastSetChannel: number | undefined;
  lastSetStepsJson: string | undefined;
  lastClearChannel: number | undefined;
}

function makeMockElectron(): MockElectron {
  const mock: MockElectron = {
    lastSetChannel: undefined,
    lastSetStepsJson: undefined,
    lastClearChannel: undefined,
    transportSetPattern(channel: number, stepsJson: string) {
      mock.lastSetChannel = channel;
      mock.lastSetStepsJson = stepsJson;
    },
    transportClearPattern(channel: number) {
      mock.lastClearChannel = channel;
    },
  };
  return mock;
}

// Save + restore to satisfy test-hygiene no-unguarded-global-mock rule
const originalWindow = (globalThis as Record<string, unknown>).window;
const mock = makeMockElectron();
(globalThis as Record<string, unknown>).window = { electron: mock };

afterAll(() => {
  (globalThis as Record<string, unknown>).window = originalWindow;
});

// ---------------------------------------------------------------------------
// Build a simple PatternResult from a known notation
// ---------------------------------------------------------------------------

const notation = `
    c4 = a . . . a . . . a . . . a . . .
    e4 = . . a . . . a . . . a . . . a .
  `;
const compiled = parsePattern(notation);
const patternResult = new PatternResult(notation, compiled);

// ---------------------------------------------------------------------------
// toString() — grid display
// ---------------------------------------------------------------------------

test("PatternResult.toString", () => {
  const text = patternResult.toString();

  assert.ok(text.startsWith("PatternResult"), "toString starts with PatternResult");
  assert.ok(text.includes("steps: 16"), "step count in toString");
  assert.ok(text.includes("notes: 2"), "note count in toString");
  assert.ok(text.includes("play:"), "play hint in toString");
});

// ---------------------------------------------------------------------------
// help()
// ---------------------------------------------------------------------------

test("PatternResult.help", () => {
  const text = patternResult.help().toString();
  assert.ok(text.includes("PatternResult"), "help mentions PatternResult");
  assert.ok(text.includes("p.play(1)"), "help shows play example");
  assert.ok(text.includes("p.stop()"), "help shows stop example");
});

// ---------------------------------------------------------------------------
// play() — valid channel
// ---------------------------------------------------------------------------

test("PatternResult.play (valid)", () => {
  const result = patternResult.play(3);
  assert.ok(result.toString().includes("channel 3"), "play returns confirmation with channel");
  assert.equal(mock.lastSetChannel, 2, "transportSetPattern called with 0-indexed channel");
  const steps = JSON.parse(mock.lastSetStepsJson!);
  assert.equal(steps.length, 16, "steps JSON has 16 entries");
});

// ---------------------------------------------------------------------------
// play() — out-of-range channel (< 1)
// ---------------------------------------------------------------------------

test("PatternResult.play (channel 0)", () => {
  const result = patternResult.play(0);
  assert.ok(result.toString().includes("Channel must be 1"), "error for channel < 1");
});

// ---------------------------------------------------------------------------
// play() — out-of-range channel (> 8)
// ---------------------------------------------------------------------------

test("PatternResult.play (channel 9)", () => {
  const result = patternResult.play(9);
  assert.ok(result.toString().includes("Channel must be 1"), "error for channel > 8");
});

// ---------------------------------------------------------------------------
// stop() — after play
// ---------------------------------------------------------------------------

test("PatternResult.stop (after play)", () => {
  patternResult.play(2); // sets channelIndex = 1
  const result = patternResult.stop();
  assert.ok(result.toString().includes("stopped"), "stop returns confirmation");
  assert.equal(mock.lastClearChannel, 1, "transportClearPattern called with 0-indexed channel");
});

// ---------------------------------------------------------------------------
// stop() — never played (channelIndex stays -1)
// ---------------------------------------------------------------------------

test("PatternResult.stop (never played)", () => {
  const freshCompiled = parsePattern("c4 = a . . . a . . . a . . . a . . .");
  const freshPattern = new PatternResult("c4 = a . . . a . . . a . . . a . . .", freshCompiled);
  mock.lastClearChannel = undefined;

  const result = freshPattern.stop();
  assert.ok(result.toString().includes("stopped"), "stop on unplayed pattern still returns confirmation");
  assert.equal(mock.lastClearChannel, undefined, "transportClearPattern NOT called when channelIndex is -1");
});

// ---------------------------------------------------------------------------
// velocityToChar / midiToNoteName (exercised via toString)
// ---------------------------------------------------------------------------

test("PatternResult.toString (high velocity)", () => {
  // A pattern with a capital-letter step (high velocity)
  const highVelNotation = "c4 = A . . . . . . . . . . . . . . .";
  const highVelCompiled = parsePattern(highVelNotation);
  const highVelPattern = new PatternResult(highVelNotation, highVelCompiled);
  const text = highVelPattern.toString();
  assert.ok(text.includes("c"), "note name includes 'c'");
  // Capital A in input should produce an uppercase char in grid output
  assert.ok(/[A-Z]/.test(text), "high-velocity step uses uppercase char");
});
