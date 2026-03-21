/**
 * Utility process entry point for the native audio engine.
 *
 * Lifecycle:
 *   1. Main process forks this script via utilityProcess.fork().
 *   2. Main transfers a MessagePort to this process at startup.
 *   3. This process loads the audio_engine_native addon, constructs AudioEngine,
 *      and wires it to the MessagePort.
 *
 * Control messages received from main (via MessagePort):
 *   { type: 'play',     sampleHash, pcm: Float32Array, sampleRate, loop }
 *   { type: 'stop',     sampleHash }
 *   { type: 'stop-all' }
 *
 * Telemetry messages sent to main (via MessagePort):
 *   { type: 'position', sampleHash, positionInSamples }
 *   { type: 'ended',    sampleHash }
 */

import path from "path";
import { MessagePort } from "worker_threads";

// __dirname is always available in CommonJS (the compiled output target)
const _dirname: string = __dirname;

// The native addon lives two levels up from src/utility/ → build/Release/
const addonPath = path.resolve(_dirname, "../../build/Release/audio_engine_native");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AudioEngine } = require(addonPath) as {
  AudioEngine: new () => AudioEngineNative;
};

interface AudioEngineNative {
  play(hash: string, pcm: Float32Array, sampleRate: number, loop: boolean): void;
  stop(hash: string): void;
  stopAll(): void;
  onPosition(cb: (hash: string, positionInSamples: number) => void): void;
  onEnded(cb: (hash: string) => void): void;
  // Instrument API
  defineInstrument(id: string, kind: string, polyphony: number): void;
  freeInstrument(id: string): void;
  loadInstrumentSample(instrumentId: string, note: number, pcm: Float32Array, sampleRate: number, sampleHash: string): void;
  instrumentNoteOn(instrumentId: string, note: number, velocity: number): void;
  instrumentNoteOff(instrumentId: string, note: number): void;
  instrumentStopAll(instrumentId: string): void;
  setInstrumentParam(instrumentId: string, paramId: number, value: number): void;
  subscribeInstrumentTelemetry(instrumentId: string): void;
  unsubscribeInstrumentTelemetry(instrumentId: string): void;
}

// Obtain the MessagePort transferred from the main process.
// parentPort is available as process.parentPort in an Electron utility process.
const parentPort = (process as NodeJS.Process & { parentPort: Electron.ParentPort }).parentPort;

if (!parentPort) {
  console.error("[audio-engine-process] No parentPort — must run as utility process");
  process.exit(1);
}

let port: MessagePort | null = null;
let engine: AudioEngineNative | null = null;

// Initialize the audio engine; if it fails, the process stays alive but idle.
try {
  engine = new AudioEngine();
} catch (err) {
  console.error("[audio-engine-process] AudioEngine init failed:", err);
}

if (engine) {
  engine.onPosition((hash: string, positionInSamples: number) => {
    port?.postMessage({ type: "position", sampleHash: hash, positionInSamples });
  });

  engine.onEnded((hash: string) => {
    port?.postMessage({ type: "ended", sampleHash: hash });
  });
}

// The main process sends the MessagePort as the first message.
parentPort.once("message", (event: Electron.MessageEvent) => {
  port = event.ports[0] as unknown as MessagePort;

  port.on("message", (msg: { data: {
    type: string;
    sampleHash?: string;
    pcm?: Float32Array;
    sampleRate?: number;
    loop?: boolean;
    instrumentId?: string;
    kind?: string;
    polyphony?: number;
    note?: number;
    velocity?: number;
    paramId?: number;
    value?: number;
  }}) => {
    const data = msg.data;

    switch (data.type) {
      case "play":
        if (engine && data.sampleHash && data.pcm && data.sampleRate !== undefined && data.loop !== undefined) {
          engine.play(data.sampleHash, data.pcm, data.sampleRate, data.loop);
        }
        break;
      case "stop":
        if (engine && data.sampleHash) {
          engine.stop(data.sampleHash);
        }
        break;
      case "stop-all":
        engine?.stopAll();
        break;
      case "define-instrument":
        if (engine && data.instrumentId && data.kind && data.polyphony !== undefined) {
          engine.defineInstrument(data.instrumentId, data.kind, data.polyphony);
        }
        break;
      case "free-instrument":
        if (engine && data.instrumentId) {
          engine.freeInstrument(data.instrumentId);
        }
        break;
      case "load-instrument-sample":
        if (engine && data.instrumentId && data.note !== undefined && data.pcm && data.sampleRate !== undefined && data.sampleHash) {
          engine.loadInstrumentSample(data.instrumentId, data.note, data.pcm, data.sampleRate, data.sampleHash);
        }
        break;
      case "instrument-note-on":
        if (engine && data.instrumentId && data.note !== undefined && data.velocity !== undefined) {
          engine.instrumentNoteOn(data.instrumentId, data.note, data.velocity);
        }
        break;
      case "instrument-note-off":
        if (engine && data.instrumentId && data.note !== undefined) {
          engine.instrumentNoteOff(data.instrumentId, data.note);
        }
        break;
      case "instrument-stop-all":
        if (engine && data.instrumentId) {
          engine.instrumentStopAll(data.instrumentId);
        }
        break;
      case "set-instrument-param":
        if (engine && data.instrumentId && data.paramId !== undefined && data.value !== undefined) {
          engine.setInstrumentParam(data.instrumentId, data.paramId, data.value);
        }
        break;
      case "subscribe-instrument-telemetry":
        if (engine && data.instrumentId) {
          engine.subscribeInstrumentTelemetry(data.instrumentId);
        }
        break;
      case "unsubscribe-instrument-telemetry":
        if (engine && data.instrumentId) {
          engine.unsubscribeInstrumentTelemetry(data.instrumentId);
        }
        break;
      default:
        console.warn(`[audio-engine-process] Unknown message type: ${data.type}`);
    }
  });

  // When main closes its end of the channel, exit cleanly.
  port.once("close", () => process.exit(0));

  // MessagePort in Node.js needs start() when using the EventEmitter API
  port.start();
});

// Start receiving messages from the main process
(parentPort as Electron.ParentPort & { start?: () => void }).start?.();

// Force-exit on SIGTERM — avoids blocking in audio device destructor cleanup.
process.once("SIGTERM", () => process.kill(process.pid, "SIGKILL"));
