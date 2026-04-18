/**
 * Unit tests for src/electron/services/analysis/dispatch.ts
 *
 * dispatch() is a pure function with no Electron dependencies — it only
 * needs the native flucoma_native addon, which is available in the test env.
 * Tests cover the four slice methods and MFCC that have no workflow coverage.
 */

import assert from "node:assert/strict";
import { dispatch } from "./electron/services/analysis/dispatch";

const SAMPLE_RATE = 44100;
const DURATION    = 0.5;
const N_SAMPLES   = Math.floor(SAMPLE_RATE * DURATION);

/** Impulse train: a sharp transient every `periodSamples` samples. */
function makeImpulseTrain(periodSamples = 4410): number[] {
  const buf = new Array<number>(N_SAMPLES).fill(0);
  for (let i = 0; i < N_SAMPLES; i += periodSamples) {
    buf[i] = 1.0;
  }
  return buf;
}

/**
 * Alternating loud/silent segments: 0.1 s on (amplitude=1), 0.1 s off (silence).
 * Used with explicit low onThreshold so the on-burst always crosses the gate.
 */
function makeOnOffBursts(): number[] {
  const buf = new Array<number>(N_SAMPLES).fill(0);
  const periodSamples = Math.floor(SAMPLE_RATE * 0.1); // 0.1 s
  for (let i = 0; i < N_SAMPLES; i++) {
    buf[i] = i % (periodSamples * 2) < periodSamples
      ? Math.sin(2 * Math.PI * 440 * (i / SAMPLE_RATE)) // loud half
      : 0;                                               // silent half
  }
  return buf;
}

/** Sine wave — good for MFCC (pitched, deterministic). */
function makeSine(): number[] {
  const buf = new Array<number>(N_SAMPLES).fill(0);
  for (let i = 0; i < N_SAMPLES; i++) {
    buf[i] = Math.sin(2 * Math.PI * 440 * (i / SAMPLE_RATE));
  }
  return buf;
}

// ---------------------------------------------------------------------------
// onsetSlice (already covered by workflow; sanity check here)
// ---------------------------------------------------------------------------

{
  console.log("dispatch onsetSlice...");
  const result = dispatch("onsetSlice", { audioData: makeImpulseTrain(), options: {} }) as { onsets: number[] };
  assert.ok(Array.isArray(result.onsets), "onsets is an array");
  assert.ok(result.onsets.length > 0, "impulse train produces at least one onset");
  assert.ok(result.onsets.every((v: number) => v >= 0), "all onsets are non-negative");
  console.log("  ✓ onsetSlice");
}

// ---------------------------------------------------------------------------
// ampSlice
// ---------------------------------------------------------------------------

{
  console.log("dispatch ampSlice...");
  // Use a low onThreshold so the loud half reliably crosses the gate
  const result = dispatch("ampSlice", {
    audioData: makeOnOffBursts(),
    options: { onThreshold: -60, offThreshold: -90 },
  }) as { onsets: number[] };
  assert.ok(Array.isArray(result.onsets), "onsets is an array");
  assert.ok(result.onsets.length > 0, "on/off bursts produce at least one onset");
  assert.ok(result.onsets.every((v: number) => v >= 0), "all onsets are non-negative");
  console.log("  ✓ ampSlice");
}

// ---------------------------------------------------------------------------
// noveltySlice
// ---------------------------------------------------------------------------

{
  console.log("dispatch noveltySlice...");
  const result = dispatch("noveltySlice", { audioData: makeImpulseTrain(), options: {} }) as { onsets: number[] };
  assert.ok(Array.isArray(result.onsets), "onsets is an array");
  assert.ok(result.onsets.every((v: number) => v >= 0), "all onsets are non-negative");
  // Onsets are in ascending order
  for (let i = 1; i < result.onsets.length; i++) {
    assert.ok(result.onsets[i] > result.onsets[i - 1], `onset ${i} > onset ${i - 1}`);
  }
  console.log("  ✓ noveltySlice");
}

// ---------------------------------------------------------------------------
// transientSlice
// ---------------------------------------------------------------------------

{
  console.log("dispatch transientSlice...");
  const result = dispatch("transientSlice", { audioData: makeImpulseTrain(), options: {} }) as { onsets: number[] };
  assert.ok(Array.isArray(result.onsets), "onsets is an array");
  assert.ok(result.onsets.every((v: number) => v >= 0), "all onsets are non-negative");
  console.log("  ✓ transientSlice");
}

// ---------------------------------------------------------------------------
// mfcc
// ---------------------------------------------------------------------------

{
  console.log("dispatch mfcc...");
  const result = dispatch("mfcc", {
    audioData: makeSine(),
    options: { numCoeffs: 13, numBands: 40, windowSize: 1024, fftSize: 1024, hopSize: 512 },
  }) as { coefficients: number[][] };

  assert.ok(Array.isArray(result.coefficients), "coefficients is an array");
  assert.ok(result.coefficients.length > 0, "at least one MFCC frame");
  assert.ok(result.coefficients[0].length === 13, "each frame has numCoeffs coefficients");
  assert.ok(
    result.coefficients.every(frame => frame.every(v => Number.isFinite(v))),
    "all coefficients are finite",
  );
  console.log("  ✓ mfcc");
}

// ---------------------------------------------------------------------------
// Unknown method throws
// ---------------------------------------------------------------------------

{
  console.log("dispatch unknown method...");
  assert.throws(
    // @ts-expect-error — intentionally passing invalid method
    () => dispatch("doesNotExist", {}),
    /Unknown analysis method/,
    "unknown method throws descriptive error",
  );
  console.log("  ✓ unknown method");
}

console.log("\nAll analysis-dispatch tests passed.");
