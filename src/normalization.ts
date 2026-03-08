import type { Normalization as NativeNormalization } from "./native";

const addon = require("../build/Release/flucoma_native.node");

export class Normalization {
  private _native: NativeNormalization;

  constructor() {
    this._native = new addon.Normalization();
  }

  /**
   * Fit the scaler to the provided data matrix.
   * Computes per-column min/max and sets the target output range.
   * @param data  Matrix of shape (nSamples × nFeatures)
   * @param min   Target range minimum (default 0)
   * @param max   Target range maximum (default 1)
   */
  fit(data: number[][], min = 0, max = 1): void {
    this._native.fit(data, min, max);
  }

  /**
   * Transform a data matrix using the fitted scaler.
   * @returns Normalized matrix of the same shape
   */
  transform(data: number[][]): number[][] {
    return this._native.transform(data);
  }

  /**
   * Transform a single feature vector using the fitted scaler.
   * @returns Normalized vector of the same length
   */
  transformFrame(frame: number[]): number[] {
    return this._native.transformFrame(frame);
  }

  /** Reset the scaler — must call fit() again before transforming. */
  clear(): void {
    this._native.clear();
  }
}
