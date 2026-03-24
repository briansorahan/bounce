import { BounceResult } from "../bounce-result.js";
import type { NamespaceDeps } from "./types.js";

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

class ChannelControl extends BounceResult {
  constructor(private readonly index: number, private readonly state: ChannelState) {
    super(channelSummary(index, state));
  }

  // Override to always reflect current state
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

class PreviewControl extends BounceResult {
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

class MasterControl extends BounceResult {
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
// Namespace factory
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildMixerNamespace(_deps: NamespaceDeps): { mx: MixerNamespace } {
  const channelStates: ChannelState[] = Array.from({ length: NUM_USER_CHANNELS }, defaultChannelState);
  const previewState: ChannelState = { ...defaultChannelState(), gainDb: 0 };
  const masterState: MasterState = defaultMasterState();

  const channelControls = channelStates.map((st, i) => new ChannelControl(i, st));
  const previewControl = new PreviewControl(previewState);
  const masterControl = new MasterControl(masterState);

  // Restore persisted mixer state from the DB on startup.
  function restoreFromDb(): void {
    window.electron?.mixerGetState().then(saved => {
      if (!saved) return;

      for (const ch of saved.channels) {
        const idx = ch.channel_idx;
        if (idx >= 0 && idx < NUM_USER_CHANNELS) {
          channelStates[idx].gainDb = ch.gain_db;
          channelStates[idx].pan = ch.pan;
          channelStates[idx].mute = ch.mute !== 0;
          channelStates[idx].solo = ch.solo !== 0;
          channelStates[idx].attachedInstrumentId = ch.instrument_name;
          window.electron.mixerSetChannelGain(idx, ch.gain_db);
          window.electron.mixerSetChannelPan(idx, ch.pan);
          window.electron.mixerSetChannelMute(idx, ch.mute !== 0);
          window.electron.mixerSetChannelSolo(idx, ch.solo !== 0);
          if (ch.instrument_name) {
            window.electron.mixerAttachInstrument(idx, ch.instrument_name);
          }
        } else if (idx === PREVIEW_CHANNEL_IDX) {
          previewState.gainDb = ch.gain_db;
          previewState.mute = ch.mute !== 0;
          window.electron.mixerSetChannelGain(idx, ch.gain_db);
          window.electron.mixerSetChannelMute(idx, ch.mute !== 0);
        }
      }

      if (saved.master) {
        masterState.gainDb = saved.master.gain_db;
        masterState.mute = saved.master.mute !== 0;
        window.electron.mixerSetMasterGain(saved.master.gain_db);
        window.electron.mixerSetMasterMute(saved.master.mute !== 0);
      }
    }).catch(() => { /* DB may not be ready yet — silently ignore */ });
  }

  // Defer restore until after the app has initialized
  setTimeout(restoreFromDb, 0);

  const mx: MixerNamespace = {
    ch(n: number) {
      if (!Number.isInteger(n) || n < 1 || n > NUM_USER_CHANNELS) {
        return new BounceResult(`\x1b[31mChannel must be an integer 1–${NUM_USER_CHANNELS}\x1b[0m`) as ReturnType<MixerNamespace["ch"]>;
      }
      return channelControls[n - 1];
    },

    get channels(): BounceResult {
      const lines = ["\x1b[1mMixer Channels\x1b[0m"];
      for (let i = 0; i < NUM_USER_CHANNELS; i++) {
        lines.push(channelSummary(i, channelStates[i]));
      }
      lines.push(previewControl.toString());
      lines.push(masterControl.toString());
      return new BounceResult(lines.join("\n"));
    },

    get preview() {
      return previewControl;
    },

    get master() {
      return masterControl;
    },

    help: (): BounceResult => new BounceResult([
      "\x1b[1;36mmx\x1b[0m — 8-channel mixer",
      "",
      "  \x1b[1mmx.ch(n)\x1b[0m      channel control (n = 1–8)",
      "  \x1b[1mmx.preview\x1b[0m    preview channel (sample.play / sample.loop)",
      "  \x1b[1mmx.master\x1b[0m     master bus",
      "  \x1b[1mmx.channels\x1b[0m   list all channels with current settings",
      "",
      "  Channel methods (all chainable):",
      "    .gain(db?)     get/set gain in dB  (-96 to +6)",
      "    .pan(val?)     get/set pan         (-1.0 L .. 0 C .. +1.0 R)",
      "    .mute()        toggle mute",
      "    .solo()        toggle solo-in-place",
      "    .attach(inst)  route instrument to channel",
      "    .detach()      remove instrument from channel",
      "",
      "  Examples:",
      "    mx.ch(1).attach(inst).gain(-6).pan(-0.2)",
      "    mx.ch(2).solo()",
      "    mx.master.gain(-3)",
      "    mx.preview.gain(-12)",
    ].join("\n")),
  };

  return { mx };
}

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type { ChannelControl, PreviewControl, MasterControl };

export interface MixerNamespace {
  ch(n: number): ChannelControl | BounceResult;
  readonly channels: BounceResult;
  readonly preview: PreviewControl;
  readonly master: MasterControl;
  help(): BounceResult;
}

