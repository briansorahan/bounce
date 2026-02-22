import {
  OnsetFeature as NativeOnsetFeature,
  OnsetSlice as NativeOnsetSlice,
} from "./native";

// Re-export types
export type { OnsetFeatureOptions, OnsetSliceOptions } from "./native";

// Load the native addon
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
}

export default OnsetFeature;
