/// <reference path="./types.d.ts" />

// ---------------------------------------------------------------------------
// Mixer level meter display for the status bar
// ---------------------------------------------------------------------------
// Layout: 9 channel bars (ch1-8 + preview) + 1 master bar = 10 bars
// Each bar: 2px wide (L+R side by side = 1px each), 1px gap between bars
// Master is slightly separated with an extra 2px gap
// Total width: 10 bars × 2px + 9 gaps × 1px + extra 2px gap before master = 33px
// Plus left margin. Canvas is 234px wide to accommodate future additions.

const NUM_CH = 9; // 8 user + 1 preview
const BAR_W = 2; // px per channel (L+R stacked)
const BAR_GAP = 1; // px gap between channels
const MASTER_EXTRA_GAP = 3; // extra px before master

const METER_H = 20;
const CANVAS_W = 234;
const CANVAS_H = 24;

// Color stops for the bar gradient (linear, 0=silent, 1=clip)
// Below -18 dB → green, -18 to -6 → yellow, above -6 → red
function levelColor(linear: number): string {
  if (linear <= 0) return "#1a4a1a";
  const db = 20 * Math.log10(Math.min(linear, 1));
  if (db < -18) return "#0dbc79";
  if (db < -6) return "#e5c07b";
  return "#cd3131";
}

export class MixerMeters {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  // Latest peak data (from telemetry)
  private channelPeaksL = new Float32Array(NUM_CH);
  private channelPeaksR = new Float32Array(NUM_CH);
  private masterPeakL = 0;
  private masterPeakR = 0;

  // Decay: displayed value decays toward the raw peak
  private dispL = new Float32Array(NUM_CH);
  private dispR = new Float32Array(NUM_CH);
  private dispMasterL = 0;
  private dispMasterR = 0;

  private rafId: number | null = null;
  private lastFrameTime = 0;

  mount(): void {
    this.canvas = document.getElementById("mixer-meters") as HTMLCanvasElement | null;
    if (!this.canvas) return;
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.ctx = this.canvas.getContext("2d");

    window.electron?.onMixerLevels((data) => {
      for (let i = 0; i < NUM_CH; i++) {
        this.channelPeaksL[i] = data.channelPeaksL[i] ?? 0;
        this.channelPeaksR[i] = data.channelPeaksR[i] ?? 0;
      }
      this.masterPeakL = data.masterPeakL;
      this.masterPeakR = data.masterPeakR;
    });

    this.scheduleFrame();
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private scheduleFrame(): void {
    this.rafId = requestAnimationFrame((ts) => {
      const dt = Math.min((ts - this.lastFrameTime) / 1000, 0.1); // seconds, capped
      this.lastFrameTime = ts;
      this.update(dt);
      this.draw();
      this.scheduleFrame();
    });
  }

  private update(dt: number): void {
    const decayRate = 8.0; // linear units/second (fast decay)
    for (let i = 0; i < NUM_CH; i++) {
      this.dispL[i] = Math.max(this.channelPeaksL[i], this.dispL[i] - decayRate * dt);
      this.dispR[i] = Math.max(this.channelPeaksR[i], this.dispR[i] - decayRate * dt);
    }
    this.dispMasterL = Math.max(this.masterPeakL, this.dispMasterL - decayRate * dt);
    this.dispMasterR = Math.max(this.masterPeakR, this.dispMasterR - decayRate * dt);
  }

  private draw(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    const yOff = Math.floor((CANVAS_H - METER_H) / 2);

    // Draw ch0–(NUM_CH-1): channels 0-7 are user channels, 8 is preview
    for (let ch = 0; ch < NUM_CH; ch++) {
      const x = ch * (BAR_W + BAR_GAP);
      this.drawBar(ctx, x, yOff, this.dispL[ch], this.dispR[ch]);
    }

    // Master (slightly offset after preview)
    const masterX = NUM_CH * (BAR_W + BAR_GAP) + MASTER_EXTRA_GAP;
    this.drawBar(ctx, masterX, yOff, this.dispMasterL, this.dispMasterR);

    // Draw dB tick lines at 0 dB
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    const totalW = masterX + BAR_W;
    ctx.beginPath();
    ctx.moveTo(0, yOff);
    ctx.lineTo(totalW, yOff);
    ctx.stroke();
  }

  private drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, peakL: number, peakR: number): void {
    // Each bar is 2px: left channel on left pixel, right channel on right pixel
    const lvL = Math.min(peakL, 1.2); // allow slight over-unity to show clip
    const lvR = Math.min(peakR, 1.2);

    const hL = Math.round(lvL * METER_H);
    const hR = Math.round(lvR * METER_H);

    // Background
    ctx.fillStyle = "#111";
    ctx.fillRect(x, y, BAR_W, METER_H);

    // Left channel (1px wide)
    if (hL > 0) {
      ctx.fillStyle = levelColor(peakL);
      ctx.fillRect(x, y + METER_H - hL, 1, hL);
    }
    // Right channel (1px wide)
    if (hR > 0) {
      ctx.fillStyle = levelColor(peakR);
      ctx.fillRect(x + 1, y + METER_H - hR, 1, hR);
    }
  }
}
