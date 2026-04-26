export interface ResynthesisParams {
  audioData: Float32Array;
  sampleRate: number;
  grainPositions: number[];
  grainSizeSamples: number;
  outputLengthSamples: number;
  pitch: number;
  envelope: number;
  density: number;
  normalize?: boolean;
}

const LUT_SIZE = 1024;

function buildWindowLUT(envelope: number): Float32Array {
  const lut = new Float32Array(LUT_SIZE);
  const N = LUT_SIZE;

  switch (envelope) {
    case 1:
      // Hamming
      for (let n = 0; n < N; n++) {
        lut[n] = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (N - 1));
      }
      break;
    case 2:
      // Triangle
      for (let n = 0; n < N; n++) {
        lut[n] = 1 - Math.abs((2 * (n - N / 2)) / N);
      }
      break;
    case 3: {
      // Tukey (α=0.5): Hann taper over outer 25% each side, flat in middle 50%
      const alpha = 0.5;
      const taperLen = Math.floor((alpha / 2) * N);
      for (let n = 0; n < N; n++) {
        if (n < taperLen) {
          lut[n] = 0.5 * (1 - Math.cos((Math.PI * n) / taperLen));
        } else if (n >= N - taperLen) {
          lut[n] = 0.5 * (1 - Math.cos((Math.PI * (N - 1 - n)) / taperLen));
        } else {
          lut[n] = 1.0;
        }
      }
      break;
    }
    default:
      // Hann (0) and fallback
      for (let n = 0; n < N; n++) {
        lut[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
      }
      break;
  }

  return lut;
}

export function resynthesize(params: ResynthesisParams): Float32Array {
  const {
    audioData,
    sampleRate,
    grainPositions,
    grainSizeSamples,
    outputLengthSamples,
    pitch,
    envelope,
    density,
    normalize = true,
  } = params;

  // 1. Validate parameters
  if (density <= 0) {
    throw new Error("density must be > 0");
  }
  if (pitch < 0.25 || pitch > 4.0) {
    throw new Error("pitch must be in range [0.25, 4.0]");
  }
  if (outputLengthSamples <= 0) {
    throw new Error("outputLengthSamples must be > 0");
  }
  if (grainPositions.length === 0) {
    return new Float32Array(0);
  }

  // 2. Pre-compute window LUT
  const windowLUT = buildWindowLUT(envelope);

  // 3. Allocate output buffer
  const output = new Float32Array(outputLengthSamples);

  // 4. Compute output hop
  const outputHop = sampleRate / density;

  // 5. Grain placement loop
  for (let outPos = 0; outPos < outputLengthSamples; outPos += outputHop) {
    // a. Select source grain index
    const srcIdx = Math.min(
      Math.max(
        Math.round((outPos / outputLengthSamples) * (grainPositions.length - 1)),
        0,
      ),
      grainPositions.length - 1,
    );

    // b. Source read position
    const srcStart = grainPositions[srcIdx];

    // c. Pitch-shifted read with window
    const writeStart = Math.round(outPos);

    for (let n = 0; n < grainSizeSamples; n++) {
      if (writeStart + n >= outputLengthSamples) {
        break;
      }

      // Source sample with linear interpolation
      const srcPos = srcStart + n * pitch;
      let sample: number;
      if (srcPos >= audioData.length) {
        sample = 0.0;
      } else {
        const floor = Math.floor(srcPos);
        const frac = srcPos - floor;
        const s0 = audioData[floor];
        const s1 = audioData[Math.min(floor + 1, audioData.length - 1)];
        sample = s0 + frac * (s1 - s0);
      }

      // Window value via LUT interpolation
      const phase = n / grainSizeSamples;
      const lutPos = phase * 1023;
      const lutFloor = Math.floor(lutPos);
      const lutFrac = lutPos - lutFloor;
      const w0 = windowLUT[lutFloor];
      const w1 = windowLUT[Math.min(lutFloor + 1, LUT_SIZE - 1)];
      const windowValue = w0 + lutFrac * (w1 - w0);

      // Overlap-add
      output[writeStart + n] += sample * windowValue;
    }
  }

  // 6. Normalize
  if (normalize !== false) {
    let peak = 0.0;
    for (let i = 0; i < output.length; i++) {
      const abs = Math.abs(output[i]);
      if (abs > peak) peak = abs;
    }
    if (peak > 1.0) {
      const scale = 1.0 / peak;
      for (let i = 0; i < output.length; i++) {
        output[i] *= scale;
      }
    }
  }

  // 7. Return output buffer
  return output;
}
