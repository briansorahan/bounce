/// <reference path="../types.d.ts" />
/// <reference path="../bounce-globals.d.ts" />
import { BounceResult, InstrumentResult, InstrumentListResult } from "../bounce-result.js";
import type { NamespaceDeps } from "./types.js";

interface InstrumentState {
  instrumentId: string;
  name: string;
  kind: string;
  polyphony: number;
  sampleCount: number;
  loadedNotes: Map<number, { sampleHash: string; loop: boolean; loopStart: number; loopEnd: number }>;
}

const instruments = new Map<string, InstrumentState>();

function formatInstrument(state: InstrumentState): string {
  return `Sampler '${state.name}' | ${state.sampleCount} samples | poly ${state.polyphony}`;
}

function instrumentHelp(state: InstrumentState): BounceResult {
  const lines = [
    `\x1b[1;36m${state.name}\x1b[0m  (${state.kind} instrument)`,
    "",
    `  polyphony: ${state.polyphony}`,
    `  samples:   ${state.sampleCount}`,
    "",
    "\x1b[1mMethods:\x1b[0m",
    "  .loadSample(note, sample)              Load a sample (one-shot)",
    "  .loadSample(note, sample, { loop })    Load a sample with options",
    "  .noteOn(note)                          Trigger note (velocity 1.0)",
    "  .noteOn(note, { velocity })            Trigger note with velocity",
    "  .noteOff(note)                         Release note",
    "  .stop()                                Stop all voices",
    "  .free()                                Destroy instrument",
    "  .help()                                Show this help",
    "",
    "\x1b[1mExample:\x1b[0m",
    `  ${state.name}.loadSample(60, sample)`,
    `  ${state.name}.loadSample(60, sample, { loop: true })`,
    `  ${state.name}.noteOn(60)`,
    `  ${state.name}.noteOff(60)`,
  ];
  return new BounceResult(lines.join("\n"));
}

