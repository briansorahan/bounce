import {
  OnsetFeature as NativeOnsetFeature,
  OnsetSlice as NativeOnsetSlice,
  MFCCFeature as NativeMFCCFeature,
} from "./native.js";

// Re-export types
export type { OnsetFeatureOptions, OnsetSliceOptions, MFCCFeatureOptions } from "./native.js";
export type { AdditiveRenderOptions } from "./native.js";
export { SpectralShapeFeature } from "./spectral-shape.js";
export type { SpectralShapeOptions, SpectralShapeResult } from "./spectral-shape.js";
export { Normalization } from "./normalization.js";
export { KDTree } from "./kdtree.js";
export type { KNNResult } from "./kdtree.js";
export { BufNMFCross } from "./electron/BufNMFCross.js";
export type { BufNMFCrossOptions, BufNMFCrossResult } from "./electron/BufNMFCross.js";

// Load the native addon
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const addon = require("../build/Release/flucoma_native.node");

/**
 * OnsetFeature analyzer wrapper
 */
export class OnsetFeature {
  private _native: NativeOnsetFeature;

  constructor(options?: {
    function?: number;
    filterSize?: number;
    frameDelta?: number;
    windowSize?: number;
    fftSize?: number;
    hopSize?: number;
  }) {
    this._native = new addon.OnsetFeature(options || {});
  }

  /**
   * Process audio buffer and extract onset features
   */
  process(audioBuffer: Float32Array | Float64Array): number[] {
    return this._native.process(audioBuffer);
  }

  /**
   * Reset analyzer state
   */
  reset(): void {
    this._native.reset();
  }
}

/**
 * OnsetSlice analyzer wrapper
 */
export class OnsetSlice {
  private _native: NativeOnsetSlice;

  constructor(options?: {
    function?: number;
    threshold?: number;
    minSliceLength?: number;
    filterSize?: number;
    frameDelta?: number;
    windowSize?: number;
    fftSize?: number;
    hopSize?: number;
  }) {
    this._native = new addon.OnsetSlice(options || {});
  }

  /**
   * Process audio buffer and detect onset slice points
   */
  process(audioBuffer: Float32Array | Float64Array): number[] {
    return this._native.process(audioBuffer);
  }

  /**
   * Reset analyzer state
   */
  reset(): void {
    this._native.reset();
  }
}

/**
 * BufNMF analyzer wrapper
 */
export class BufNMF {
  private _native: any;

  constructor(options?: {
    components?: number;
    iterations?: number;
    fftSize?: number;
    hopSize?: number;
    windowSize?: number;
    seed?: number;
  }) {
    this._native = new addon.BufNMF(options || {});
  }

  /**
   * Process audio buffer and perform NMF decomposition
   */
  process(
    audioBuffer: Float32Array | Float64Array,
    sampleRate: number,
  ): {
    components: number;
    iterations: number;
    converged: boolean;
    bases: number[][];
    activations: number[][];
  } {
    return this._native.process(audioBuffer, sampleRate);
  }

  /**
   * Resynthesize a single NMF component back to audio.
   */
  resynthesize(
    audioBuffer: Float32Array | Float64Array,
    sampleRate: number,
    bases: number[][],
    activations: number[][],
    componentIndex: number,
  ): Float32Array {
    return this._native.resynthesize(audioBuffer, sampleRate, bases, activations, componentIndex);
  }
}

export default OnsetFeature;

/**
 * MFCCFeature analyzer wrapper
 */
export class MFCCFeature {

  private _native: NativeMFCCFeature;

  constructor(options?: {
    numCoeffs?: number;
    numBands?: number;
    minFreq?: number;
    maxFreq?: number;
    windowSize?: number;
    fftSize?: number;
    hopSize?: number;
    sampleRate?: number;
  }) {
    this._native = new addon.MFCCFeature(options || {});
  }

  /**
   * Process audio buffer and extract MFCC feature vectors
   */
  process(audioBuffer: Float32Array | Float64Array): number[][] {
    return this._native.process(audioBuffer);
  }

  /**
   * Reset analyzer state
   */
  reset(): void {
    this._native.reset();
  }
}

/**
 * AmpSlice analyzer wrapper — amplitude-based audio slicing
 */
export class AmpSlice {
  private _native: any;

  constructor(options?: {
    fastRampUp?: number;
    fastRampDown?: number;
    slowRampUp?: number;
    slowRampDown?: number;
    onThreshold?: number;
    offThreshold?: number;
    floor?: number;
    minSliceLength?: number;
    highPassFreq?: number;
    sampleRate?: number;
  }) {
    this._native = new addon.AmpSlice(options || {});
  }

  process(audioBuffer: Float32Array | Float64Array): number[] {
    return this._native.process(audioBuffer);
  }

  reset(): void {
    this._native.reset();
  }
}

/**
 * NoveltySlice analyzer wrapper — novelty-curve-based audio slicing
 */
export class NoveltySlice {
  private _native: any;

  constructor(options?: {
    kernelSize?: number;
    threshold?: number;
    filterSize?: number;
    minSliceLength?: number;
    windowSize?: number;
    fftSize?: number;
    hopSize?: number;
  }) {
    this._native = new addon.NoveltySlice(options || {});
  }

  process(audioBuffer: Float32Array | Float64Array): number[] {
    return this._native.process(audioBuffer);
  }

  reset(): void {
    this._native.reset();
  }
}

/**
 * TransientSlice analyzer wrapper — transient-based audio slicing
 */
export class TransientSlice {
  private _native: any;

  constructor(options?: {
    order?: number;
    blockSize?: number;
    padSize?: number;
    skew?: number;
    threshFwd?: number;
    threshBack?: number;
    windowSize?: number;
    clumpLength?: number;
    minSliceLength?: number;
  }) {
    this._native = new addon.TransientSlice(options || {});
  }

  process(audioBuffer: Float32Array | Float64Array): number[] {
    return this._native.process(audioBuffer);
  }

  reset(): void {
    this._native.reset();
  }
}

/**
 * Render an additive synthesis tone via iFFT overlap-add.
 * Returns a Float32Array of audio samples, peak-normalized to 1.0.
 */
export function renderAdditive(options: import("./native.js").AdditiveRenderOptions): Float32Array {
  return addon.renderAdditive(options);
}
