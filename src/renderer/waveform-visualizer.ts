export class WaveformVisualizer {
  private waveformCanvas: HTMLCanvasElement;
  private waveformCtx: CanvasRenderingContext2D;
  private playbackCursorPosition: number = 0;
  private currentAudioData: Float32Array | null = null;
  private currentSampleRate: number = 0;
  private currentSlices: number[] | null = null;

  constructor(waveformCanvasId: string) {
    this.waveformCanvas = document.getElementById(waveformCanvasId) as HTMLCanvasElement;

    const waveformCtx = this.waveformCanvas.getContext('2d');

    if (!waveformCtx) {
      throw new Error('Failed to get canvas context');
    }

    this.waveformCtx = waveformCtx;

    this.setupCanvas();
  }

  private setupCanvas(): void {
    const resize = () => {
      const container = this.waveformCanvas.parentElement;
      if (!container) return;

      const rect = this.waveformCanvas.getBoundingClientRect();
      this.waveformCanvas.width = rect.width;
      this.waveformCanvas.height = rect.height;

      // Redraw waveform after resize if we have audio data
      if (this.currentAudioData && this.currentSampleRate) {
        this.drawWaveform(this.currentAudioData, this.currentSampleRate, this.currentSlices || undefined);
      }
    };

    resize();
    window.addEventListener('resize', resize);
  }

  drawWaveform(audioData: Float32Array, sampleRate: number, slices?: number[]): void {
    this.currentAudioData = audioData;
    this.currentSampleRate = sampleRate;
    this.currentSlices = slices || null;
    
    const width = this.waveformCanvas.width;
    const height = this.waveformCanvas.height;
    const ctx = this.waveformCtx;

    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#4ec9b0';
    ctx.lineWidth = 1;

    const step = Math.ceil(audioData.length / width);
    const amp = height / 2;

    ctx.beginPath();
    ctx.moveTo(0, amp);

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;

      for (let j = 0; j < step; j++) {
        const index = i * step + j;
        if (index < audioData.length) {
          const datum = audioData[index];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
      }

      const yMin = (1 + min) * amp;
      const yMax = (1 + max) * amp;

      ctx.moveTo(i, yMin);
      ctx.lineTo(i, yMax);
    }

    ctx.stroke();

    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, amp);
    ctx.lineTo(width, amp);
    ctx.stroke();

    // Draw onset slice markers if present
    if (this.currentSlices && this.currentSlices.length > 0) {
      this.drawOnsetMarkers(this.currentSlices, audioData.length);
    }

    ctx.fillStyle = '#666666';
    ctx.font = '12px monospace';
    const duration = audioData.length / sampleRate;
    ctx.fillText(`Duration: ${duration.toFixed(2)}s`, 10, 20);
    ctx.fillText(`Sample Rate: ${sampleRate}Hz`, 10, 35);
    ctx.fillText(`Samples: ${audioData.length}`, 10, 50);
    
    // Show slice info if present
    if (this.currentSlices && this.currentSlices.length > 0) {
      ctx.fillStyle = '#f14c4c';
      ctx.fillText(`Onset Slices: ${this.currentSlices.length}`, 10, 65);
      const avgInterval = duration / this.currentSlices.length;
      ctx.fillText(`Avg Interval: ${avgInterval.toFixed(3)}s`, 10, 80);
    }

    this.drawPlaybackCursor(audioData.length);
  }

  private drawOnsetMarkers(slices: number[], totalSamples: number): void {
    const width = this.waveformCanvas.width;
    const height = this.waveformCanvas.height;
    const ctx = this.waveformCtx;

    ctx.strokeStyle = '#f14c4c';
    ctx.lineWidth = 2;

    for (const slice of slices) {
      const x = (slice / totalSamples) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }

  updatePlaybackCursor(position: number, totalSamples: number): void {
    this.playbackCursorPosition = position;
    
    if (this.currentAudioData && this.currentSampleRate) {
      this.drawWaveform(this.currentAudioData, this.currentSampleRate, this.currentSlices || undefined);
    }
  }

  private drawPlaybackCursor(totalSamples: number): void {
    if (this.playbackCursorPosition <= 0) {
      return;
    }

    const width = this.waveformCanvas.width;
    const height = this.waveformCanvas.height;
    const ctx = this.waveformCtx;

    const x = (this.playbackCursorPosition / totalSamples) * width;

    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  private audioContext: any = null;

  setAudioContext(audioContext: any): void {
    this.audioContext = audioContext;
  }
}
