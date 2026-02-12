interface AudioData {
  audioData: Float32Array;
  sampleRate: number;
  duration: number;
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

  async evaluate(code: string): Promise<any> {
    const loadAudio = async (path: string): Promise<AudioData> => {
      const audioData = await this.loadAudioFile(path);
      
      const audio: AudioData = {
        audioData: audioData.channelData,
        sampleRate: audioData.sampleRate,
        duration: audioData.duration,
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