function buildInstrumentObject(state: InstrumentState): InstrumentResult {
  const display = formatInstrument(state);

  const result = new InstrumentResult(
    display,
    state.instrumentId,
    state.name,
    state.kind,
    state.polyphony,
    state.sampleCount,
    () => instrumentHelp(state),
  );

  // Attach methods to the result object
  const obj = result as InstrumentResult & {
    loadSample: ((note: number, sample: { hash: string }, opts?: { loop?: boolean; loopStart?: number; loopEnd?: number }) => BounceResult) & { help: () => BounceResult };
    noteOn: ((note: number, opts?: { velocity?: number }) => BounceResult) & { help: () => BounceResult };
    noteOff: ((note: number) => BounceResult) & { help: () => BounceResult };
    stop: (() => BounceResult) & { help: () => BounceResult };
    free: (() => BounceResult) & { help: () => BounceResult };
  };

  obj.loadSample = Object.assign(
    function loadSample(note: number, sample: { hash: string }, opts?: { loop?: boolean; loopStart?: number; loopEnd?: number }): BounceResult {
      if (typeof note !== "number" || note < 0 || note > 127) {
        return new BounceResult("\x1b[31mError: note must be 0–127\x1b[0m");
      }
      if (!sample?.hash) {
        return new BounceResult("\x1b[31mError: sample must have a hash property\x1b[0m");
      }
      const loop = !!opts?.loop;
      const loopStart = opts?.loopStart ?? 0;
      const loopEnd = opts?.loopEnd ?? -1;
      if (loop && loopStart < 0) {
        return new BounceResult("\x1b[31mError: loopStart must be >= 0\x1b[0m");
      }
      if (loop && loopEnd >= 0 && loopEnd <= loopStart) {
        return new BounceResult("\x1b[31mError: loopEnd must be greater than loopStart\x1b[0m");
      }
      window.electron.loadInstrumentSample(state.instrumentId, note, sample.hash, loop, loopStart, loopEnd);
      state.loadedNotes.set(note, { sampleHash: sample.hash, loop, loopStart, loopEnd });
      state.sampleCount = state.loadedNotes.size;

      // Persist to DB
      window.electron.addDbInstrumentSample?.(state.name, sample.hash, note, loop, loopStart, loopEnd)
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[inst] Failed to persist sample mapping: ${msg}`);
          window.electron.debugLog?.("error", "[inst] Failed to persist sample mapping", { instrument: state.name, note, error: msg });
        });

      const tags: string[] = [];
      if (loop) tags.push("loop");
      if (loop && (loopStart > 0 || loopEnd >= 0)) {
        const endLabel = loopEnd < 0 ? "end" : `${loopEnd}s`;
        tags.push(`${loopStart}s–${endLabel}`);
      }
      const tagStr = tags.length > 0 ? ` (${tags.join(" ")})` : "";
      return new BounceResult(`Loaded sample at note ${note}${tagStr}`);
    },
    {
      help: (): BounceResult =>
        new BounceResult(
          [
            "\x1b[1;36mloadSample(note, sample, options?)\x1b[0m",
            "",
            "  Load a sample into the instrument at a MIDI note number (0–127).",
            "",
            "\x1b[1mOptions:\x1b[0m",
            "  loop       boolean  (default false) Loop the sample on noteOn",
            "  loopStart  number   (default 0) Loop start in seconds",
            "  loopEnd    number   (default end) Loop end in seconds",
            "",
            "\x1b[1mExample:\x1b[0m",
            `  ${state.name}.loadSample(60, sample)`,
            `  ${state.name}.loadSample(60, sample, { loop: true })`,
            `  ${state.name}.loadSample(60, sample, { loop: true, loopStart: 0.1, loopEnd: 0.5 })`,
          ].join("\n"),
        ),
    },
  );

  obj.noteOn = Object.assign(
    function noteOn(note: number, opts?: { velocity?: number }): BounceResult {
      const velocity = opts?.velocity ?? 1.0;
      window.electron.instrumentNoteOn(state.instrumentId, note, velocity);
      return new BounceResult(`Note on: ${note} (velocity ${velocity})`);
    },
    {
      help: (): BounceResult =>
        new BounceResult(
          [
            "\x1b[1;36mnoteOn(note, options?)\x1b[0m",
            "",
            "  Trigger a note. The instrument plays the sample loaded at that note.",
            "",
            "\x1b[1mOptions:\x1b[0m",
            "  velocity  0.0–1.0 (default 1.0)",
            "",
            "\x1b[1mExample:\x1b[0m",
            `  ${state.name}.noteOn(60)`,
            `  ${state.name}.noteOn(60, { velocity: 0.5 })`,
          ].join("\n"),
        ),
    },
  );

  obj.noteOff = Object.assign(
    function noteOff(note: number): BounceResult {
      window.electron.instrumentNoteOff(state.instrumentId, note);
      return new BounceResult(`Note off: ${note}`);
    },
    {
      help: (): BounceResult =>
        new BounceResult(
          [
            "\x1b[1;36mnoteOff(note)\x1b[0m",
            "",
            "  Release a note, stopping playback of the sample at that note.",
            "",
            "\x1b[1mExample:\x1b[0m",
            `  ${state.name}.noteOff(60)`,
          ].join("\n"),
        ),
    },
  );

  obj.stop = Object.assign(
    function stop(): BounceResult {
      window.electron.instrumentStopAll(state.instrumentId);
      return new BounceResult(`Stopped all voices on '${state.name}'`);
    },
    {
      help: (): BounceResult =>
        new BounceResult(
          [
            "\x1b[1;36mstop()\x1b[0m",
            "",
            "  Stop all active voices on this instrument.",
          ].join("\n"),
        ),
    },
  );

  obj.free = Object.assign(
    function free(): BounceResult {
      window.electron.freeInstrument(state.instrumentId);
      instruments.delete(state.name);

      // Persist deletion to DB
      window.electron.deleteDbInstrument?.(state.name)
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[inst] Failed to delete instrument from DB: ${msg}`);
          window.electron.debugLog?.("error", "[inst] Failed to delete instrument from DB", { instrument: state.name, error: msg });
        });

      return new BounceResult(`Freed instrument '${state.name}'`);
    },
    {
      help: (): BounceResult =>
        new BounceResult(
          [
            "\x1b[1;36mfree()\x1b[0m",
            "",
            "  Destroy this instrument, releasing all resources.",
          ].join("\n"),
        ),
    },
  );

  return obj;
}

