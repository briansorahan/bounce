// eslint-disable-next-line @typescript-eslint/no-require-imports
const flucoma = require("../../build/Release/flucoma_native.node");

export interface BufNMFCrossOptions {
  iterations?: number;
  fftSize?: number;
  hopSize?: number;
  windowSize?: number;
  timeSparsity?: number;
  polyphony?: number;
  continuity?: number;
  seed?: number;
}

export interface BufNMFCrossResult {
  components: number;
  iterations: number;
  bases: number[][];
  activations: number[][];
}

interface NativeBufNMFCross {
  process(
    targetAudio: Float32Array,
    sampleRate: number,
    sourceBases: number[][],
    sourceActivations: number[][],
  ): BufNMFCrossResult;
}

export class BufNMFCross {
  private native: NativeBufNMFCross;

  constructor(options: BufNMFCrossOptions = {}) {
    this.native = new flucoma.BufNMFCross(options);
  }

  process(
    targetAudio: Float32Array,
    sampleRate: number,
    sourceBases: number[][],
    sourceActivations: number[][],
  ): BufNMFCrossResult {
    return this.native.process(
      targetAudio,
      sampleRate,
      sourceBases,
      sourceActivations,
    );
  }
}
