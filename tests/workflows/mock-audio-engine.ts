/**
 * MockAudioEngineService — pure-TypeScript audio engine mock for workflow tests.
 *
 * Records commands and maintains state so workflow checks can assert on it
 * without requiring real audio hardware or the audio_engine_native C++ addon.
 *
 * Does NOT fire real-time telemetry (position events, transport ticks).
 * Real-time behavior remains tested by Playwright specs only.
 */

import { ResponseError, type MessageConnection } from "vscode-jsonrpc";
import {
  registerAudioEngineHandlers,
  type AudioEngineHandlers,
  type AudioEngineRpc,
} from "../../src/shared/rpc/audio-engine.rpc";

export class MockAudioEngineService implements AudioEngineHandlers {
  private activeSampleHashes = new Set<string>();
  private bpm = 120;
  private transportRunning = false;
  private patterns = new Map<number, string>();
  private instruments = new Set<string>();
  private fakeDevices: Array<{ index: number; name: string }> = [
    { index: 0, name: "Mock Microphone" },
    { index: 1, name: "Mock Line In" },
  ];
  private recordingActive = false;
  private recordingDeviceIndex = -1;
  private recordingSampleRate = 44100;

  async play(params: AudioEngineRpc["play"]["params"]): Promise<void> {
    this.activeSampleHashes.add(params.sampleHash);
  }

  async stop(params: AudioEngineRpc["stop"]["params"]): Promise<void> {
    this.activeSampleHashes.delete(params.sampleHash);
  }

  async stopAll(_params: AudioEngineRpc["stopAll"]["params"]): Promise<void> {
    this.activeSampleHashes.clear();
  }

  async defineInstrument(params: AudioEngineRpc["defineInstrument"]["params"]): Promise<void> {
    this.instruments.add(params.instrumentId);
  }

  async freeInstrument(params: AudioEngineRpc["freeInstrument"]["params"]): Promise<void> {
    this.instruments.delete(params.instrumentId);
  }

  async loadInstrumentSample(_params: AudioEngineRpc["loadInstrumentSample"]["params"]): Promise<void> {
    // No-op — accept and ignore.
  }

  async instrumentNoteOn(_params: AudioEngineRpc["instrumentNoteOn"]["params"]): Promise<void> {
    // No-op — accept and ignore.
  }

  async instrumentNoteOff(_params: AudioEngineRpc["instrumentNoteOff"]["params"]): Promise<void> {
    // No-op — accept and ignore.
  }

  async instrumentStopAll(_params: AudioEngineRpc["instrumentStopAll"]["params"]): Promise<void> {
    // No-op — accept and ignore.
  }

  async setInstrumentParam(_params: AudioEngineRpc["setInstrumentParam"]["params"]): Promise<void> {
    // No-op — accept and ignore.
  }

  async transportStart(_params: AudioEngineRpc["transportStart"]["params"]): Promise<void> {
    this.transportRunning = true;
  }

  async transportStop(_params: AudioEngineRpc["transportStop"]["params"]): Promise<void> {
    this.transportRunning = false;
  }

  async setBpm(params: AudioEngineRpc["setBpm"]["params"]): Promise<void> {
    if (params.bpm <= 0 || params.bpm > 400) {
      throw new ResponseError(-32602, "BPM out of range: must be between 1 and 400");
    }
    this.bpm = params.bpm;
  }

  async getBpm(_params: AudioEngineRpc["getBpm"]["params"]): Promise<{ bpm: number }> {
    return { bpm: this.bpm };
  }

  async setPattern(params: AudioEngineRpc["setPattern"]["params"]): Promise<void> {
    this.patterns.set(params.channelIndex, params.stepsJson);
  }

  async clearPattern(params: AudioEngineRpc["clearPattern"]["params"]): Promise<void> {
    this.patterns.delete(params.channelIndex);
  }

  async getPlaybackState(_params: AudioEngineRpc["getPlaybackState"]["params"]): Promise<{ activeSampleHashes: string[] }> {
    return { activeSampleHashes: Array.from(this.activeSampleHashes) };
  }

  async isTransportRunning(_params: AudioEngineRpc["isTransportRunning"]["params"]): Promise<{ running: boolean }> {
    return { running: this.transportRunning };
  }

  async getPattern(params: AudioEngineRpc["getPattern"]["params"]): Promise<{ stepsJson: string | null }> {
    return { stepsJson: this.patterns.get(params.channelIndex) ?? null };
  }

  async getInstruments(_params: AudioEngineRpc["getInstruments"]["params"]): Promise<{ instrumentIds: string[] }> {
    return { instrumentIds: Array.from(this.instruments) };
  }

  async listAudioInputs(_params: AudioEngineRpc["listAudioInputs"]["params"]): Promise<{ devices: Array<{ index: number; name: string }> }> {
    return { devices: [...this.fakeDevices] };
  }

  async startRecording(params: AudioEngineRpc["startRecording"]["params"]): Promise<void> {
    if (this.recordingActive) {
      throw new ResponseError(-32602, "startRecording: already recording");
    }
    this.recordingActive = true;
    this.recordingDeviceIndex = params.deviceIndex;
    this.recordingSampleRate = params.sampleRate ?? 44100;
  }

  async stopRecording(_params: AudioEngineRpc["stopRecording"]["params"]): Promise<{ pcm: number[]; sampleRate: number; channels: number; duration: number }> {
    if (!this.recordingActive) {
      throw new ResponseError(-32602, "stopRecording: not currently recording");
    }
    this.recordingActive = false;
    // Return a short burst of silence (0.1s at the requested sample rate)
    const nFrames = Math.round(this.recordingSampleRate * 0.1);
    const pcm = new Array<number>(nFrames).fill(0);
    return {
      pcm,
      sampleRate: this.recordingSampleRate,
      channels: 1,
      duration: nFrames / this.recordingSampleRate,
    };
  }

  listen(connection: MessageConnection): void {
    registerAudioEngineHandlers(connection, this);
  }
}
