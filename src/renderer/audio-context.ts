interface AudioData {
  audioData: Float32Array;
  sampleRate: number;
  duration: number;
  filePath?: string;
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
}

interface SliceResults {
  slices: number[];
  visualize: () => void;
}

export class AudioContext {
  private currentAudio: AudioData | null = null;
  private currentSlices: number[] | null = null;
  private audioContext: globalThis.AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private startTime: number = 0;
  private isPlaying: boolean = false;
  private onPlaybackUpdate: ((position: number) => void) | null = null;
  private animationFrameId: number | null = null;

  setCurrentAudio(audio: AudioData): void {
    this.currentAudio = audio;
  }

  setPlaybackUpdateCallback(callback: (position: number) => void): void {
    this.onPlaybackUpdate = callback;
  }

  async playAudio(audioData: Float32Array, sampleRate: number): Promise<void> {
    this.stopAudio();

    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const buffer = this.audioContext.createBuffer(1, audioData.length, sampleRate);
    buffer.getChannelData(0).set(audioData);

    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = buffer;
    this.sourceNode.connect(this.audioContext.destination);

    this.sourceNode.onended = () => {
      this.isPlaying = false;
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      if (this.onPlaybackUpdate) {
        this.onPlaybackUpdate(0);
      }
    };

    this.startTime = this.audioContext.currentTime;
    this.isPlaying = true;
    this.sourceNode.start(0);

    this.updatePlaybackPosition();
  }

  private updatePlaybackPosition(): void {
    if (!this.isPlaying || !this.audioContext || !this.currentAudio) {
      return;
    }

    const elapsed = this.audioContext.currentTime - this.startTime;
    const samplePosition = elapsed * this.currentAudio.sampleRate;

    if (this.onPlaybackUpdate) {
      this.onPlaybackUpdate(samplePosition);
    }

    this.animationFrameId = requestAnimationFrame(() => this.updatePlaybackPosition());
  }

  stopAudio(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch (e) {
        // Already stopped
      }
      this.sourceNode = null;
    }

    this.isPlaying = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.onPlaybackUpdate) {
      this.onPlaybackUpdate(0);
    }
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  async evaluate(code: string): Promise<any> {
    const loadAudio = async (path: string): Promise<AudioData> => {
      const audioData = await this.loadAudioFile(path);
      
      const audio: AudioData = {
        audioData: audioData.channelData,
        sampleRate: audioData.sampleRate,
        duration: audioData.duration,
        filePath: path,
        visualize: () => {
          this.currentAudio = audio;
          return 'Waveform visualization updated';
        },
        analyzeOnsetSlice: async (options?: OnsetSliceOptions) => {
          const slices = await this.analyzeOnsetSlice(audioData.channelData, options);
          this.currentSlices = slices;
          
          return {
            slices,
            visualize: () => {
              return 'Slice markers visualization updated';
            }
          };
        }
      };

      this.currentAudio = audio;
      return audio;
    };

    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const fn = new AsyncFunction('loadAudio', `return (${code})`);
    return await fn(loadAudio);
  }

  private async loadAudioFile(path: string): Promise<{ channelData: Float32Array; sampleRate: number; duration: number }> {
    const audioData = await window.electron.readAudioFile(path);
    return audioData;
  }

  private async analyzeOnsetSlice(audioData: Float32Array, options?: OnsetSliceOptions): Promise<number[]> {
    const result = await window.electron.analyzeOnsetSlice(audioData, options);
    return result;
  }

  getCurrentAudio(): AudioData | null {
    return this.currentAudio;
  }

  getCurrentSlices(): number[] | null {
    return this.currentSlices;
  }
}
