import { RequestType, ResponseError, type MessageConnection } from "vscode-jsonrpc";
import type { RpcContract } from "./types";

// ---------------------------------------------------------------------------
// Contract
// AudioEngine handles real-time sample playback, instrument voice management,
// mixer control, and transport/sequencer.
//
// In production this runs as an Electron utility process (audio_engine_native
// C++ addon). In workflow tests it is backed by MockAudioEngineService.
//
// Note: pcm data is number[] rather than Float32Array because JSON-RPC
// serializes typed arrays poorly (they become plain objects).
// ---------------------------------------------------------------------------

export interface AudioEngineRpc extends RpcContract {
  // ---- Playback -----------------------------------------------------------
  play: {
    params: {
      sampleHash: string;
      pcm: number[];
      sampleRate: number;
      loop: boolean;
      loopStart?: number;
      loopEnd?: number;
    };
    result: void;
  };
  stop: {
    params: { sampleHash: string };
    result: void;
  };
  stopAll: {
    params: Record<string, never>;
    result: void;
  };

  // ---- Instrument lifecycle -----------------------------------------------
  defineInstrument: {
    params: { instrumentId: string; kind: string; polyphony: number };
    result: void;
  };
  freeInstrument: {
    params: { instrumentId: string };
    result: void;
  };
  loadInstrumentSample: {
    params: {
      instrumentId: string;
      note: number;
      pcm: number[];
      sampleRate: number;
      sampleHash: string;
      loop: boolean;
      loopStart: number;
      loopEnd: number;
    };
    result: void;
  };
  instrumentNoteOn: {
    params: { instrumentId: string; note: number; velocity: number };
    result: void;
  };
  instrumentNoteOff: {
    params: { instrumentId: string; note: number };
    result: void;
  };
  instrumentStopAll: {
    params: { instrumentId: string };
    result: void;
  };
  setInstrumentParam: {
    params: { instrumentId: string; paramId: number; value: number };
    result: void;
  };

  // ---- Transport ----------------------------------------------------------
  transportStart: {
    params: Record<string, never>;
    result: void;
  };
  transportStop: {
    params: Record<string, never>;
    result: void;
  };
  setBpm: {
    params: { bpm: number };
    result: void;
  };
  getBpm: {
    params: Record<string, never>;
    result: { bpm: number };
  };
  setPattern: {
    params: { channelIndex: number; stepsJson: string };
    result: void;
  };
  clearPattern: {
    params: { channelIndex: number };
    result: void;
  };

  // ---- State queries (mock-friendly) --------------------------------------
  getPlaybackState: {
    params: Record<string, never>;
    result: { activeSampleHashes: string[] };
  };
  isTransportRunning: {
    params: Record<string, never>;
    result: { running: boolean };
  };
  getPattern: {
    params: { channelIndex: number };
    result: { stepsJson: string | null };
  };
  getInstruments: {
    params: Record<string, never>;
    result: { instrumentIds: string[] };
  };

  // ---- Audio input enumeration -------------------------------------------
  listAudioInputs: {
    params: Record<string, never>;
    result: { devices: Array<{ index: number; name: string }> };
  };

  // ---- Recording ----------------------------------------------------------
  startRecording: {
    params: { deviceIndex: number; sampleRate?: number };
    result: void;
  };
  stopRecording: {
    params: Record<string, never>;
    result: { pcm: number[]; sampleRate: number; channels: number; duration: number };
  };
}

// ---------------------------------------------------------------------------
// JSON-RPC RequestType objects
// ---------------------------------------------------------------------------

type E = ResponseError;

export const AudioEngineRequest = {
  play:                 new RequestType<AudioEngineRpc["play"]["params"],                 void,                          E>("audioEngine/play"),
  stop:                 new RequestType<AudioEngineRpc["stop"]["params"],                 void,                          E>("audioEngine/stop"),
  stopAll:              new RequestType<AudioEngineRpc["stopAll"]["params"],              void,                          E>("audioEngine/stopAll"),
  defineInstrument:     new RequestType<AudioEngineRpc["defineInstrument"]["params"],     void,                          E>("audioEngine/defineInstrument"),
  freeInstrument:       new RequestType<AudioEngineRpc["freeInstrument"]["params"],       void,                          E>("audioEngine/freeInstrument"),
  loadInstrumentSample: new RequestType<AudioEngineRpc["loadInstrumentSample"]["params"], void,                          E>("audioEngine/loadInstrumentSample"),
  instrumentNoteOn:     new RequestType<AudioEngineRpc["instrumentNoteOn"]["params"],     void,                          E>("audioEngine/instrumentNoteOn"),
  instrumentNoteOff:    new RequestType<AudioEngineRpc["instrumentNoteOff"]["params"],    void,                          E>("audioEngine/instrumentNoteOff"),
  instrumentStopAll:    new RequestType<AudioEngineRpc["instrumentStopAll"]["params"],    void,                          E>("audioEngine/instrumentStopAll"),
  setInstrumentParam:   new RequestType<AudioEngineRpc["setInstrumentParam"]["params"],   void,                          E>("audioEngine/setInstrumentParam"),
  transportStart:       new RequestType<AudioEngineRpc["transportStart"]["params"],       void,                          E>("audioEngine/transportStart"),
  transportStop:        new RequestType<AudioEngineRpc["transportStop"]["params"],        void,                          E>("audioEngine/transportStop"),
  setBpm:               new RequestType<AudioEngineRpc["setBpm"]["params"],               void,                          E>("audioEngine/setBpm"),
  getBpm:               new RequestType<AudioEngineRpc["getBpm"]["params"],               { bpm: number },               E>("audioEngine/getBpm"),
  setPattern:           new RequestType<AudioEngineRpc["setPattern"]["params"],           void,                          E>("audioEngine/setPattern"),
  clearPattern:         new RequestType<AudioEngineRpc["clearPattern"]["params"],         void,                          E>("audioEngine/clearPattern"),
  getPlaybackState:     new RequestType<AudioEngineRpc["getPlaybackState"]["params"],     { activeSampleHashes: string[] }, E>("audioEngine/getPlaybackState"),
  isTransportRunning:   new RequestType<AudioEngineRpc["isTransportRunning"]["params"],   { running: boolean },          E>("audioEngine/isTransportRunning"),
  getPattern:           new RequestType<AudioEngineRpc["getPattern"]["params"],           { stepsJson: string | null },  E>("audioEngine/getPattern"),
  getInstruments:       new RequestType<AudioEngineRpc["getInstruments"]["params"],       { instrumentIds: string[] },   E>("audioEngine/getInstruments"),
  listAudioInputs:      new RequestType<AudioEngineRpc["listAudioInputs"]["params"],      { devices: Array<{ index: number; name: string }> }, E>("audioEngine/listAudioInputs"),
  startRecording:       new RequestType<AudioEngineRpc["startRecording"]["params"],       void,                          E>("audioEngine/startRecording"),
  stopRecording:        new RequestType<AudioEngineRpc["stopRecording"]["params"],        { pcm: number[]; sampleRate: number; channels: number; duration: number }, E>("audioEngine/stopRecording"),
} as const;

