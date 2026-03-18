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
      default:
        console.warn(`[audio-engine-process] Unknown message type: ${data.type}`);
    }
  });

  // MessagePort in Node.js needs start() when using the EventEmitter API
  port.start();
});

// Start receiving messages from the main process
(parentPort as Electron.ParentPort & { start?: () => void }).start?.();

// Ensure clean exit when the main process terminates
process.once("SIGTERM", () => process.exit(0));
