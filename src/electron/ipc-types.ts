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

export interface AmpSliceOptions {
  fastRampUp?: number;
  fastRampDown?: number;
  slowRampUp?: number;
  slowRampDown?: number;
  onThreshold?: number;
  offThreshold?: number;
  floor?: number;
  minSliceLength?: number;
  highPassFreq?: number;
}

export interface NoveltySliceOptions {
  kernelSize?: number;
  threshold?: number;
  filterSize?: number;
  minSliceLength?: number;
  windowSize?: number;
  fftSize?: number;
  hopSize?: number;
}

export interface TransientSliceOptions {
  order?: number;
  blockSize?: number;
  padSize?: number;
  skew?: number;
  threshFwd?: number;
  threshBack?: number;
  windowSize?: number;
  clumpLength?: number;
  minSliceLength?: number;
}
