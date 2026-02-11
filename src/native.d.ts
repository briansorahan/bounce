export interface OnsetFeatureOptions {
  /**
   * Spectral change metric (0-9)
   * 0: Energy
   * 1: High Frequency Content
   * 2: Spectral Flux
   * 3: Modified Kullback-Leibler
   * 4: Itakura-Saito
   * 5: Cosine
   * 6: Phase Deviation
   * 7: Weighted Phase Deviation
   * 8: Complex Domain
   * 9: Rectified Complex Domain
   */
  function?: number;
  
  /**
   * Median filter size (1-101, must be odd)
   * Default: 5
   */
  filterSize?: number;
  
  /**
   * Frame delta for spectral difference (0-8192)
   * Default: 0
   */
  frameDelta?: number;
  
  /**
   * Analysis window size in samples
   * Default: 1024
   */
  windowSize?: number;
  
  /**
   * FFT size in samples
   * Default: 1024
   */
  fftSize?: number;
  
  /**
   * Hop size for frame-by-frame processing
   * Default: 512
   */
  hopSize?: number;
}

/**
 * OnsetFeature - Real-time onset detection feature extraction
 * Analyzes audio to detect spectral changes indicating onsets
 */
export class OnsetFeature {
  /**
   * Create a new OnsetFeature analyzer
   * @param options - Configuration options
   */
  constructor(options?: OnsetFeatureOptions);
  
  /**
   * Process audio buffer and extract onset features
   * @param audioBuffer - Float32Array or Float64Array containing audio samples
   * @returns Array of onset feature values, one per frame
   */
  process(audioBuffer: Float32Array | Float64Array): number[];
  
  /**
   * Reset the internal state of the analyzer
   */
  reset(): void;
}
