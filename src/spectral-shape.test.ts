/**
 * Unit tests for src/spectral-shape.ts (SpectralShapeFeature wrapper)
 *
 * Requires the native flucoma_native addon — runs as part of npm test.
 */

import assert from "node:assert/strict";
import { SpectralShapeFeature } from "./spectral-shape";

const SAMPLE_RATE = 44100;
const DURATION = 0.5; // seconds
const NUM_SAMPLES = Math.floor(SAMPLE_RATE * DURATION);

/** Pure 440 Hz sine wave. */
function makeSine(): Float32Array {
  const buf = new Float32Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    buf[i] = Math.sin(2 * Math.PI * 440 * (i / SAMPLE_RATE));
  }
  return buf;
}

/** All-zeros (silence). */
function makeSilence(): Float32Array {
  return new Float32Array(NUM_SAMPLES);
}

// ---------------------------------------------------------------------------
// process() — output shape and field names
// ---------------------------------------------------------------------------

{
  console.log("SpectralShapeFeature process output shape...");

  const feat = new SpectralShapeFeature({ sampleRate: SAMPLE_RATE });
  const result = feat.process(makeSine());

  const fields: (keyof typeof result)[] = [
    "centroid", "spread", "skewness", "kurtosis", "rolloff", "flatness", "crest",
  ];
  for (const f of fields) {
    assert.ok(f in result, `result has field '${f}'`);
    assert.ok(Number.isFinite(result[f]), `result.${f} is a finite number`);
  }

  console.log("  ✓ output shape");
}

// ---------------------------------------------------------------------------
// process() — sine wave centroid near 440 Hz
// ---------------------------------------------------------------------------

{
  console.log("SpectralShapeFeature spectral centroid for sine...");

  const feat = new SpectralShapeFeature({ sampleRate: SAMPLE_RATE });
  const result = feat.process(makeSine());

  // The centroid of a pure sine wave should be very close to its frequency.
  // Allow ±100 Hz tolerance due to windowing / STFT leakage.
  assert.ok(
    result.centroid > 340 && result.centroid < 540,
    `centroid (${result.centroid.toFixed(1)} Hz) should be near 440 Hz`,
  );

  console.log("  ✓ spectral centroid for sine");
}

// ---------------------------------------------------------------------------
// process() — silence produces finite values (not NaN/Inf)
// ---------------------------------------------------------------------------

{
  console.log("SpectralShapeFeature silence handling...");

  const feat = new SpectralShapeFeature({ sampleRate: SAMPLE_RATE });
  const result = feat.process(makeSilence());

  for (const [k, v] of Object.entries(result)) {
    assert.ok(Number.isFinite(v) || v === 0, `field '${k}' is finite or zero for silent input`);
  }

  console.log("  ✓ silence handling");
}

// ---------------------------------------------------------------------------
// process() — broadband noise has higher spread than a sine
// ---------------------------------------------------------------------------

{
  console.log("SpectralShapeFeature spread: noise > sine...");

  const noise = new Float32Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    noise[i] = (Math.random() * 2 - 1) * 0.5;
  }

  const feat = new SpectralShapeFeature({ sampleRate: SAMPLE_RATE });
  const sineResult  = feat.process(makeSine());
  feat.reset();
  const noiseResult = feat.process(noise);

  assert.ok(
    noiseResult.spread > sineResult.spread,
    `noise spread (${noiseResult.spread.toFixed(1)}) should exceed sine spread (${sineResult.spread.toFixed(1)})`,
  );

  console.log("  ✓ spread: noise > sine");
}

// ---------------------------------------------------------------------------
// reset() — state cleared between process() calls
// ---------------------------------------------------------------------------

{
  console.log("SpectralShapeFeature reset...");

  const feat = new SpectralShapeFeature({ sampleRate: SAMPLE_RATE });
  const r1 = feat.process(makeSine());
  feat.reset();
  const r2 = feat.process(makeSine());

  // Same input after reset should produce the same centroid
  assert.ok(
    Math.abs(r1.centroid - r2.centroid) < 1,
    `centroid consistent after reset (${r1.centroid.toFixed(2)} vs ${r2.centroid.toFixed(2)})`,
  );

  console.log("  ✓ reset");
}

// ---------------------------------------------------------------------------
// constructor options — minFreq / maxFreq narrow the analysis band
// ---------------------------------------------------------------------------

{
  console.log("SpectralShapeFeature frequency bounds...");

  const featFull   = new SpectralShapeFeature({ sampleRate: SAMPLE_RATE });
  const featNarrow = new SpectralShapeFeature({ sampleRate: SAMPLE_RATE, minFreq: 400, maxFreq: 500 });

  const sine = makeSine();
  const full   = featFull.process(sine);
  const narrow = featNarrow.process(sine);

  // Both should return finite numbers
  assert.ok(Number.isFinite(full.centroid),   "full-range centroid is finite");
  assert.ok(Number.isFinite(narrow.centroid), "narrow-range centroid is finite");

  console.log("  ✓ frequency bounds");
}

console.log("\nAll spectral-shape tests passed.");
