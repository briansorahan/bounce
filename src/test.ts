import { OnsetFeature, MFCCFeature } from "./index";

// Create a test signal (sine wave with amplitude envelope)
function generateTestSignal(
  sampleRate: number,
  duration: number,
): Float32Array {
  const numSamples = Math.floor(sampleRate * duration);
  const signal = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // 440 Hz sine wave with envelope creating "onsets" every 0.5 seconds
    const envelope = Math.abs(Math.sin(2 * Math.PI * 2 * t));
    signal[i] = envelope * Math.sin(2 * Math.PI * 440 * t);
  }

  return signal;
}

async function main() {
  // Create analyzer with default settings
  const analyzer = new OnsetFeature({
    function: 2, // Spectral Flux
    filterSize: 5,
    windowSize: 1024,
    fftSize: 1024,
    hopSize: 512,
  });

  // Generate test signal
  const sampleRate = 44100;
  const duration = 2; // 2 seconds
  const testSignal = generateTestSignal(sampleRate, duration);

  // Process the signal
  const onsetFeatures = analyzer.process(testSignal);

  // Verify we got results
  if (onsetFeatures.length === 0) {
    throw new Error("No onset features extracted");
  }

  // Basic sanity checks
  if (!Number.isFinite(onsetFeatures[0])) {
    throw new Error("Invalid onset feature values");
  }

  // Exit with success (no output unless there's an error)
  process.exit(0);
}

async function testMFCC() {
  const sampleRate = 44100;
  const numCoeffs = 13;
  const numBands = 40;
  const windowSize = 1024;
  const hopSize = 512;

  const analyzer = new MFCCFeature({
    numCoeffs,
    numBands,
    windowSize,
    fftSize: 1024,
    hopSize,
    sampleRate,
    minFreq: 20,
    maxFreq: 20000,
  });

  // 4096-sample 440 Hz sine wave
  const numSamples = 4096;
  const signal = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    signal[i] = Math.sin(2 * Math.PI * 440 * (i / sampleRate));
  }

  const result = analyzer.process(signal);

  const expectedFrames = Math.floor((numSamples - windowSize) / hopSize) + 1;
  if (result.length !== expectedFrames) {
    throw new Error(
      `Expected ${expectedFrames} frames, got ${result.length}`
    );
  }

  for (let f = 0; f < result.length; f++) {
    const frame = result[f];
    if (frame.length !== numCoeffs) {
      throw new Error(
        `Frame ${f}: expected ${numCoeffs} coefficients, got ${frame.length}`
      );
    }
    for (let k = 0; k < numCoeffs; k++) {
      if (!Number.isFinite(frame[k])) {
        throw new Error(`Frame ${f}, coeff ${k} is not finite: ${frame[k]}`);
      }
    }
  }

  // Verify Float64Array also works
  const signal64 = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    signal64[i] = Math.sin(2 * Math.PI * 440 * (i / sampleRate));
  }
  const result64 = analyzer.process(signal64);
  if (result64.length !== expectedFrames) {
    throw new Error("Float64Array input produced wrong frame count");
  }

  // Verify reset doesn't throw and re-processes correctly
  analyzer.reset();
  const resultAfterReset = analyzer.process(signal);
  if (resultAfterReset.length !== expectedFrames) {
    throw new Error("After reset, frame count changed unexpectedly");
  }

  // Verify invalid input throws
  const tooSmall = new Float32Array(512); // < windowSize
  let threw = false;
  try {
    analyzer.process(tooSmall);
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error("Expected error for input smaller than windowSize");
  }

  // Verify invalid construction throws (numCoeffs > numBands)
  let ctorThrew = false;
  try {
    new MFCCFeature({ numCoeffs: 50, numBands: 10 });
  } catch {
    ctorThrew = true;
  }
  if (!ctorThrew) {
    throw new Error("Expected error when numCoeffs > numBands");
  }
}

main()
  .then(() => testMFCC())
  .catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
  });
