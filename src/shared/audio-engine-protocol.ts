export type AudioEngineCommand =
  | { type: "play"; sampleHash: string; pcm: Float32Array; sampleRate: number; loop: boolean }
  | { type: "stop"; sampleHash: string }
  | { type: "stop-all" };

export type AudioEngineTelemetry =
  | { type: "position"; sampleHash: string; positionInSamples: number }
  | { type: "ended"; sampleHash: string }
  | { type: "error"; sampleHash?: string; code: string; message: string };
