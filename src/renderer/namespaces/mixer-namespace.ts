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
// Control object interfaces (needed to type self-referential chaining)
// ---------------------------------------------------------------------------

interface IChannelControl {
  gain(db?: number): IChannelControl | BounceResult;
  pan(value?: number): IChannelControl | BounceResult;
  mute(): IChannelControl;
  solo(): IChannelControl;
  attach(instrument: { id: string } | string): IChannelControl | BounceResult;
  detach(): IChannelControl;
  toString(): string;
  help(): BounceResult;
}

interface IPreviewControl {
  gain(db?: number): IPreviewControl | BounceResult;
  mute(): IPreviewControl;
  toString(): string;
  help(): BounceResult;
}

interface IMasterControl {
  gain(db?: number): IMasterControl | BounceResult;
  mute(): IMasterControl;
  toString(): string;
  help(): BounceResult;
}

// ---------------------------------------------------------------------------
// Channel control object
// ---------------------------------------------------------------------------

function makeChannelControl(index: number, state: ChannelState): IChannelControl {
  const ctrl: IChannelControl = {
    gain(db?: number): IChannelControl | BounceResult {
      if (db === undefined) {
        return new BounceResult(`Channel ${index + 1} gain: ${formatDb(state.gainDb)}`);
      }
      state.gainDb = db;
      window.electron?.mixerSetChannelGain(index, db);
      return ctrl;
    },

    pan(value?: number): IChannelControl | BounceResult {
      if (value === undefined) {
        return new BounceResult(`Channel ${index + 1} pan: ${formatPan(state.pan)}`);
      }
      if (value < -1 || value > 1) {
        return new BounceResult("\x1b[31mPan must be between -1.0 (L) and +1.0 (R)\x1b[0m");
      }
      state.pan = value;
      window.electron?.mixerSetChannelPan(index, value);
      return ctrl;
    },

    mute(): IChannelControl {
      state.mute = !state.mute;
      window.electron?.mixerSetChannelMute(index, state.mute);
      return ctrl;
    },

    solo(): IChannelControl {
      state.solo = !state.solo;
      window.electron?.mixerSetChannelSolo(index, state.solo);
      return ctrl;
    },

    attach(instrument: { id: string } | string): IChannelControl | BounceResult {
      const id = typeof instrument === "string" ? instrument : instrument?.id;
      if (!id) {
        return new BounceResult("\x1b[31mattach() requires an instrument or instrument ID string\x1b[0m");
      }
      state.attachedInstrumentId = id;
      window.electron?.mixerAttachInstrument(index, id);
      return ctrl;
    },

    detach(): IChannelControl {
      state.attachedInstrumentId = null;
      window.electron?.mixerDetachChannel(index);
      return ctrl;
    },

    toString(): string {
      return channelSummary(index, state);
    },

    help: (): BounceResult => new BounceResult([
      `\x1b[1;36mmx.ch(${index + 1})\x1b[0m — mixer channel ${index + 1}`,
      "",
      "  \x1b[1m.gain(db?)\x1b[0m    get or set gain in dB (-96 to +6). Chainable.",
      "  \x1b[1m.pan(val?)\x1b[0m    get or set pan: -1.0 (L) .. 0 (C) .. +1.0 (R). Chainable.",
      "  \x1b[1m.mute()\x1b[0m       toggle mute. Chainable.",
      "  \x1b[1m.solo()\x1b[0m       toggle solo-in-place. Chainable.",
      "  \x1b[1m.attach(inst)\x1b[0m route instrument to this channel. Chainable.",
      "  \x1b[1m.detach()\x1b[0m     remove instrument from this channel. Chainable.",
      "",
      "  Example:",
      `    mx.ch(${index + 1}).gain(-12).pan(-0.3)`,
      `    mx.ch(${index + 1}).attach(inst)`,
    ].join("\n")),
  };

  return ctrl;
}

// ---------------------------------------------------------------------------
// Preview channel control
// ---------------------------------------------------------------------------

function makePreviewControl(state: ChannelState): IPreviewControl {
  const ctrl: IPreviewControl = {
    gain(db?: number): IPreviewControl | BounceResult {
      if (db === undefined) {
        return new BounceResult(`Preview gain: ${formatDb(state.gainDb)}`);
      }
      state.gainDb = db;
      window.electron?.mixerSetChannelGain(PREVIEW_CHANNEL_IDX, db);
      return ctrl;
    },

    mute(): IPreviewControl {
      state.mute = !state.mute;
      window.electron?.mixerSetChannelMute(PREVIEW_CHANNEL_IDX, state.mute);
      return ctrl;
    },

    toString(): string {
      const muteLabel = state.mute ? "  \x1b[33mmuted\x1b[0m" : "";
      return `  Preview: gain ${formatDb(state.gainDb)}${muteLabel}`;
    },

    help: (): BounceResult => new BounceResult([
      "\x1b[1;36mmx.preview\x1b[0m — preview channel (used by sample.play() / sample.loop())",
      "",
      "  \x1b[1m.gain(db?)\x1b[0m  get or set gain in dB. Chainable.",
      "  \x1b[1m.mute()\x1b[0m     toggle mute. Chainable.",
      "",
      "  Example:",
      "    mx.preview.gain(-6)   // quieter sample previews",
    ].join("\n")),
  };

  return ctrl;
}

// ---------------------------------------------------------------------------
// Master bus control
// ---------------------------------------------------------------------------

function makeMasterControl(state: MasterState): IMasterControl {
  const ctrl: IMasterControl = {
    gain(db?: number): IMasterControl | BounceResult {
      if (db === undefined) {
        return new BounceResult(`Master gain: ${formatDb(state.gainDb)}`);
      }
      state.gainDb = db;
      window.electron?.mixerSetMasterGain(db);
      return ctrl;
    },

    mute(): IMasterControl {
      state.mute = !state.mute;
      window.electron?.mixerSetMasterMute(state.mute);
      return ctrl;
    },

    toString(): string {
      const muteLabel = state.mute ? "  \x1b[33mmuted\x1b[0m" : "";
      return `  Master: gain ${formatDb(state.gainDb)}${muteLabel}`;
    },

    help: (): BounceResult => new BounceResult([
      "\x1b[1;36mmx.master\x1b[0m — master bus",
      "",
      "  \x1b[1m.gain(db?)\x1b[0m  get or set master gain in dB. Chainable.",
      "  \x1b[1m.mute()\x1b[0m     toggle master mute. Chainable.",
      "",
      "  Example:",
      "    mx.master.gain(-3)",
    ].join("\n")),
  };

  return ctrl;
}

// ---------------------------------------------------------------------------
// Namespace factory
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildMixerNamespace(_deps: NamespaceDeps): { mx: MixerNamespace } {
  const channelStates: ChannelState[] = Array.from({ length: NUM_USER_CHANNELS }, defaultChannelState);
  const previewState: ChannelState = { ...defaultChannelState(), gainDb: 0 };
  const masterState: MasterState = defaultMasterState();

  const channelControls = channelStates.map((st, i) => makeChannelControl(i, st));
  const previewControl = makePreviewControl(previewState);
  const masterControl = makeMasterControl(masterState);

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

export type ChannelControl = IChannelControl;
export type PreviewControl = IPreviewControl;
export type MasterControl = IMasterControl;

export interface MixerNamespace {
  ch(n: number): IChannelControl | BounceResult;
  readonly channels: BounceResult;
  readonly preview: IPreviewControl;
  readonly master: IMasterControl;
  help(): BounceResult;
}

