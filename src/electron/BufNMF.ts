// eslint-disable-next-line @typescript-eslint/no-require-imports
const flucoma = require("../../build/Release/flucoma_native.node");

export interface BufNMFOptions {
  components?: number;
  iterations?: number;
  fftSize?: number;
  hopSize?: number;
  windowSize?: number;
  seed?: number;
}

export interface BufNMFResult {
  components: number;
  iterations: number;
  converged: boolean;
  bases: number[][];
  activations: number[][];
}

interface NativeBufNMF {
  process(audioData: Float32Array, sampleRate: number): BufNMFResult;
  resynthesize(
    audioData: Float32Array,
    sampleRate: number,
    bases: number[][],
    activations: number[][],
    componentIndex: number,
  ): Float32Array;
}

export class BufNMF {
  private native: NativeBufNMF;

  constructor(options: BufNMFOptions = {}) {
    this.native = new flucoma.BufNMF(options);
  }

  process(audioData: Float32Array, sampleRate: number): BufNMFResult {
    return this.native.process(audioData, sampleRate);
  }

  resynthesize(
    audioData: Float32Array,
    sampleRate: number,
    bases: number[][],
    activations: number[][],
    componentIndex: number,
  ): Float32Array {
    return this.native.resynthesize(
      audioData,
      sampleRate,
      bases,
      activations,
      componentIndex,
    );
  }
}