// ---------------------------------------------------------------------------
// AudioEngineHandlers — implemented by MockAudioEngineService (tests) and
// eventually a production AudioEngineService (if wired via JSON-RPC).
// ---------------------------------------------------------------------------

export interface AudioEngineHandlers {
  play(params:                 AudioEngineRpc["play"]["params"]):                 Promise<void>;
  stop(params:                 AudioEngineRpc["stop"]["params"]):                 Promise<void>;
  stopAll(params:              AudioEngineRpc["stopAll"]["params"]):              Promise<void>;
  defineInstrument(params:     AudioEngineRpc["defineInstrument"]["params"]):     Promise<void>;
  freeInstrument(params:       AudioEngineRpc["freeInstrument"]["params"]):       Promise<void>;
  loadInstrumentSample(params: AudioEngineRpc["loadInstrumentSample"]["params"]): Promise<void>;
  instrumentNoteOn(params:     AudioEngineRpc["instrumentNoteOn"]["params"]):     Promise<void>;
  instrumentNoteOff(params:    AudioEngineRpc["instrumentNoteOff"]["params"]):    Promise<void>;
  instrumentStopAll(params:    AudioEngineRpc["instrumentStopAll"]["params"]):    Promise<void>;
  setInstrumentParam(params:   AudioEngineRpc["setInstrumentParam"]["params"]):   Promise<void>;
  transportStart(params:       AudioEngineRpc["transportStart"]["params"]):       Promise<void>;
  transportStop(params:        AudioEngineRpc["transportStop"]["params"]):        Promise<void>;
  setBpm(params:               AudioEngineRpc["setBpm"]["params"]):               Promise<void>;
  getBpm(params:               AudioEngineRpc["getBpm"]["params"]):               Promise<{ bpm: number }>;
  setPattern(params:           AudioEngineRpc["setPattern"]["params"]):           Promise<void>;
  clearPattern(params:         AudioEngineRpc["clearPattern"]["params"]):         Promise<void>;
  getPlaybackState(params:     AudioEngineRpc["getPlaybackState"]["params"]):     Promise<{ activeSampleHashes: string[] }>;
  isTransportRunning(params:   AudioEngineRpc["isTransportRunning"]["params"]):   Promise<{ running: boolean }>;
  getPattern(params:           AudioEngineRpc["getPattern"]["params"]):           Promise<{ stepsJson: string | null }>;
  getInstruments(params:       AudioEngineRpc["getInstruments"]["params"]):       Promise<{ instrumentIds: string[] }>;
  listAudioInputs(params:      AudioEngineRpc["listAudioInputs"]["params"]):      Promise<{ devices: Array<{ index: number; name: string }> }>;
  startRecording(params:       AudioEngineRpc["startRecording"]["params"]):       Promise<void>;
  stopRecording(params:        AudioEngineRpc["stopRecording"]["params"]):        Promise<{ pcm: number[]; sampleRate: number; channels: number; duration: number }>;
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Register all AudioEngine handlers on the given connection.
 * Call `connection.listen()` after this.
 */
export function registerAudioEngineHandlers(
  connection: MessageConnection,
  handlers: AudioEngineHandlers,
): void {
  for (const [key, reqType] of Object.entries(AudioEngineRequest)) {
    const method = key as keyof AudioEngineHandlers;
    connection.onRequest(reqType as RequestType<unknown, unknown, E>, (params) =>
      (handlers[method] as (p: unknown) => Promise<unknown>)(params),
    );
  }
}

/**
 * Wrap a MessageConnection as a typed AudioEngineClient.
 */
export function createAudioEngineClient(connection: MessageConnection): {
  invoke<K extends keyof AudioEngineRpc & string>(
    method: K,
    params: AudioEngineRpc[K]["params"],
  ): Promise<AudioEngineRpc[K]["result"]>;
} {
  return {
    invoke(method, params) {
      const reqType = AudioEngineRequest[method as keyof typeof AudioEngineRequest];
      return connection.sendRequest(
        reqType as RequestType<unknown, AudioEngineRpc[typeof method]["result"], E>,
        params,
      );
    },
  };
}
