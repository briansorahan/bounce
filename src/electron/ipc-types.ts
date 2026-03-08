export interface OnsetSliceOptions {
  threshold?: number;
  minSliceLength?: number;
  filterSize?: number;
  frameDelta?: number;
  metric?: number;
}

export interface BufNMFOptions {
  components?: number;
  iterations?: number;
  fftSize?: number;
  hopSize?: number;
  windowSize?: number;
  seed?: number;
}

export interface MFCCOptions {
  numCoeffs?: number;
  numBands?: number;
  minFreq?: number;
  maxFreq?: number;
  windowSize?: number;
  fftSize?: number;
  hopSize?: number;
  sampleRate?: number;
}

export interface NMFVisualizationData {
  sampleHash: string;
  nmfData: {
    components: number;
    basis: number[][];
    activations: number[][];
  };
  featureHash: string;
}
