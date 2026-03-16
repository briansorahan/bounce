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

export class AudioManager {
  private currentAudio: AudioData | null = null;
  private currentSlices: number[] | null = null;
  private audioContext: globalThis.AudioContext | null = null;
  private activePlaybacks = new Map<string, ActivePlayback>();
  private playbackSerial = 0;
  private onPlaybackUpdate: ((states: PlaybackCursorState[]) => void) | null = null;
  private animationFrameId: number | null = null;

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
  ): Promise<void> {
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
    return this.activePlaybacks.size > 0;
  }

  getCurrentAudio(): AudioData | null {
    return this.currentAudio;
  }

  getPlaybackStates(): PlaybackCursorState[] {
    if (!this.audioContext) {
      return [];
    }

    return Array.from(this.activePlaybacks.values()).map((playback) => {
      const elapsed = this.audioContext!.currentTime - playback.startTime;
      let position = elapsed * playback.sampleRate;
      if (playback.loop && playback.totalSamples > 0) {
        position %= playback.totalSamples;
      } else {
        position = Math.min(position, playback.totalSamples);
      }

      return {
        hash: playback.hash,
        position,
        totalSamples: playback.totalSamples,
      };
    });
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
