/// <reference path="./types.d.ts" />
// Browser compatibility types
interface WebkitWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

interface AudioData {
  audioData: Float32Array;
  sampleRate: number;
  duration: number;
  filePath?: string;
  hash?: string;
  visualize: () => void;
  analyzeOnsetSlice: (options?: OnsetSliceOptions) => Promise<SliceResults>;
}

interface OnsetSliceOptions {
  function?: number;
  threshold?: number;
  minSliceLength?: number;
  filterSize?: number;
  windowSize?: number;
  fftSize?: number;
  hopSize?: number;
  [key: string]: unknown;
}

interface SliceResults {
  slices: number[];
  visualize: () => void;
}

export interface PlaybackCursorState {
  hash: string | null;
  position: number;
  totalSamples: number;
}

interface ActivePlayback {
  readonly key: string;
  readonly hash: string | null;
  readonly sourceNode: AudioBufferSourceNode;
  readonly startTime: number;
  readonly sampleRate: number;
  readonly totalSamples: number;
  readonly loop: boolean;
}

interface NativePlaybackEntry {
  readonly hash: string;
  readonly totalSamples: number;
  readonly sampleRate: number;
  positionInSamples: number;
  ended: boolean;
}

export class AudioManager {
  private currentAudio: AudioData | null = null;
  private currentSlices: number[] | null = null;
  private audioContext: globalThis.AudioContext | null = null;
  // Web Audio playbacks (fallback for hashless calls)
  private activePlaybacks = new Map<string, ActivePlayback>();
  private playbackSerial = 0;
  private onPlaybackUpdate: ((states: PlaybackCursorState[]) => void) | null = null;
  private animationFrameId: number | null = null;
  // Native engine playbacks (IPC-driven)
  private nativePlaybacks = new Map<string, NativePlaybackEntry>();

  setCurrentAudio(audio: AudioData): void {
    this.currentAudio = audio;
  }

  setPlaybackUpdateCallback(callback: (states: PlaybackCursorState[]) => void): void {
    this.onPlaybackUpdate = callback;
  }

