export interface NMFOverlayData {
  components: number;
  bases: Float32Array[] | number[][];
  activations: Float32Array[] | number[][];
}

export class WaveformVisualizer {
  private waveformCanvas: HTMLCanvasElement;
  private waveformCtx: CanvasRenderingContext2D;
  private playbackCursorPosition: number = 0;
  private currentAudioData: Float32Array | null = null;
  private currentSampleRate: number = 0;
  private currentSlices: number[] | null = null;
  private currentNMFData: NMFOverlayData | null = null;

  constructor(waveformCanvasId: string) {
    this.waveformCanvas = document.getElementById(waveformCanvasId) as HTMLCanvasElement;

    const waveformCtx = this.waveformCanvas.getContext('2d');

    if (!waveformCtx) {
      throw new Error('Failed to get canvas context');
    }

    this.waveformCtx = waveformCtx;

    this.setupCanvas();
  }

  private debugLog(level: string, message: string, data?: Record<string, unknown>): void {
    if (window.electron?.debugLog) {
      window.electron.debugLog(level, message, data);
    }
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

  setNMFOverlay(nmfData: NMFOverlayData | null): void {
    this.currentNMFData = nmfData;
    // Redraw to show the overlay
    if (this.currentAudioData && this.currentSampleRate) {
      this.drawWaveform(this.currentAudioData, this.currentSampleRate, this.currentSlices || undefined);
    }
  }

  drawWaveform(audioData: Float32Array, sampleRate: number, slices?: number[]): void {
    this.currentAudioData = audioData;
    this.currentSampleRate = sampleRate;
    this.currentSlices = slices || null;
    
    this.debugLog('debug', '[WaveformVisualizer] drawWaveform called', {
      audioDataLength: audioData.length,
      sampleRate,
      slicesCount: this.currentSlices?.length || 0,
      slicesPresent: !!this.currentSlices
    });
    
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
      let hasData = false;

      for (let j = 0; j < step; j++) {
        const index = i * step + j;
        if (index < audioData.length) {
          const datum = audioData[index];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
          hasData = true;
        }
      }

      // Only draw if we have actual audio data for this pixel
      if (hasData) {
        const yMin = (1 + min) * amp;
        const yMax = (1 + max) * amp;

        ctx.moveTo(i, yMin);
        ctx.lineTo(i, yMax);
      }
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

    // Draw NMF overlay if present
    if (this.currentNMFData) {
      this.drawNMFOverlay();
    }

    this.drawPlaybackCursor(audioData.length);
  }

  private drawNMFOverlay(): void {
    if (!this.currentNMFData) return;

    const width = this.waveformCanvas.width;
    const height = this.waveformCanvas.height;
    const ctx = this.waveformCtx;
    const { activations, components } = this.currentNMFData;

    if (!activations || activations.length === 0) return;

    this.debugLog('debug', '[WaveformVisualizer] Drawing NMF overlay', {
      components,
      activationsLength: activations.length
    });

    // Draw each component's activation as a colored line overlay
    const colors = [
      'rgba(255, 99, 132, 0.7)',   // red
      'rgba(54, 162, 235, 0.7)',   // blue
      'rgba(255, 206, 86, 0.7)',   // yellow
      'rgba(75, 192, 192, 0.7)',   // teal
      'rgba(153, 102, 255, 0.7)',  // purple
      'rgba(255, 159, 64, 0.7)',   // orange
      'rgba(199, 199, 199, 0.7)',  // gray
      'rgba(83, 102, 255, 0.7)',   // indigo
      'rgba(255, 99, 255, 0.7)',   // pink
      'rgba(99, 255, 132, 0.7)',   // green
    ];

    for (let c = 0; c < activations.length; c++) {
      const activation = activations[c];
      if (!activation || activation.length === 0) continue;

      // Find max for normalization
      let maxVal = 0;
      for (let i = 0; i < activation.length; i++) {
        const val = activation[i];
        if (val > maxVal) maxVal = val;
      }

      if (maxVal === 0) continue;

      ctx.strokeStyle = colors[c % colors.length];
      ctx.lineWidth = 2;
      ctx.beginPath();

      const stepX = width / activation.length;
      const baseY = height * 0.5; // Center line
      const amplitude = height * 0.4; // Max amplitude

      for (let i = 0; i < activation.length; i++) {
        const x = i * stepX;
        const normalized = activation[i] / maxVal;
        const y = baseY - (normalized * amplitude);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    }

    // Draw legend
    ctx.font = '10px monospace';
    const legendY = height - 10;
    for (let c = 0; c < Math.min(activations.length, 10); c++) {
      ctx.fillStyle = colors[c % colors.length];
      ctx.fillRect(10 + c * 25, legendY - 8, 10, 10);
      ctx.fillStyle = '#888888';
      ctx.fillText(`${c + 1}`, 22 + c * 25, legendY);
    }
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

  updatePlaybackCursor(position: number, _totalSamples: number): void {
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
    
    this.debugLog('debug', '[WaveformVisualizer] drawPlaybackCursor', {
      position: this.playbackCursorPosition,
      totalSamples,
      x,
      width,
      ratio: this.playbackCursorPosition / totalSamples
    });
    
    // Don't draw cursor if it's beyond the canvas
    if (x < 0 || x > width) {
      return;
    }

    ctx.save();
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.restore();
  }

  private storedAudioManager: unknown = null;

  setAudioContext(audioManager: unknown): void {
    this.storedAudioManager = audioManager;
  }

  getCanvas(): HTMLCanvasElement {
    return this.waveformCanvas;
  }
}
