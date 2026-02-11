import { OnsetFeature as NativeOnsetFeature } from './native';

// Re-export types
export type { OnsetFeatureOptions } from './native';

// Load the native addon
const addon = require('../build/Release/flucoma_native.node');

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

export default OnsetFeature;