  async playAudio(
    audioData: Float32Array,
    sampleRate: number,
    loop = false,
    hash?: string,
    loopStart?: number,
    loopEnd?: number,
  ): Promise<void> {
    // Use the native engine when a hash is available and the IPC channel exists.
    if (hash && window.electron?.playSample) {
      this.stopAudio(hash); // remove any prior playback for this hash
      this.nativePlaybacks.set(hash, {
        hash,
        totalSamples: audioData.length,
        sampleRate,
        positionInSamples: 0,
        ended: false,
      });
      window.electron.playSample(hash, loop, loopStart, loopEnd);
      this.syncPlaybackUpdates();
      return;
    }

    // Fallback: Web Audio path (used for hashless corpus resynthesis, etc.)
    if (!this.audioContext) {
      const win = window as WebkitWindow;
      const AudioContextClass = window.AudioContext || win.webkitAudioContext;
      if (AudioContextClass) {
        this.audioContext = new AudioContextClass();
      }
    }

    if (!this.audioContext) {
      throw new Error("AudioContext not available");
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    const playbackKey = hash ?? `playback-${this.playbackSerial++}`;
    this.stopAudio(playbackKey);

    const buffer = this.audioContext.createBuffer(
      1,
      audioData.length,
      sampleRate,
    );
    buffer.getChannelData(0).set(audioData);

    const sourceNode = this.audioContext.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.loop = loop;
    if (loop && loopStart !== undefined) sourceNode.loopStart = loopStart;
    if (loop && loopEnd !== undefined && loopEnd >= 0) sourceNode.loopEnd = loopEnd;
    sourceNode.connect(this.audioContext.destination);

    sourceNode.onended = () => {
      const playback = this.activePlaybacks.get(playbackKey);
      if (!playback || playback.sourceNode !== sourceNode) {
        return;
      }
      this.activePlaybacks.delete(playbackKey);
      this.syncPlaybackUpdates();
    };

    const playback: ActivePlayback = {
      key: playbackKey,
      hash: hash ?? null,
      sourceNode,
      startTime: this.audioContext.currentTime,
      sampleRate,
      totalSamples: audioData.length,
      loop,
    };

    this.activePlaybacks.set(playbackKey, playback);
    sourceNode.start(0);

    this.syncPlaybackUpdates();
  }

  private updatePlaybackPosition(): void {
    if (!this.audioContext || this.activePlaybacks.size === 0) {
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      return;
    }

    this.emitPlaybackUpdates();

    this.animationFrameId = requestAnimationFrame(() =>
      this.updatePlaybackPosition(),
    );
  }

  stopAudio(hash?: string): void {
    // Stop native playbacks
    if (window.electron?.stopSample) {
      const nativeKeys = hash ? [hash] : Array.from(this.nativePlaybacks.keys());
      for (const key of nativeKeys) {
        if (this.nativePlaybacks.has(key)) {
          this.nativePlaybacks.delete(key);
        }
      }
      window.electron.stopSample(hash);
    }

    // Stop Web Audio playbacks
    const keys = hash ? [hash] : Array.from(this.activePlaybacks.keys());
    let stoppedAny = false;

    for (const key of keys) {
      const playback = this.activePlaybacks.get(key);
      if (!playback) {
        continue;
      }

      stoppedAny = true;
      try {
        playback.sourceNode.onended = null;
        playback.sourceNode.stop();
      } catch {
        // Already stopped.
      }
      this.activePlaybacks.delete(key);
    }

    if (stoppedAny || !hash) {
      this.syncPlaybackUpdates();
    }
  }

  getIsPlaying(): boolean {
    const nativeActive = Array.from(this.nativePlaybacks.values()).some((e) => !e.ended);
    return this.activePlaybacks.size > 0 || nativeActive;
  }

  getCurrentAudio(): AudioData | null {
    return this.currentAudio;
  }

  getPlaybackStates(): PlaybackCursorState[] {
    const states: PlaybackCursorState[] = [];

    // Native engine playbacks — driven by telemetry snapshots
    for (const entry of this.nativePlaybacks.values()) {
      states.push({
        hash: entry.hash,
        position: entry.positionInSamples,
        totalSamples: entry.totalSamples,
      });
    }

    // Web Audio fallback playbacks
    if (this.audioContext) {
      for (const playback of this.activePlaybacks.values()) {
        const elapsed = this.audioContext.currentTime - playback.startTime;
        let position = elapsed * playback.sampleRate;
        if (playback.loop && playback.totalSamples > 0) {
          position %= playback.totalSamples;
        } else {
          position = Math.min(position, playback.totalSamples);
        }
        states.push({
          hash: playback.hash,
          position,
          totalSamples: playback.totalSamples,
        });
      }
    }

    return states;
  }

  /** Called by app.ts when playback-position telemetry arrives from main. */
  updateNativePosition(hash: string, positionInSamples: number): void {
    const entry = this.nativePlaybacks.get(hash);
    if (entry) {
      entry.positionInSamples = positionInSamples;
      this.emitPlaybackUpdates();
    }
  }

  /** Called by app.ts when playback-ended telemetry arrives from main. */
  removeNativePlayback(hash: string): void {
    const entry = this.nativePlaybacks.get(hash);
    if (entry) {
      entry.ended = true;
      // Keep the entry so the cursor remains at the final position.
      // It will be removed when stopAudio() is called explicitly.
      this.syncPlaybackUpdates();
    }
  }

  setCurrentSlices(slices: number[]): void {
    this.currentSlices = slices;
  }

  getCurrentSlices(): number[] | null {
    if (window.electron?.debugLog) {
      window.electron.debugLog(
        "debug",
        "[AudioContext] getCurrentSlices called",
        {
          slicesCount: this.currentSlices?.length || 0,
          slicesPresent: !!this.currentSlices,
        },
      );
    }
    return this.currentSlices;
  }

  clearSlices(): void {
    if (window.electron?.debugLog) {
      window.electron.debugLog("debug", "[AudioContext] clearSlices called", {
        previousSlicesCount: this.currentSlices?.length || 0,
      });
    }
    this.currentSlices = null;
  }

  private syncPlaybackUpdates(): void {
    if (this.activePlaybacks.size === 0) {
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      this.emitPlaybackUpdates();
      return;
    }

    if (this.animationFrameId === null) {
      this.animationFrameId = requestAnimationFrame(() =>
        this.updatePlaybackPosition(),
      );
    }

    this.emitPlaybackUpdates();
  }

  private emitPlaybackUpdates(): void {
    this.onPlaybackUpdate?.(this.getPlaybackStates());
  }
}
