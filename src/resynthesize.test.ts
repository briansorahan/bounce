/**
 * Unit tests for src/electron/services/granularize/resynthesize.ts
 *
 * Tests the pure resynthesize() function: no native bindings required.
 */

import { test } from "vitest";
import assert from "node:assert/strict";
import { resynthesize, type ResynthesisParams } from "./electron/services/granularize/resynthesize.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a sine wave with unit amplitude at the given frequency. */
function makeSineWave(sampleRate: number, durationSeconds: number, freqHz = 440): Float32Array {
  const numSamples = Math.round(sampleRate * durationSeconds);
  const audio = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    audio[i] = Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  }
  return audio;
}

function hasNaNOrInfinity(buffer: Float32Array): boolean {
  for (let i = 0; i < buffer.length; i++) {
    if (!isFinite(buffer[i])) return true;
  }
  return false;
}

function peakAmplitude(buffer: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    const abs = Math.abs(buffer[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}

// ---------------------------------------------------------------------------
// Empty grains → zero-length output
// ---------------------------------------------------------------------------

test("empty grainPositions returns Float32Array of length 0", () => {
  const audio = makeSineWave(44100, 1);
  const result = resynthesize({
    audioData: audio,
    sampleRate: 44100,
    grainPositions: [],
    grainSizeSamples: 1024,
    outputLengthSamples: 44100,
    pitch: 1.0,
    envelope: 0,
    density: 20,
  });
  assert.equal(result instanceof Float32Array, true);
  assert.equal(result.length, 0);
});

// ---------------------------------------------------------------------------
// Single grain
// ---------------------------------------------------------------------------

test("single grain produces non-silent output", () => {
  const sampleRate = 44100;
  const audio = makeSineWave(sampleRate, 0.5);
  const grainSizeSamples = 2048;
  const outputLengthSamples = 44100;

  const result = resynthesize({
    audioData: audio,
    sampleRate,
    grainPositions: [0],
    grainSizeSamples,
    outputLengthSamples,
    pitch: 1.0,
    envelope: 0,
    density: 1,
    normalize: false,
  });

  assert.equal(result instanceof Float32Array, true);
  assert.equal(result.length, outputLengthSamples);
  // At least one non-zero sample in the first grain window
  let nonZero = false;
  for (let i = 0; i < grainSizeSamples; i++) {
    if (result[i] !== 0) {
      nonZero = true;
      break;
    }
  }
  assert.ok(nonZero, "single grain should produce non-zero output within its window");
  assert.ok(!hasNaNOrInfinity(result), "single grain output should contain no NaN/Infinity");
});

// ---------------------------------------------------------------------------
// Identity resynthesis — full-window single grain should approximate input at centre
// ---------------------------------------------------------------------------

test("identity resynthesis: full-window grain approximates input near the centre", () => {
  const sampleRate = 44100;
  const durationSeconds = 1;
  const audio = makeSineWave(sampleRate, durationSeconds);
  const totalSamples = audio.length;

  // One grain covering the entire signal, density=1 → one placement per output
  const result = resynthesize({
    audioData: audio,
    sampleRate,
    grainPositions: [0],
    grainSizeSamples: totalSamples,
    outputLengthSamples: totalSamples,
    pitch: 1.0,
    envelope: 0,  // Hann
    density: 1,
    normalize: false,
  });

  assert.equal(result.length, totalSamples);

  // Near the centre the Hann window is ~1.0, so output ≈ input
  const mid = Math.floor(totalSamples / 2);
  const deviation = Math.abs(result[mid] - audio[mid]);
  assert.ok(deviation < 0.05, `centre sample deviation ${deviation} should be < 0.05 (windowing tolerance)`);
  assert.ok(!hasNaNOrInfinity(result), "identity resynthesis should produce no NaN/Infinity");
});

// ---------------------------------------------------------------------------
// Time stretching
// ---------------------------------------------------------------------------

test("time stretching: 2x output length with same grain positions", () => {
  const sampleRate = 44100;
  const audio = makeSineWave(sampleRate, 1);
  const inputLength = audio.length;
  const outputLength = inputLength * 2;

  const result = resynthesize({
    audioData: audio,
    sampleRate,
    grainPositions: [0, Math.floor(inputLength / 4), Math.floor(inputLength / 2)],
    grainSizeSamples: 2048,
    outputLengthSamples: outputLength,
    pitch: 1.0,
    envelope: 0,
    density: 20,
    normalize: false,
  });

  assert.equal(result.length, outputLength, "output length should be 2x input length");
  assert.ok(!hasNaNOrInfinity(result), "stretched output should contain no NaN/Infinity");
});

// ---------------------------------------------------------------------------
// Pitch shifting
// ---------------------------------------------------------------------------

test("pitch shifting: pitch=2.0 reads source at 2x rate", () => {
  const sampleRate = 44100;
  const audio = makeSineWave(sampleRate, 1, 220); // 220 Hz sine
  const grainSizeSamples = 4096;

  // With pitch=2.0, source sample at index n*2 is used for output index n.
  // We verify the output is non-silent and has no NaN/Infinity.
  const result = resynthesize({
    audioData: audio,
    sampleRate,
    grainPositions: [0],
    grainSizeSamples,
    outputLengthSamples: grainSizeSamples,
    pitch: 2.0,
    envelope: 0,
    density: 1,
    normalize: false,
  });

  assert.equal(result.length, grainSizeSamples);
  assert.ok(!hasNaNOrInfinity(result), "pitch-shifted output should contain no NaN/Infinity");

  // Verify the mid-point sample differs meaningfully from pitch=1.0 result
  const resultUnity = resynthesize({
    audioData: audio,
    sampleRate,
    grainPositions: [0],
    grainSizeSamples,
    outputLengthSamples: grainSizeSamples,
    pitch: 1.0,
    envelope: 0,
    density: 1,
    normalize: false,
  });
  const mid = Math.floor(grainSizeSamples / 2);
  // At 2x pitch, the source advances faster — sample values should differ
  assert.notEqual(result[mid], resultUnity[mid], "pitch=2.0 should yield different sample values from pitch=1.0");
});

// ---------------------------------------------------------------------------
// All 4 window envelopes produce valid output
// ---------------------------------------------------------------------------

test("all 4 window envelopes produce finite output", () => {
  const sampleRate = 44100;
  const audio = makeSineWave(sampleRate, 0.5);
  const baseParams: Omit<ResynthesisParams, "envelope"> = {
    audioData: audio,
    sampleRate,
    grainPositions: [0, 1000, 5000],
    grainSizeSamples: 2048,
    outputLengthSamples: 22050,
    pitch: 1.0,
    density: 20,
    normalize: false,
  };

  for (const envelope of [0, 1, 2, 3]) {
    const result = resynthesize({ ...baseParams, envelope });
    assert.ok(!hasNaNOrInfinity(result), `envelope=${envelope} produced NaN or Infinity`);
    assert.equal(result.length, baseParams.outputLengthSamples, `envelope=${envelope} output length mismatch`);
  }
});

// ---------------------------------------------------------------------------
// Very high density
// ---------------------------------------------------------------------------

test("very high density (500) produces output without errors", () => {
  const sampleRate = 44100;
  const audio = makeSineWave(sampleRate, 1);

  const result = resynthesize({
    audioData: audio,
    sampleRate,
    grainPositions: [0, 1000, 5000, 10000],
    grainSizeSamples: 256,
    outputLengthSamples: 44100,
    pitch: 1.0,
    envelope: 0,
    density: 500,
    normalize: true,
  });

  assert.equal(result.length, 44100);
  assert.ok(!hasNaNOrInfinity(result), "very high density should produce no NaN/Infinity");
});

// ---------------------------------------------------------------------------
// Determinism — identical inputs produce byte-identical outputs
// ---------------------------------------------------------------------------

test("determinism: same inputs produce byte-identical outputs", () => {
  const sampleRate = 44100;
  const audio = makeSineWave(sampleRate, 0.5);
  const params: ResynthesisParams = {
    audioData: audio,
    sampleRate,
    grainPositions: [0, 2000, 8000, 15000],
    grainSizeSamples: 1024,
    outputLengthSamples: 22050,
    pitch: 1.0,
    envelope: 1,
    density: 30,
    normalize: true,
  };

  const first = resynthesize({ ...params });
  const second = resynthesize({ ...params });

  assert.equal(first.length, second.length, "both runs should produce the same length");
  for (let i = 0; i < first.length; i++) {
    assert.equal(first[i], second[i], `sample ${i} differs between runs`);
  }
});

// ---------------------------------------------------------------------------
// Normalization — peak ≤ 1.0 when normalize=true
// ---------------------------------------------------------------------------

test("normalization: overlapping grains with large overlap are clamped to peak ≤ 1.0", () => {
  const sampleRate = 44100;
  // Use a constant-value signal to maximise overlap-add sum
  const audio = new Float32Array(44100).fill(1.0);
  const grainSizeSamples = 4096;

  // Dense placement with large grains maximises overlap accumulation
  const result = resynthesize({
    audioData: audio,
    sampleRate,
    grainPositions: [0, 500, 1000, 2000, 4000],
    grainSizeSamples,
    outputLengthSamples: 22050,
    pitch: 1.0,
    envelope: 0,
    density: 200, // dense → many overlapping grains
    normalize: true,
  });

  const peak = peakAmplitude(result);
  assert.ok(peak <= 1.0 + 1e-6, `normalize=true peak ${peak} should be ≤ 1.0`);
  assert.ok(!hasNaNOrInfinity(result), "normalized output should contain no NaN/Infinity");
});

// ---------------------------------------------------------------------------
// Normalization disabled — peak may exceed 1.0
// ---------------------------------------------------------------------------

test("normalization disabled: overlapping grains can yield peak > 1.0", () => {
  const sampleRate = 44100;
  // Constant signal that will accumulate past 1.0 with heavy overlap
  const audio = new Float32Array(44100).fill(1.0);
  const grainSizeSamples = 8192;

  const result = resynthesize({
    audioData: audio,
    sampleRate,
    grainPositions: [0],
    grainSizeSamples,
    outputLengthSamples: 44100,
    pitch: 1.0,
    envelope: 0,
    density: 400, // many overlapping placements
    normalize: false,
  });

  // With enough overlap the accumulated sum exceeds 1.0 on at least some samples
  const peak = peakAmplitude(result);
  assert.ok(peak > 1.0, `normalize=false peak ${peak} should be > 1.0 under heavy overlap`);
});

// ---------------------------------------------------------------------------
// Parameter validation
// ---------------------------------------------------------------------------

test("density=0 throws", () => {
  const audio = makeSineWave(44100, 0.1);
  assert.throws(
    () =>
      resynthesize({
        audioData: audio,
        sampleRate: 44100,
        grainPositions: [0],
        grainSizeSamples: 512,
        outputLengthSamples: 4410,
        pitch: 1.0,
        envelope: 0,
        density: 0,
      }),
    /density must be > 0/,
  );
});

test("pitch=5.0 throws (> 4.0 maximum)", () => {
  const audio = makeSineWave(44100, 0.1);
  assert.throws(
    () =>
      resynthesize({
        audioData: audio,
        sampleRate: 44100,
        grainPositions: [0],
        grainSizeSamples: 512,
        outputLengthSamples: 4410,
        pitch: 5.0,
        envelope: 0,
        density: 20,
      }),
    /pitch must be in range/,
  );
});

test("pitch=0.1 throws (< 0.25 minimum)", () => {
  const audio = makeSineWave(44100, 0.1);
  assert.throws(
    () =>
      resynthesize({
        audioData: audio,
        sampleRate: 44100,
        grainPositions: [0],
        grainSizeSamples: 512,
        outputLengthSamples: 4410,
        pitch: 0.1,
        envelope: 0,
        density: 20,
      }),
    /pitch must be in range/,
  );
});

test("outputLengthSamples=0 throws", () => {
  const audio = makeSineWave(44100, 0.1);
  assert.throws(
    () =>
      resynthesize({
        audioData: audio,
        sampleRate: 44100,
        grainPositions: [0],
        grainSizeSamples: 512,
        outputLengthSamples: 0,
        pitch: 1.0,
        envelope: 0,
        density: 20,
      }),
    /outputLengthSamples must be > 0/,
  );
});
