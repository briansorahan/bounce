import { OnsetFeature } from "./index";

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

main().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
