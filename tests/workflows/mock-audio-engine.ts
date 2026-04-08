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

  listen(connection: MessageConnection): void {
    registerAudioEngineHandlers(connection, this);
  }
}
