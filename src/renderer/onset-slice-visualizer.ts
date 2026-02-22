import { Visualization } from "./visualization-manager.js";

export class OnsetSliceVisualizer {
  private visualization: Visualization;
  private slices: number[];
  private audioData: Float32Array;
  private sampleRate: number;

  constructor(
    visualization: Visualization,
    slices: number[],
    audioData: Float32Array,
    sampleRate: number,
  ) {
    this.visualization = visualization;
    this.slices = slices;
    this.audioData = audioData;
    this.sampleRate = sampleRate;

    window.electron.debugLog("info", "[OnsetSliceViz] Constructor called", {
      vizId: visualization.id,
      sliceCount: slices.length,
      samples: audioData.length,
      sampleRate,
    });

    // Set the draw function
    this.visualization.draw = () => this.draw();

    // Initial draw
    this.draw();
  }

  private draw(): void {
    const canvas = this.visualization.canvas;
    const ctx = this.visualization.context;
    const width = canvas.width;
    const height = canvas.height;

    window.electron.debugLog("info", "[OnsetSliceViz] Drawing", {
      vizId: this.visualization.id,
      canvasSize: `${width}x${height}`,
      sliceCount: this.slices.length,
    });

    // Clear with a distinct background
    ctx.fillStyle = "#252525";
    ctx.fillRect(0, 0, width, height);

    if (this.slices.length === 0) {
      this.drawNoData(ctx, width, height);
      return;
    }

    // Draw waveform in background
    this.drawWaveform(ctx, width, height);

    // Draw slice markers
    this.drawSliceMarkers(ctx, width, height);

    // Draw legend
    this.drawLegend(ctx);

    window.electron.debugLog("info", "[OnsetSliceViz] Drawing complete", {
      vizId: this.visualization.id,
    });
  }

  private drawNoData(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    ctx.fillStyle = "#666";
    ctx.font = "14px monospace";
    ctx.textAlign = "center";
    ctx.fillText("No onset slices detected", width / 2, height / 2);
  }

  private drawWaveform(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    const step = Math.ceil(this.audioData.length / width);
    const amp = height / 2;

    ctx.strokeStyle = "#4ec9b0";
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;

      for (let j = 0; j < step; j++) {
        const index = i * step + j;
        if (index < this.audioData.length) {
          const datum = this.audioData[index];
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
    ctx.globalAlpha = 1.0;

    // Center line
    ctx.strokeStyle = "#333";
    ctx.beginPath();
    ctx.moveTo(0, amp);
    ctx.lineTo(width, amp);
    ctx.stroke();
  }

  private drawSliceMarkers(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    ctx.strokeStyle = "#f14c4c";
    ctx.lineWidth = 2;

    const totalSamples = this.audioData.length;

    for (const slice of this.slices) {
      const x = (slice / totalSamples) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }

  private drawLegend(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#f14c4c";
    ctx.font = "12px monospace";
    ctx.textAlign = "left";

    const duration = this.audioData.length / this.sampleRate;
    const avgInterval = duration / this.slices.length;

    ctx.fillText(`Slices: ${this.slices.length}`, 10, 20);
    ctx.fillText(`Avg Interval: ${avgInterval.toFixed(3)}s`, 10, 35);

    if (this.slices.length > 1) {
      const firstSlice = this.slices[0];
      const lastSlice = this.slices[this.slices.length - 1];
      const spanSeconds = (lastSlice - firstSlice) / this.sampleRate;
      ctx.fillText(`Span: ${spanSeconds.toFixed(2)}s`, 10, 50);
    }
  }
}
