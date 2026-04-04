/**
 * REPL registry metadata for the REPL Intelligence Layer.
 * AUTO-GENERATED — do not edit by hand. Run `npm run generate:repl-artifacts`.
 */

export interface ReplRegistryEntry {
  summary: string;
  visibility: "porcelain" | "plumbing";
  returns?: string;
  params: Array<{
    name: string;
    summary: string;
    kind: string;
    expectedType?: string;
  }>;
}

export const replRegistry: Record<string, ReplRegistryEntry> = {
  "transport.bpm": {
    summary: "Get or set BPM (1–400). Omit argument to read current BPM.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [
        {
            "name": "value",
            "summary": "Beats per minute (1–400). Omit to read current BPM.",
            "kind": "plain"
        }
    ],
  },
  "transport.start": {
    summary: "Start the global clock. Patterns scheduled with .play() will begin on the next bar.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [],
  },
  "transport.stop": {
    summary: "Stop the global clock. Reports last bar, beat, and step position.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [],
  },
  "transport.getCurrentBpm": {
    summary: "Return the current BPM value.",
    visibility: "plumbing",
    params: [],
  },
  "pat.xox": {
    summary: "Compile an X0X step pattern for live-coding",
    visibility: "porcelain",
    returns: "Pattern",
    params: [
        {
            "name": "notation",
            "summary": "Multi-line X0X notation string. Each line: NOTE = STEPS (16 non-whitespace step chars). NOTE: c4, a4, etc. STEPS: . = rest, a-z = soft, A-Z = loud.",
            "kind": "plain"
        }
    ],
  },
  "fs.ls": {
    summary: "List directory contents (dotfiles hidden). Directories in blue, audio files in green. Capped at 200 entries.",
    visibility: "porcelain",
    returns: "LsResultPromise",
    params: [
        {
            "name": "dirPath",
            "summary": "Path (absolute, relative, or ~). Defaults to cwd.",
            "kind": "filePath"
        }
    ],
  },
  "fs.la": {
    summary: "List directory contents including dotfiles. Like fs.ls() but shows hidden entries.",
    visibility: "porcelain",
    returns: "LsResultPromise",
    params: [
        {
            "name": "dirPath",
            "summary": "Path (absolute, relative, or ~). Defaults to cwd.",
            "kind": "filePath"
        }
    ],
  },
  "fs.cd": {
    summary: "Change working directory (persists across restarts). Supports ~ expansion and relative paths.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [
        {
            "name": "dirPath",
            "summary": "Target directory (absolute, relative, or starting with ~).",
            "kind": "filePath"
        }
    ],
  },
  "fs.pwd": {
    summary: "Print current working directory. Relative paths in sn.read() and other commands resolve against this.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [],
  },
  "fs.glob": {
    summary: "Find files matching a glob pattern (e.g. **/*.wav). Returns sorted absolute paths.",
    visibility: "porcelain",
    returns: "GlobResultPromise",
    params: [
        {
            "name": "pattern",
            "summary": "Glob pattern string. Supports ** for recursive search.",
            "kind": "plain"
        }
    ],
  },
  "fs.walk": {
    summary: "Recursively walk a directory; handler fires per entry. Capped at 10,000 entries.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [
        {
            "name": "handler",
            "summary": "Catch-all callback (filePath, type) => void, or handler-map keyed by fs.FileType.",
            "kind": "plain"
        },
        {
            "name": "dirPath",
            "summary": "Directory to walk (absolute, relative, or ~).",
            "kind": "filePath"
        }
    ],
  },
  "sn.read": {
    summary: "Load an audio file from disk and return a SampleResult object",
    visibility: "porcelain",
    returns: "SamplePromise",
    params: [
        {
            "name": "path",
            "summary": "File path (absolute, relative, or ~). Supports WAV, MP3, OGG, FLAC, M4A, AAC, OPUS.",
            "kind": "filePath"
        }
    ],
  },
  "sn.load": {
    summary: "Load a stored sample by hash and return a SampleResult object",
    visibility: "porcelain",
    returns: "SamplePromise",
    params: [
        {
            "name": "hash",
            "summary": "Full or prefix hash from sn.list().",
            "kind": "sampleHash"
        }
    ],
  },
  "sn.list": {
    summary: "List stored samples and features in the database",
    visibility: "porcelain",
    params: [],
  },
  "sn.current": {
    summary: "Return the currently loaded sample, or null",
    visibility: "porcelain",
    returns: "CurrentSamplePromise",
    params: [],
  },
  "sn.stop": {
    summary: "Stop all active sample playback and looping voices",
    visibility: "porcelain",
    params: [],
  },
  "sn.inputs": {
    summary: "List available audio input devices",
    visibility: "porcelain",
    params: [],
  },
  "sn.dev": {
    summary: "Open an audio input device by index for recording",
    visibility: "porcelain",
    returns: "AudioDeviceResult",
    params: [
        {
            "name": "index",
            "summary": "Device index from sn.inputs().",
            "kind": "plain"
        }
    ],
  },
  "sn.bindSample": {
    summary: "Bind a raw sample record to a SampleResult with bound methods (internal use)",
    visibility: "plumbing",
    returns: "SampleResult",
    params: [],
  },
  "corpus.build": {
    summary: "Build a KDTree from onset slices of an audio file. Requires sample.onsets() and sample.slice() first.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [
        {
            "name": "featureHashOverride",
            "summary": "Override the feature hash (advanced use).",
            "kind": "sampleHash"
        },
        {
            "name": "source",
            "summary": "Audio source (SampleResult, hash string, or omit to use current audio).",
            "kind": "typed",
            "expectedType": "SampleResult"
        }
    ],
  },
  "corpus.query": {
    summary: "Find k nearest corpus neighbors for a segment. Returns ranked table of indices and distances.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [
        {
            "name": "k",
            "summary": "Number of nearest neighbors to return (default: 5).",
            "kind": "plain"
        },
        {
            "name": "segmentIndex",
            "summary": "Index of the query segment.",
            "kind": "plain"
        }
    ],
  },
  "corpus.resynthesize": {
    summary: "Concatenate corpus segments by index array and play them back immediately.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [
        {
            "name": "queryIndices",
            "summary": "Array of segment indices to concatenate and play.",
            "kind": "plain"
        }
    ],
  },
  "env.vars": {
    summary: "List user-defined variables in scope. Each entry shows name, type, callable flag, and preview.",
    visibility: "porcelain",
    returns: "EnvScopeResult",
    params: [],
  },
  "env.globals": {
    summary: "List built-in Bounce globals. Each entry shows name, type, callable flag, and preview.",
    visibility: "porcelain",
    returns: "EnvScopeResult",
    params: [],
  },
  "env.inspect": {
    summary: "Show details for one binding or value. Pass a name string to resolve by name, or pass a value directly.",
    visibility: "porcelain",
    returns: "EnvInspectionResult",
    params: [
        {
            "name": "nameOrValue",
            "summary": "Variable name string or a direct value to inspect.",
            "kind": "plain"
        }
    ],
  },
  "env.functions": {
    summary: "List callable members on a value, or all user-defined functions if no argument given.",
    visibility: "porcelain",
    returns: "EnvFunctionListResult",
    params: [
        {
            "name": "nameOrValue",
            "summary": "Value or name to inspect. Omit to list all user-defined functions.",
            "kind": "plain"
        }
    ],
  },
  "proj.current": {
    summary: "Return the active project and its stored counts.",
    visibility: "porcelain",
    returns: "ProjectResult",
    params: [],
  },
  "proj.list": {
    summary: "List all projects with sample, feature, and command counts.",
    visibility: "porcelain",
    returns: "ProjectListResult",
    params: [],
  },
  "proj.load": {
    summary: "Load a project by name, creating it if needed.",
    visibility: "porcelain",
    returns: "ProjectResult",
    params: [
        {
            "name": "name",
            "summary": "Project name to load or create.",
            "kind": "plain"
        }
    ],
  },
  "proj.rm": {
    summary: "Remove a project and all its scoped data. The current project cannot be removed.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [
        {
            "name": "name",
            "summary": "Name of the project to remove.",
            "kind": "plain"
        }
    ],
  },
  "vis.waveform": {
    summary: "Create a draft VisSceneResult for a sample waveform. Chain .overlay()/.panel()/.title() and call .show() to render.",
    visibility: "porcelain",
    returns: "VisScene",
    params: [
        {
            "name": "sampleOrPromise",
            "summary": "Resolved SampleResult or SamplePromise to visualize.",
            "kind": "typed",
            "expectedType": "SampleResult"
        }
    ],
  },
  "vis.stack": {
    summary: "Build multiple visualization scenes in one chained expression. Add scenes with .waveform(), render all with .show().",
    visibility: "porcelain",
    returns: "VisStack",
    params: [],
  },
  "vis.list": {
    summary: "List currently shown visualization scenes.",
    visibility: "porcelain",
    returns: "VisSceneListResult",
    params: [],
  },
  "vis.remove": {
    summary: "Remove a shown visualization scene by id.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [
        {
            "name": "id",
            "summary": "Scene id from vis.list().",
            "kind": "plain"
        }
    ],
  },
  "vis.clear": {
    summary: "Remove all shown visualization scenes.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [],
  },
  "inst.sampler": {
    summary: "Create a sampler instrument. Load samples per MIDI note with .loadSample(note, sample), trigger with .noteOn/.noteOff.",
    visibility: "porcelain",
    returns: "InstrumentResult",
    params: [
        {
            "name": "opts",
            "summary": "{ name: string, polyphony?: number }. name is required.",
            "kind": "plain"
        }
    ],
  },
  "inst.granular": {
    summary: "Create a granular synthesis instrument. Load source with .load(sample), control with .set({ position, grainSize, density, ... }).",
    visibility: "porcelain",
    returns: "InstrumentResult",
    params: [
        {
            "name": "opts",
            "summary": "{ name: string, polyphony?: number }. name is required.",
            "kind": "plain"
        }
    ],
  },
  "inst.list": {
    summary: "List all instruments in the current session, showing name, kind, and sample count.",
    visibility: "porcelain",
    returns: "InstrumentListResult",
    params: [],
  },
  "inst.get": {
    summary: "Get an existing instrument by name. Returns the instrument object with all methods attached.",
    visibility: "porcelain",
    returns: "InstrumentResult",
    params: [
        {
            "name": "name",
            "summary": "Instrument name.",
            "kind": "plain"
        }
    ],
  },
  "midi.devices": {
    summary: "List available MIDI input devices on the system.",
    visibility: "porcelain",
    returns: "MidiDevicesResult",
    params: [],
  },
  "midi.open": {
    summary: "Open the MIDI input device at the given index (from midi.devices()). Only one device can be open at a time.",
    visibility: "porcelain",
    returns: "MidiDeviceResult",
    params: [
        {
            "name": "index",
            "summary": "Device index from midi.devices().",
            "kind": "plain"
        }
    ],
  },
  "midi.close": {
    summary: "Close the currently open MIDI input device.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [],
  },
  "midi.record": {
    summary: "Start MIDI recording. Returns a handle (call h.stop()) or a timed MidiSequencePromise when opts.duration is set.",
    visibility: "porcelain",
    returns: "MidiRecordingHandle",
    params: [
        {
            "name": "opts",
            "summary": "Recording options: { duration?: number, name?: string }.",
            "kind": "plain"
        },
        {
            "name": "inst",
            "summary": "Target instrument to associate with the recording.",
            "kind": "typed",
            "expectedType": "InstrumentResult"
        }
    ],
  },
  "midi.sequences": {
    summary: "List all MIDI sequences saved in the current project.",
    visibility: "porcelain",
    returns: "MidiSequencesResult",
    params: [],
  },
  "midi.load": {
    summary: "Import a .mid file as a transient MidiSequenceResult (not auto-saved to the project).",
    visibility: "porcelain",
    returns: "MidiSequence",
    params: [
        {
            "name": "filePath",
            "summary": "Absolute path to the .mid file.",
            "kind": "filePath"
        }
    ],
  },
  "midi.__injectEvent": {
    summary: "Inject a raw MIDI event for testing.",
    visibility: "plumbing",
    params: [
        {
            "name": "data2",
            "summary": "MIDI data byte 2.",
            "kind": "plain"
        },
        {
            "name": "data1",
            "summary": "MIDI data byte 1.",
            "kind": "plain"
        },
        {
            "name": "status",
            "summary": "MIDI status byte.",
            "kind": "plain"
        }
    ],
  },
  "mx.ch": {
    summary: "Get a ChannelControl for channel n (1–8). All methods (.gain, .pan, .mute, .solo, .attach, .detach) are chainable.",
    visibility: "porcelain",
    returns: "ChannelControl",
    params: [
        {
            "name": "n",
            "summary": "Channel index, 1–8.",
            "kind": "plain"
        }
    ],
  },
};
