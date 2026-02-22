export interface NMFVisualizerOptions {
  bases: number[][] | Float32Array[];
  activations: number[][] | Float32Array[];
  sampleRate: number;
  components: number;
}

export class NMFVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bases: number[][] | Float32Array[];
  private activations: number[][] | Float32Array[];
  private sampleRate: number;
  private components: number;

  constructor(canvas: HTMLCanvasElement, options: NMFVisualizerOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get canvas context");
    }
    this.ctx = ctx;
    this.bases = options.bases;
    this.activations = options.activations;
    this.sampleRate = options.sampleRate;
    this.components = options.components;

    window.electron.debugLog("debug", "[NMFVisualizer] Constructor called", {
      components: this.components,
      basesCount: this.bases.length,
      activationsCount: this.activations.length,
    });

    this.draw();
  }

  public draw() {
    const width = this.canvas.width;
    const height = this.canvas.height;

    window.electron.debugLog(
      "debug",
      "[NMFVisualizer] Drawing NMF visualization",
      {
        canvasSize: `${width}x${height}`,
        components: this.components,
      },
    );

    // Clear canvas
    this.ctx.fillStyle = "#1a1a1a";
    this.ctx.fillRect(0, 0, width, height);

    // Calculate layout: split canvas vertically into two sections
    const basesHeight = height * 0.4;
    const activationsHeight = height * 0.6;
    const activationsY = basesHeight;

    // Draw section labels
    this.ctx.fillStyle = "#888888";
    this.ctx.font = "12px monospace";
    this.ctx.fillText("Spectral Bases", 10, 15);
    this.ctx.fillText("Temporal Activations", 10, activationsY + 15);

    // Draw bases (spectral templates) - stacked horizontally
    const baseWidth = width / this.components;
    for (let i = 0; i < this.components; i++) {
      const x = i * baseWidth;
      this.drawBasis(this.bases[i], x, 25, baseWidth, basesHeight - 30, i);
    }

    // Draw activations (temporal envelopes) - stacked vertically
    const activationHeight = (activationsHeight - 30) / this.components;
    for (let i = 0; i < this.components; i++) {
      const y = activationsY + 25 + i * activationHeight;
      this.drawActivation(
        this.activations[i],
        0,
        y,
        width,
        activationHeight,
        i,
      );
    }

    window.electron.debugLog("debug", "[NMFVisualizer] Drawing complete");
  }

  private drawBasis(
    basis: Float32Array | number[],
    x: number,
    y: number,
    width: number,
    height: number,
    componentIndex: number,
  ) {
    // Draw spectral basis as a bar graph
    const barWidth = width / basis.length;
    const hue = (componentIndex * 137.5) % 360; // Golden angle for color distribution

    // Find max for normalization
    let max = 0;
    for (let i = 0; i < basis.length; i++) {
      max = Math.max(max, basis[i]);
    }

    this.ctx.save();

    for (let i = 0; i < basis.length; i++) {
      const normalized = max > 0 ? basis[i] / max : 0;
      const barHeight = normalized * height;
      const barX = x + i * barWidth;
      const barY = y + height - barHeight;

      this.ctx.fillStyle = `hsla(${hue}, 70%, 60%, 0.8)`;
      this.ctx.fillRect(barX, barY, Math.max(1, barWidth - 1), barHeight);
    }

    // Draw component label
    this.ctx.fillStyle = "#888888";
    this.ctx.font = "10px monospace";
    this.ctx.fillText(`C${componentIndex + 1}`, x + 5, y + 12);

    this.ctx.restore();
  }

  private drawActivation(
    activation: Float32Array | number[],
    x: number,
    y: number,
    width: number,
    height: number,
    componentIndex: number,
  ) {
    // Draw temporal activation as a line graph
    const hue = (componentIndex * 137.5) % 360;

    // Find max for normalization
    let max = 0;
    for (let i = 0; i < activation.length; i++) {
      max = Math.max(max, activation[i]);
    }

    this.ctx.save();

    // Draw filled area under the curve
    this.ctx.beginPath();
    this.ctx.moveTo(x, y + height);

    for (let i = 0; i < activation.length; i++) {
      const normalized = max > 0 ? activation[i] / max : 0;
      const plotX = x + (i / activation.length) * width;
      const plotY = y + height - normalized * height;

      if (i === 0) {
        this.ctx.lineTo(plotX, plotY);
      } else {
        this.ctx.lineTo(plotX, plotY);
      }
    }

    this.ctx.lineTo(x + width, y + height);
    this.ctx.closePath();

    this.ctx.fillStyle = `hsla(${hue}, 70%, 60%, 0.3)`;
    this.ctx.fill();

    // Draw line
    this.ctx.beginPath();
    for (let i = 0; i < activation.length; i++) {
      const normalized = max > 0 ? activation[i] / max : 0;
      const plotX = x + (i / activation.length) * width;
      const plotY = y + height - normalized * height;

      if (i === 0) {
        this.ctx.moveTo(plotX, plotY);
      } else {
        this.ctx.lineTo(plotX, plotY);
      }
    }

    this.ctx.strokeStyle = `hsla(${hue}, 70%, 60%, 0.9)`;
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();

    // Draw component label
    this.ctx.fillStyle = "#888888";
    this.ctx.font = "10px monospace";
    this.ctx.fillText(`C${componentIndex + 1}`, x + 5, y + height - 5);

    this.ctx.restore();
  }

  public resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.draw();
  }
}
