export type AudioEngineCommand =
  // Legacy (backward compat)
  | { type: "play"; sampleHash: string; pcm: Float32Array; sampleRate: number; loop: boolean }
  | { type: "stop"; sampleHash: string }
  | { type: "stop-all" }
  // Instrument lifecycle
  | { type: "define-instrument"; instrumentId: string; kind: string; polyphony: number }
  | { type: "free-instrument"; instrumentId: string }
  // Sample loading
  | { type: "load-instrument-sample"; instrumentId: string; note: number; pcm: Float32Array; sampleRate: number; sampleHash: string; loop: boolean; loopStart: number; loopEnd: number }
  // Note events
  | { type: "instrument-note-on"; instrumentId: string; note: number; velocity: number }
  | { type: "instrument-note-off"; instrumentId: string; note: number }
  | { type: "instrument-stop-all"; instrumentId: string }
  // Parameters
  | { type: "set-instrument-param"; instrumentId: string; paramId: number; value: number }
  // Telemetry control
  | { type: "subscribe-instrument-telemetry"; instrumentId: string }
  | { type: "unsubscribe-instrument-telemetry"; instrumentId: string };

export type AudioEngineTelemetry =
  | { type: "position"; sampleHash: string; positionInSamples: number }
  | { type: "ended"; sampleHash: string }
  | { type: "error"; sampleHash?: string; code: string; message: string };
