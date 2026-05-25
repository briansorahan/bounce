import { test } from "vitest";
import assert from "node:assert/strict";
import { renderAdditive } from "./index.js";

/**
 * Measure the amplitude of a given frequency in a signal via a DFT at that frequency.
 */
function measureHarmonicAmplitude(signal: Float32Array, sampleRate: number, freq: number): number {
  let real = 0, imag = 0;
  for (let i = 0; i < signal.length; i++) {
    const phase = 2 * Math.PI * freq * i / sampleRate;
    real += signal[i] * Math.cos(phase);
    imag += signal[i] * Math.sin(phase);
  }
  return 2 * Math.sqrt(real * real + imag * imag) / signal.length;
}

/*
 * Test 1 — pure sine wave output
 *
 * Call renderAdditive with numPartials=1, spectralTilt=0, fundamentalHz=440,
 * durationSec=0.1, sampleRate=44100.
 * Verify the return value is a Float32Array with length === sampleRate * durationSec (4410).
 * Verify the dominant frequency is 440 Hz by counting zero-crossings.
 * A 440Hz sine at 44100Hz has ~440*2 crossings per second. For 0.1s that's ~88 crossings.
 */
test("renders a pure sine wave at the fundamental frequency", () => {
  const sampleRate = 44100;
  const durationSec = 0.1;
  const fundamentalHz = 440;

  const output = renderAdditive({
    fundamentalHz,
    numPartials: 1,
    spectralTilt: 0,
    durationSec,
    sampleRate,
  });

  assert.ok(output instanceof Float32Array, "output should be a Float32Array");
  assert.strictEqual(output.length, Math.floor(sampleRate * durationSec));

  // Count zero-crossings to verify dominant frequency
  let crossings = 0;
  for (let i = 1; i < output.length; i++) {
    if ((output[i - 1] >= 0) !== (output[i] >= 0)) {
      crossings++;
    }
  }
  // Expected: ~88 crossings (440 Hz × 2 × 0.1 s), allow ±10%
  const expectedCrossings = fundamentalHz * 2 * durationSec;
  assert.ok(
    crossings >= expectedCrossings * 0.9 && crossings <= expectedCrossings * 1.1,
    `expected ~${expectedCrossings} zero-crossings, got ${crossings}`,
  );
});

/*
 * Test 2 — sawtooth-like harmonic spectrum with tilt=1
 *
 * Call renderAdditive with numPartials=128, spectralTilt=1, fundamentalHz=440,
 * durationSec=0.1.
 * Verify that the amplitude of partial n is approximately 1/n relative to partial 1.
 */
test("renders a sawtooth-like spectrum with tilt=1", () => {
  const sampleRate = 44100;
  const fundamentalHz = 440;

  const output = renderAdditive({
    fundamentalHz,
    numPartials: 128,
    spectralTilt: 1,
    durationSec: 0.1,
    sampleRate,
  });

  assert.ok(output instanceof Float32Array, "output should be a Float32Array");

  const amp1 = measureHarmonicAmplitude(output, sampleRate, fundamentalHz);
  const amp2 = measureHarmonicAmplitude(output, sampleRate, fundamentalHz * 2);
  const amp3 = measureHarmonicAmplitude(output, sampleRate, fundamentalHz * 3);

  // partial 2 ≈ 0.5×, partial 3 ≈ 0.33× (within 20% tolerance)
  assert.ok(amp1 > 0, "fundamental should have non-zero amplitude");
  assert.ok(
    Math.abs(amp2 / amp1 - 0.5) < 0.1,
    `partial 2 / partial 1 ratio should be ~0.5, got ${amp2 / amp1}`,
  );
  assert.ok(
    Math.abs(amp3 / amp1 - 1 / 3) < 0.1,
    `partial 3 / partial 1 ratio should be ~0.33, got ${amp3 / amp1}`,
  );
});

/*
 * Test 3 — spectral tilt attenuates high partials
 *
 * Render the same tone twice with spectralTilt=0 and spectralTilt=2.
 * Verify that tilt=2 has significantly less high-frequency energy.
 */
test("spectral tilt controls high partial attenuation", () => {
  const sampleRate = 44100;
  const fundamentalHz = 440;
  const opts = { fundamentalHz, numPartials: 64, durationSec: 0.1, sampleRate };

  const flatOutput = renderAdditive({ ...opts, spectralTilt: 0 });
  const tiltOutput = renderAdditive({ ...opts, spectralTilt: 2 });

  // Measure energy in upper harmonics (partials 32-40)
  let flatHighEnergy = 0;
  let tiltHighEnergy = 0;
  for (let n = 32; n <= 40; n++) {
    const freq = fundamentalHz * n;
    if (freq < sampleRate * 0.5) {
      flatHighEnergy += measureHarmonicAmplitude(flatOutput, sampleRate, freq) ** 2;
      tiltHighEnergy += measureHarmonicAmplitude(tiltOutput, sampleRate, freq) ** 2;
    }
  }

  assert.ok(
    tiltHighEnergy < flatHighEnergy * 0.1,
    `tilt=2 high-frequency energy (${tiltHighEnergy}) should be much less than tilt=0 (${flatHighEnergy})`,
  );
});