export function buildInstNamespace(_deps: NamespaceDeps) {
  // Restore instruments from DB on project load
  async function restoreInstruments(): Promise<void> {
    if (!window.electron?.listDbInstruments) return;
    try {
      const records = await window.electron.listDbInstruments();
      for (const record of records) {
        const config = record.config_json ? JSON.parse(record.config_json) : {};
        const polyphony = config.polyphony ?? 16;
        const instrumentId = `inst_${record.name}_${Date.now()}`;

        window.electron.defineInstrument(instrumentId, record.kind, polyphony);

        const state: InstrumentState = {
          instrumentId,
          name: record.name,
          kind: record.kind,
          polyphony,
          sampleCount: 0,
          loadedNotes: new Map(),
        };

        // Restore sample mappings
        const samples = await window.electron.getDbInstrumentSamples(record.name);
        for (const sample of samples) {
          const loop = !!sample.loop;
          const loopStart = sample.loop_start ?? 0;
          const loopEnd = sample.loop_end ?? -1;
          window.electron.loadInstrumentSample(instrumentId, sample.note_number, sample.sample_hash, loop, loopStart, loopEnd);
          state.loadedNotes.set(sample.note_number, { sampleHash: sample.sample_hash, loop, loopStart, loopEnd });
        }
        state.sampleCount = state.loadedNotes.size;

        instruments.set(record.name, state);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[inst] Failed to restore instruments: ${msg}`);
      window.electron.debugLog?.("error", "[inst] Failed to restore instruments", { error: msg });
    }
  }

  if (_deps.onProjectLoad) {
    const originalOnProjectLoad = _deps.onProjectLoad;
    _deps.onProjectLoad = async () => {
      instruments.clear();
      await originalOnProjectLoad();
      await restoreInstruments();
    };
  }

  // Also restore on initial load
  restoreInstruments();

  const inst = {
    help: (): BounceResult =>
      new BounceResult(
        [
          "\x1b[1;36minst\x1b[0m  — Instrument namespace",
          "",
          "\x1b[1mFunctions:\x1b[0m",
          "  inst.sampler({ name, polyphony? })  Create a sampler instrument",
          "  inst.list()                          List all instruments",
          "  inst.get(name)                       Get an instrument by name",
          "  inst.help()                          Show this help",
          "",
          "\x1b[1mExample:\x1b[0m",
          "  keys = inst.sampler({ name: 'keys' })",
          "  keys.loadSample(60, sample)",
          "  keys.noteOn(60)",
          "  keys.noteOff(60)",
          "  keys.free()",
        ].join("\n"),
      ),

    sampler: Object.assign(
      function sampler(opts: { name: string; polyphony?: number }): InstrumentResult {
        if (!opts?.name) {
          throw new Error("inst.sampler() requires { name: string }");
        }
        const name = opts.name;
        const polyphony = opts.polyphony ?? 16;
        const instrumentId = `inst_${name}_${Date.now()}`;

        window.electron.defineInstrument(instrumentId, "sampler", polyphony);

        // Persist to DB
        window.electron.createDbInstrument?.(name, "sampler", { polyphony })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[inst] Failed to persist instrument: ${msg}`);
            window.electron.debugLog?.("error", "[inst] Failed to persist instrument", { instrument: name, error: msg });
          });

        const state: InstrumentState = {
          instrumentId,
          name,
          kind: "sampler",
          polyphony,
          sampleCount: 0,
          loadedNotes: new Map(),
        };
        instruments.set(name, state);

        return buildInstrumentObject(state);
      },
      {
        help: (): BounceResult =>
          new BounceResult(
            [
              "\x1b[1;36minst.sampler({ name, polyphony? })\x1b[0m",
              "",
              "  Create a new sampler instrument.",
              "",
              "\x1b[1mParameters:\x1b[0m",
              "  name       string   (required) Instrument name",
              "  polyphony  number   (default 16) Max simultaneous voices",
              "",
              "\x1b[1mExample:\x1b[0m",
              "  keys = inst.sampler({ name: 'keys', polyphony: 8 })",
            ].join("\n"),
          ),
      },
    ),

    list: Object.assign(
      function list(): InstrumentListResult {
        const entries = Array.from(instruments.values()).map((s) => ({
          name: s.name,
          kind: s.kind,
          sampleCount: s.sampleCount,
        }));

        if (entries.length === 0) {
          return new InstrumentListResult("No instruments defined.", []);
        }

        const lines = ["\x1b[1mInstruments:\x1b[0m", ""];
        for (const entry of entries) {
          lines.push(
            `  \x1b[36m${entry.name}\x1b[0m  ${entry.kind} | ${entry.sampleCount} samples`,
          );
        }
        return new InstrumentListResult(lines.join("\n"), entries);
      },
      {
        help: (): BounceResult =>
          new BounceResult(
            [
              "\x1b[1;36minst.list()\x1b[0m",
              "",
              "  List all instruments in the current session.",
            ].join("\n"),
          ),
      },
    ),

    get: Object.assign(
      function get(name: string): InstrumentResult | BounceResult {
        const state = instruments.get(name);
        if (!state) {
          return new BounceResult(`\x1b[31mInstrument '${name}' not found\x1b[0m`);
        }
        return buildInstrumentObject(state);
      },
      {
        help: (): BounceResult =>
          new BounceResult(
            [
              "\x1b[1;36minst.get(name)\x1b[0m",
              "",
              "  Retrieve an instrument by name.",
              "",
              "\x1b[1mExample:\x1b[0m",
              "  keys = inst.get('keys')",
            ].join("\n"),
          ),
      },
    ),
  };

  return inst;
}
