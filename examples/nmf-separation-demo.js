#!/usr/bin/env node

/**
 * NMF Separation Demo
 * 
 * This script demonstrates the NMF separation workflow in Bounce.
 * It shows how to:
 * 1. Load an audio sample
 * 2. Analyze it with NMF
 * 3. Separate into components
 * 4. Play individual components
 */

console.log("=== NMF Separation Workflow Demo ===\n");

console.log("Step 1: Load an audio sample");
console.log('  play "/path/to/audio.wav"');
console.log("  (Audio is automatically stored in database with hash)\n");

console.log("Step 2: Analyze with NMF");
console.log("  analyze-nmf 82a4b173 --components 5 --iterations 100");
console.log("  (Decomposes audio into 5 spectral bases + activations)\n");

console.log("Step 3: Mark components for playback");
console.log("  sep 82a4b173");
console.log("  (Creates component metadata in database)\n");

console.log("Step 4: Play individual components");
console.log("  play-component 82a4b173 0  # Play first component");
console.log("  play-component 82a4b173 1  # Play second component");
console.log("  play-component 82a4b173 2  # Play third component\n");

console.log("Step 5: List all components");
console.log("  list components\n");

console.log("=== Key Differences from Slices ===\n");
console.log("Slices (time-domain):");
console.log("  - Based on onset detection");
console.log("  - Cut at specific time points");
console.log("  - Each slice is a temporal segment");
console.log("  - Command: slice, play-slice <id>\n");

console.log("Components (spectral-domain):");
console.log("  - Based on NMF decomposition");
console.log("  - Separate by spectral patterns");
console.log("  - Each component spans full duration");
console.log("  - Command: sep, play-component <hash> <index>\n");

console.log("=== Component Playback ===\n");
console.log("Current implementation:");
console.log("  - On-the-fly synthesis from NMF data");
console.log("  - Simple temporal amplitude modulation");
console.log("  - Activation envelope shapes original audio\n");

console.log("Future enhancements:");
console.log("  - Full spectral reconstruction (STFT/ISTFT)");
console.log("  - Wiener filtering for clean separation");
console.log("  - Component visualization on waveform");
console.log("  - Export to individual audio files\n");

console.log("Start the app with: npm run dev:electron");
