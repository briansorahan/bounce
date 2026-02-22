import { OnsetFeature } from "./index";

async function main() {
  console.log("Testing FluCoMa OnsetFeature binding...\n");

  try {
    console.log("Creating analyzer...");
    const analyzer = new OnsetFeature({
      function: 2, // Spectral Flux
      filterSize: 5,
      windowSize: 1024,
      fftSize: 1024,
      hopSize: 512,
    });
    console.log("✅ Analyzer created successfully");

    // Generate simple test signal
    const testSignal = new Float32Array(2048);
    for (let i = 0; i < testSignal.length; i++) {
      testSignal[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
    }
    console.log(`Generated ${testSignal.length} samples`);

    console.log("Processing signal...");
    const onsetFeatures = analyzer.process(testSignal);

    console.log(`✅ Extracted ${onsetFeatures.length} onset feature frames`);
    console.log(
      `First 5 values: [${onsetFeatures
        .slice(0, 5)
        .map((v) => v.toFixed(6))
        .join(", ")}]`,
    );
    console.log("\n✅ OnsetFeature binding test complete!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

main().catch(console.error);
