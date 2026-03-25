/// <reference path="./types.d.ts" />
/// <reference path="./bounce-globals.d.ts" />

const POLL_INTERVAL_MS = 5000;

export class StatusLine {
  private indicator: HTMLElement | null = null;
  private textEl: HTMLElement | null = null;
  private transportEl: HTMLElement;
  private deviceEl: HTMLElement;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private _errorCount = 0;
  private _polling = false;

  constructor() {
    this.transportEl = document.createElement("span");
    this.transportEl.className = "status-transport";
    this.transportEl.textContent = "--- BPM  bar: -  beat: -";

    this.deviceEl = document.createElement("span");
    this.deviceEl.className = "status-device";
    this.deviceEl.textContent = "- Hz  - buf";
  }

  get errorCount(): number {
    return this._errorCount;
  }

  mount(): void {
    const container = document.getElementById("status-line");
    if (!container) return;

    this.indicator = container.querySelector(".status-indicator");
    this.textEl = container.querySelector(".status-text");

    // Append transport and device info zones with separators
    const sep1 = document.createElement("span");
    sep1.textContent = "|";
    sep1.style.opacity = "0.4";

    const sep2 = document.createElement("span");
    sep2.textContent = "|";
    sep2.style.opacity = "0.4";

    container.appendChild(sep1);
    container.appendChild(this.transportEl);
    container.appendChild(sep2);
    container.appendChild(this.deviceEl);
  }

  start(): void {
    this.poll();
    this.intervalId = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  updateTransport(data: { bar: number; beat: number; step: number } | null, bpm: number): void {
    if (data === null) {
      this.transportEl.textContent = `${bpm} BPM  bar: -  beat: -`;
    } else {
      this.transportEl.textContent = `${bpm} BPM  bar: ${data.bar}  beat: ${data.beat}`;
    }
  }

  updateDeviceInfo(sampleRate: number, bufferSize: number): void {
    this.deviceEl.textContent = `${sampleRate} Hz  ${bufferSize} buf`;
  }

  private async poll(): Promise<void> {
    if (this._polling) return;
    this._polling = true;
    try {
      const errors = await window.electron.getBackgroundErrors();
      this._errorCount = errors.length;
      this.render();
    } catch {
      // If the IPC call itself fails, don't crash the renderer.
    } finally {
      this._polling = false;
    }
  }

  private render(): void {
    if (!this.indicator || !this.textEl) return;

    if (this._errorCount === 0) {
      this.indicator.className = "status-indicator ok";
      this.indicator.textContent = "●";
      this.textEl.textContent = "Ready";
    } else {
      this.indicator.className = "status-indicator error";
      this.indicator.textContent = "●";
      const noun = this._errorCount === 1 ? "error" : "errors";
      this.textEl.textContent = `${this._errorCount} background ${noun} — run errors() in REPL for details`;
    }
  }
}
