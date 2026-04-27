import type { SpectralShapeFeature as NativeSpectralShapeFeature } from "./native";

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const addon = require("../build/Release/flucoma_native.node");

export interface SpectralShapeOptions {
  windowSize?: number;
  fftSize?: number;
  hopSize?: number;
  sampleRate?: number;
  /** Minimum frequency bound in Hz. Default: 0 */
  minFreq?: number;
  /** Maximum frequency bound in Hz, or -1 to use Nyquist. Default: -1 */
  maxFreq?: number;
  /** Rolloff target percentage (0–100). Default: 95 */
  rolloffTarget?: number;
  /** Use log-frequency scale (MIDI cents). Default: false */
  logFreq?: boolean;
  /** Use power spectrum instead of magnitude. Default: false */
  usePower?: boolean;
}

/** Per-segment averaged spectral shape descriptors (7 values). */
export interface SpectralShapeResult {
  centroid: number;
  spread: number;
  skewness: number;
  kurtosis: number;
  rolloff: number;
  /** Spectral flatness in dB */
  flatness: number;
  /** Spectral crest factor in dB */
  crest: number;
}

export class SpectralShapeFeature {
  #native: NativeSpectralShapeFeature;

  constructor(options?: SpectralShapeOptions) {
    this.#native = new addon.SpectralShapeFeature(options || {});
  }

  /**
   * Process audio buffer and return averaged spectral shape descriptors.
   * Runs STFT internally (same parameters as MFCCFeature) and averages
   * the 7 descriptors across all frames.
   */
  process(audioBuffer: Float32Array | Float64Array): SpectralShapeResult {
    const raw: number[] = this.#native.process(audioBuffer);
    return {
      centroid: raw[0],
      spread:   raw[1],
      skewness: raw[2],
      kurtosis: raw[3],
      rolloff:  raw[4],
      flatness: raw[5],
      crest:    raw[6],
    };
  }

  /** Reset internal STFT state. */
  reset(): void {
    this.#native.reset();
  }
}
