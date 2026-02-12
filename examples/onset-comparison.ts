import { OnsetFeature, OnsetSlice } from '../src/index';

console.log('OnsetFeature vs OnsetSlice Comparison\n');

const sampleRate = 44100;
const numSamples = 88200;

function generateImpulses(numSamples: number, impulsePositions: number[]): Float32Array {
  const buffer = new Float32Array(numSamples);
  for (const pos of impulsePositions) {
    if (pos >= 0 && pos < numSamples) {
      buffer[pos] = 1.0;
    }
  }
  return buffer;
}

const impulsePositions = [0, 22050, 44100, 66150];
const audioBuffer = generateImpulses(numSamples, impulsePositions);

console.log('Input: Audio buffer with impulses at samples:', impulsePositions);
console.log();

const featureAnalyzer = new OnsetFeature({
  function: 2,
  threshold: 0.3,
  hopSize: 512
});

const features = featureAnalyzer.process(audioBuffer);
console.log('OnsetFeature Output:');
console.log(`- Returns ${features.length} feature values (one per frame)`);
console.log(`- Feature values range from ${Math.min(...features).toFixed(4)} to ${Math.max(...features).toFixed(4)}`);
console.log('- You need to manually threshold and convert to sample indices');
console.log();

const sliceAnalyzer = new OnsetSlice({
  function: 2,
  threshold: 0.3,
  minSliceLength: 10,
  hopSize: 512
});

const sliceIndices = sliceAnalyzer.process(audioBuffer);
console.log('OnsetSlice Output:');
console.log(`- Returns ${sliceIndices.length} slice indices (sample positions)`);
console.log('- Slice points at samples:', sliceIndices);
console.log('- Ready to use for slicing audio directly');
console.log();

console.log('Summary:');
console.log('- OnsetFeature: Returns raw feature data for analysis');
console.log('- OnsetSlice: Returns actionable slice points for segmentation');