/*
 * Test 4 — Nyquist culling
 *
 * Call renderAdditive with fundamentalHz=8000, numPartials=128, sampleRate=44100.
 * Only partials 1 (8000 Hz) and 2 (16000 Hz) fall below Nyquist (22050 Hz).
 * Verify there is no significant energy at frequencies above Nyquist.
 */
test("culls partials above Nyquist", () => {
  const sampleRate = 44100;
  const fundamentalHz = 8000;
  const nyquist = sampleRate / 2;

  const output = renderAdditive({
    fundamentalHz,
    numPartials: 128,
    spectralTilt: 0,
    durationSec: 0.1,
    sampleRate,
  });

  assert.ok(output instanceof Float32Array, "output should be a Float32Array");

  // Output should have energy (not silent)
  const amp1 = measureHarmonicAmplitude(output, sampleRate, fundamentalHz);
  assert.ok(amp1 > 0.01, `fundamental should have energy, got ${amp1}`);

  // Above Nyquist, amplitude of hypothetical partial 4 (32000 Hz) should be ~0
  // (it should have been culled)
  const ampAboveNyquist = measureHarmonicAmplitude(output, sampleRate, nyquist + 1000);
  assert.ok(
    ampAboveNyquist < 0.01,
    `no significant energy should exist above Nyquist, got ${ampAboveNyquist}`,
  );
});

/*
 * Test 5 — output peak normalisation
 *
 * Verify the peak amplitude is <= 1.0.
 */
test("normalizes output peak to 1.0 or below", () => {
  const output = renderAdditive({
    fundamentalHz: 440,
    numPartials: 32,
    spectralTilt: 0,
    durationSec: 0.1,
  });

  assert.ok(output instanceof Float32Array, "output should be a Float32Array");

  let peak = 0;
  for (let i = 0; i < output.length; i++) {
    const abs = Math.abs(output[i]);
    if (abs > peak) peak = abs;
  }

  assert.ok(peak <= 1.0, `peak amplitude should be <= 1.0, got ${peak}`);
  assert.ok(peak > 0.0, "output should not be silent");
});

/*
 * Test 6 — invalid fundamentalHz throws
 */
test("throws on invalid fundamentalHz", () => {
  assert.throws(
    () => renderAdditive({ fundamentalHz: 0, numPartials: 1, spectralTilt: 0, durationSec: 0.1 }),
    "should throw for fundamentalHz=0",
  );
  assert.throws(
    () => renderAdditive({ fundamentalHz: -440, numPartials: 1, spectralTilt: 0, durationSec: 0.1 }),
    "should throw for fundamentalHz=-440",
  );
});

/*
 * Test 7 — invalid numPartials throws
 */
test("throws on invalid numPartials", () => {
  assert.throws(
    () => renderAdditive({ fundamentalHz: 440, numPartials: 0, spectralTilt: 0, durationSec: 0.1 }),
    "should throw for numPartials=0",
  );
  assert.throws(
    () => renderAdditive({ fundamentalHz: 440, numPartials: -1, spectralTilt: 0, durationSec: 0.1 }),
    "should throw for numPartials=-1",
  );
});

/*
 * Test 8 — invalid durationSec throws
 */
test("throws on invalid durationSec", () => {
  assert.throws(
    () => renderAdditive({ fundamentalHz: 440, numPartials: 1, spectralTilt: 0, durationSec: 0 }),
    "should throw for durationSec=0",
  );
  assert.throws(
    () => renderAdditive({ fundamentalHz: 440, numPartials: 1, spectralTilt: 0, durationSec: -0.1 }),
    "should throw for durationSec=-0.1",
  );
});

/*
 * Test 9 — invalid sampleRate throws
 */
test("throws on invalid sampleRate", () => {
  assert.throws(
    () => renderAdditive({ fundamentalHz: 440, numPartials: 1, spectralTilt: 0, durationSec: 0.1, sampleRate: 0 }),
    "should throw for sampleRate=0",
  );
  assert.throws(
    () => renderAdditive({ fundamentalHz: 440, numPartials: 1, spectralTilt: 0, durationSec: 0.1, sampleRate: -44100 }),
    "should throw for sampleRate=-44100",
  );
});

/*
 * Test 10 — invalid fftSize throws
 */
test("throws on invalid fftSize", () => {
  assert.throws(
    () => renderAdditive({ fundamentalHz: 440, numPartials: 1, spectralTilt: 0, durationSec: 0.1, fftSize: 0 }),
    "should throw for fftSize=0",
  );
  assert.throws(
    () => renderAdditive({ fundamentalHz: 440, numPartials: 1, spectralTilt: 0, durationSec: 0.1, fftSize: 1000 }),
    "should throw for non-power-of-2 fftSize",
  );
});
