/**
 * NMF Cross-Synthesis Demo
 * 
 * Demonstrates using NMF bases learned from one sample as a dictionary
 * to decompose and separate components in another sample.
 */

const { BufNMF } = require('../dist/electron/BufNMF.js');
const { BufNMFCross } = require('../dist/electron/BufNMFCross.js');

// Create two different audio signals
const sampleRate = 44100;
const duration = 1.0;
const numSamples = Math.floor(sampleRate * duration);

// Source: A multi-component signal (will learn dictionary from this)
// Contains 220 Hz and 440 Hz components
const sourceAudio = new Float32Array(numSamples);
for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  sourceAudio[i] = 
    0.5 * Math.sin(2 * Math.PI * 220 * t) +  // Low frequency component
    0.3 * Math.sin(2 * Math.PI * 440 * t);   // High frequency component
}

// Target: A different mix (will decompose this using source dictionary)
// Contains the same frequencies but with different amplitudes and time-varying envelope
const targetAudio = new Float32Array(numSamples);
for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  const envelope1 = Math.max(0, 1 - t * 2); // Fades out quickly
  const envelope2 = Math.min(1, t * 2);      // Fades in
  
  targetAudio[i] = 
    0.7 * envelope1 * Math.sin(2 * Math.PI * 220 * t) +
    0.4 * envelope2 * Math.sin(2 * Math.PI * 440 * t);
}

console.log('=== NMF Cross-Synthesis Demo ===\n');

// Step 1: Analyze source to learn dictionary
console.log('Step 1: Learning dictionary from source sample');
const nmf = new BufNMF({ 
  components: 2, 
  iterations: 50,
  fftSize: 2048 
});

const sourceResult = nmf.process(sourceAudio, sampleRate);
console.log(`  ✓ Learned ${sourceResult.components} basis vectors`);
console.log(`  - Bases shape: ${sourceResult.bases.length} x ${sourceResult.bases[0].length}`);
console.log(`  - Source activations: ${sourceResult.activations.length} x ${sourceResult.activations[0].length}`);

// Step 2: Apply source dictionary to target using NMFCross
console.log('\nStep 2: Applying source dictionary to target sample');
const nmfCross = new BufNMFCross({
  iterations: 50,
  fftSize: 2048,
  timeSparsity: 7,
  polyphony: 2,  // Will be clamped to number of components
  continuity: 7
});

const crossResult = nmfCross.process(
  targetAudio,
  sampleRate,
  sourceResult.bases,        // Use source bases as fixed dictionary
  sourceResult.activations   // Not used, NMFCross computes new activations
);

console.log(`  ✓ Cross-synthesis complete`);
console.log(`  - Target activations: ${crossResult.activations.length} x ${crossResult.activations[0].length}`);
console.log(`  - Using ${crossResult.components} basis vectors from source`);

// Step 3: Resynthesize individual components
console.log('\nStep 3: Resynthesizing individual components from target');
for (let i = 0; i < crossResult.components; i++) {
  const component = nmf.resynthesize(
    targetAudio,
    sampleRate,
    crossResult.bases,
    crossResult.activations,
    i
  );
  
  const rms = Math.sqrt(component.reduce((sum, val) => sum + val * val, 0) / component.length);
  console.log(`  ✓ Component ${i}: ${component.length} samples, RMS = ${rms.toFixed(4)}`);
}

console.log('\n=== Summary ===');
console.log('NMF Cross-Synthesis allows you to:');
console.log('1. Learn spectral patterns (bases) from one recording');
console.log('2. Apply those learned patterns to analyze a different recording');
console.log('3. Extract components that match the learned dictionary');
console.log('\nThis is useful for:');
console.log('- Drum separation using a drum template library');
console.log('- Harmonic analysis using reference recordings');
console.log('- Style transfer and audio mosaicing');
