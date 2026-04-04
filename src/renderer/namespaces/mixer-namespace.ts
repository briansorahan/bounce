import { BounceResult } from "../bounce-result.js";
import type { NamespaceDeps } from "./types.js";
import { namespace, describe, param } from "../../shared/repl-registry.js";
import { mxCommands } from "./mx-commands.generated.js";
export { mxCommands } from "./mx-commands.generated.js";

export const mixerCommands = mxCommands;

// ---------------------------------------------------------------------------
// Internal state (mirrors what was last sent to the audio engine)
// ---------------------------------------------------------------------------

interface ChannelState {
  gainDb: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  attachedInstrumentId: string | null;
}

interface MasterState {
  gainDb: number;
  mute: boolean;
}

const NUM_USER_CHANNELS = 8;
const PREVIEW_CHANNEL_IDX = 8; // matches C++ kPreviewChannelIdx

function defaultChannelState(): ChannelState {
  return { gainDb: -6, pan: 0, mute: false, solo: false, attachedInstrumentId: null };
}

function defaultMasterState(): MasterState {
  return { gainDb: 0, mute: false };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDb(db: number): string {
  if (db <= -96) return "-∞ dB";
  return `${db >= 0 ? "+" : ""}${db.toFixed(1)} dB`;
}

function formatPan(pan: number): string {
  if (Math.abs(pan) < 0.02) return "C";
  const pct = Math.round(Math.abs(pan) * 100);
  return pan < 0 ? `L${pct}` : `R${pct}`;
}

function channelSummary(index: number, ch: ChannelState): string {
  const instLabel = ch.attachedInstrumentId ? `"${ch.attachedInstrumentId}"` : "—";
  const muteLabel = ch.mute ? "\x1b[33mmuted\x1b[0m" : "on";
  const soloLabel = ch.solo ? "  \x1b[36msolo\x1b[0m" : "";
  return `  ch${index + 1}  gain ${formatDb(ch.gainDb)}  pan ${formatPan(ch.pan).padEnd(4)}  ${muteLabel}${soloLabel}  instrument: ${instLabel}`;
}

// ---------------------------------------------------------------------------
// Control classes — extend BounceResult so the REPL displays them correctly
// ---------------------------------------------------------------------------

export class ChannelControl extends BounceResult {
  constructor(private readonly index: number, private readonly state: ChannelState) {
    super(channelSummary(index, state));
  }

  override toString(): string {
    return channelSummary(this.index, this.state);
  }

  gain(db?: number): this | BounceResult {
    if (db === undefined) {
      return new BounceResult(`Channel ${this.index + 1} gain: ${formatDb(this.state.gainDb)}`);
    }
    this.state.gainDb = db;
    window.electron?.mixerSetChannelGain(this.index, db);
    return this;
  }

  pan(value?: number): this | BounceResult {
    if (value === undefined) {
      return new BounceResult(`Channel ${this.index + 1} pan: ${formatPan(this.state.pan)}`);
    }
    if (value < -1 || value > 1) {
      return new BounceResult("\x1b[31mPan must be between -1.0 (L) and +1.0 (R)\x1b[0m");
    }
    this.state.pan = value;
    window.electron?.mixerSetChannelPan(this.index, value);
    return this;
  }

  mute(): this {
    this.state.mute = !this.state.mute;
    window.electron?.mixerSetChannelMute(this.index, this.state.mute);
    return this;
  }

  solo(): this {
    this.state.solo = !this.state.solo;
    window.electron?.mixerSetChannelSolo(this.index, this.state.solo);
    return this;
  }

  attach(instrument: { id: string } | string): this | BounceResult {
    const id = typeof instrument === "string" ? instrument : instrument?.id;
    if (!id) {
      return new BounceResult("\x1b[31mattach() requires an instrument or instrument ID string\x1b[0m");
    }
    this.state.attachedInstrumentId = id;
    window.electron?.mixerAttachInstrument(this.index, id);
    return this;
  }

  detach(): this {
    this.state.attachedInstrumentId = null;
    window.electron?.mixerDetachChannel(this.index);
    return this;
  }

  help(): BounceResult {
    return new BounceResult([
      `\x1b[1;36mmx.ch(${this.index + 1})\x1b[0m — mixer channel ${this.index + 1}`,
      "",
      "  \x1b[1m.gain(db?)\x1b[0m    get or set gain in dB (-96 to +6). Chainable.",
      "  \x1b[1m.pan(val?)\x1b[0m    get or set pan: -1.0 (L) .. 0 (C) .. +1.0 (R). Chainable.",
      "  \x1b[1m.mute()\x1b[0m       toggle mute. Chainable.",
      "  \x1b[1m.solo()\x1b[0m       toggle solo-in-place. Chainable.",
      "  \x1b[1m.attach(inst)\x1b[0m route instrument to this channel. Chainable.",
      "  \x1b[1m.detach()\x1b[0m     remove instrument from this channel. Chainable.",
      "",
      "  Example:",
      `    mx.ch(${this.index + 1}).gain(-12).pan(-0.3)`,
      `    mx.ch(${this.index + 1}).attach(inst)`,
    ].join("\n"));
  }
}

// ---------------------------------------------------------------------------
// Preview channel control
// ---------------------------------------------------------------------------

export class PreviewControl extends BounceResult {
  constructor(private readonly state: ChannelState) {
    super("");
  }

  override toString(): string {
    const muteLabel = this.state.mute ? "  \x1b[33mmuted\x1b[0m" : "";
    return `  Preview: gain ${formatDb(this.state.gainDb)}${muteLabel}`;
  }

  gain(db?: number): this | BounceResult {
    if (db === undefined) {
      return new BounceResult(`Preview gain: ${formatDb(this.state.gainDb)}`);
    }
    this.state.gainDb = db;
    window.electron?.mixerSetChannelGain(PREVIEW_CHANNEL_IDX, db);
    return this;
  }

  mute(): this {
    this.state.mute = !this.state.mute;
    window.electron?.mixerSetChannelMute(PREVIEW_CHANNEL_IDX, this.state.mute);
    return this;
  }

  help(): BounceResult {
    return new BounceResult([
      "\x1b[1;36mmx.preview\x1b[0m — preview channel (used by sample.play() / sample.loop())",
      "",
      "  \x1b[1m.gain(db?)\x1b[0m  get or set gain in dB. Chainable.",
      "  \x1b[1m.mute()\x1b[0m     toggle mute. Chainable.",
      "",
      "  Example:",
      "    mx.preview.gain(-6)   // quieter sample previews",
    ].join("\n"));
  }
}

// ---------------------------------------------------------------------------
// Master bus control
// ---------------------------------------------------------------------------

export class MasterControl extends BounceResult {
  constructor(private readonly state: MasterState) {
    super("");
  }

  override toString(): string {
    const muteLabel = this.state.mute ? "  \x1b[33mmuted\x1b[0m" : "";
    return `  Master: gain ${formatDb(this.state.gainDb)}${muteLabel}`;
  }

  gain(db?: number): this | BounceResult {
    if (db === undefined) {
      return new BounceResult(`Master gain: ${formatDb(this.state.gainDb)}`);
    }
    this.state.gainDb = db;
    window.electron?.mixerSetMasterGain(db);
    return this;
  }

  mute(): this {
    this.state.mute = !this.state.mute;
    window.electron?.mixerSetMasterMute(this.state.mute);
    return this;
  }

  help(): BounceResult {
    return new BounceResult([
      "\x1b[1;36mmx.master\x1b[0m — master bus",
      "",
      "  \x1b[1m.gain(db?)\x1b[0m  get or set master gain in dB. Chainable.",
      "  \x1b[1m.mute()\x1b[0m     toggle master mute. Chainable.",
      "",
      "  Example:",
      "    mx.master.gain(-3)",
    ].join("\n"));
  }
}

// ---------------------------------------------------------------------------
// Namespace class
// ---------------------------------------------------------------------------

@namespace("mx", { summary: "8-channel mixer with channel controls, preview channel, and master bus" })
export class MixerNamespace {
  /** Namespace summary — used by the globals help() function. */
  readonly description = "8-channel mixer with channel controls, preview channel, and master bus";

  private readonly channelStates: ChannelState[];
  private readonly previewState: ChannelState;
  private readonly masterState: MasterState;
  private readonly channelControls: ChannelControl[];
  private readonly previewControl: PreviewControl;
  private readonly masterControl: MasterControl;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_deps: NamespaceDeps) {
    this.channelStates = Array.from({ length: NUM_USER_CHANNELS }, defaultChannelState);
    this.previewState = { ...defaultChannelState(), gainDb: 0 };
    this.masterState = defaultMasterState();
    this.channelControls = this.channelStates.map((st, i) => new ChannelControl(i, st));
    this.previewControl = new PreviewControl(this.previewState);
    this.masterControl = new MasterControl(this.masterState);

    // Defer restore until after the app has initialized
    setTimeout(() => { this.restoreFromDb(); }, 0);
  }

  // ── Injected by @namespace decorator — do not implement manually ──────────

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  help(): unknown {
    // Replaced at class definition time by the @namespace decorator.
    return undefined;
  }

  toString(): string {
    return String(this.help());
  }

  // ── Public REPL-facing methods ────────────────────────────────────────────

  @describe({
    summary: "Get a ChannelControl for channel n (1–8). All methods (.gain, .pan, .mute, .solo, .attach, .detach) are chainable.",
    returns: "ChannelControl",
  })
  @param("n", { summary: "Channel index, 1–8.", kind: "plain" })
  ch(n: number): ChannelControl | BounceResult {
    if (!Number.isInteger(n) || n < 1 || n > NUM_USER_CHANNELS) {
      return new BounceResult(`\x1b[31mChannel must be an integer 1–${NUM_USER_CHANNELS}\x1b[0m`);
    }
    return this.channelControls[n - 1];
  }

  // ── Getter properties ─────────────────────────────────────────────────────

  get channels(): BounceResult {
    const lines = ["\x1b[1mMixer Channels\x1b[0m"];
    for (let i = 0; i < NUM_USER_CHANNELS; i++) {
      lines.push(channelSummary(i, this.channelStates[i]));
    }
    lines.push(this.previewControl.toString());
    lines.push(this.masterControl.toString());
    return new BounceResult(lines.join("\n"));
  }

  get preview(): PreviewControl {
    return this.previewControl;
  }

  get master(): MasterControl {
    return this.masterControl;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private restoreFromDb(): void {
    window.electron?.mixerGetState().then(saved => {
      if (!saved) return;

      for (const ch of saved.channels) {
        const idx = ch.channel_idx;
        if (idx >= 0 && idx < NUM_USER_CHANNELS) {
          this.channelStates[idx].gainDb = ch.gain_db;
          this.channelStates[idx].pan = ch.pan;
          this.channelStates[idx].mute = ch.mute !== 0;
          this.channelStates[idx].solo = ch.solo !== 0;
          this.channelStates[idx].attachedInstrumentId = ch.instrument_name;
          window.electron.mixerSetChannelGain(idx, ch.gain_db);
          window.electron.mixerSetChannelPan(idx, ch.pan);
          window.electron.mixerSetChannelMute(idx, ch.mute !== 0);
          window.electron.mixerSetChannelSolo(idx, ch.solo !== 0);
          if (ch.instrument_name) {
            window.electron.mixerAttachInstrument(idx, ch.instrument_name);
          }
        } else if (idx === PREVIEW_CHANNEL_IDX) {
          this.previewState.gainDb = ch.gain_db;
          this.previewState.mute = ch.mute !== 0;
          window.electron.mixerSetChannelGain(idx, ch.gain_db);
          window.electron.mixerSetChannelMute(idx, ch.mute !== 0);
        }
      }

      if (saved.master) {
        this.masterState.gainDb = saved.master.gain_db;
        this.masterState.mute = saved.master.mute !== 0;
        window.electron.mixerSetMasterGain(saved.master.gain_db);
        window.electron.mixerSetMasterMute(saved.master.mute !== 0);
      }
    }).catch(() => { /* DB may not be ready yet — silently ignore */ });
  }
}

/** @deprecated Use `new MixerNamespace(deps)` directly. Kept for backward compatibility. */
export function buildMixerNamespace(deps: NamespaceDeps): { mx: MixerNamespace } {
  return { mx: new MixerNamespace(deps) };
}

// Re-export commands array for any consumers of the old JSDoc-generated metadata.
export { mxCommands as mxNamespaceCommands };
