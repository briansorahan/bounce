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
  "SliceFeature.slice": {
    summary: "Re-run the onset slicer with updated options.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [
        {
            "name": "options",
            "summary": "Slice analysis options.",
            "kind": "options"
        }
    ],
  },
  "SliceFeature.playSlice": {
    summary: "Preview a specific slice by index.",
    visibility: "porcelain",
    returns: "SamplePromise",
    params: [
        {
            "name": "index",
            "summary": "Slice index (0-based).",
            "kind": "plain"
        }
    ],
  },
  "SliceFeature.toSampler": {
    summary: "Create a sampler instrument from the slices.",
    visibility: "porcelain",
    returns: "InstrumentResult",
    params: [
        {
            "name": "opts",
            "summary": "Sampler options: { name, startNote?, polyphony? }.",
            "kind": "options"
        }
    ],
  },
  "NmfFeature.sep": {
    summary: "Separate the NMF components into audio files.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [
        {
            "name": "options",
            "summary": "Separation options.",
            "kind": "options"
        }
    ],
  },
  "NmfFeature.playComponent": {
    summary: "Preview a specific NMF component by index.",
    visibility: "porcelain",
    returns: "SamplePromise",
    params: [
        {
            "name": "index",
            "summary": "Component index (0-based).",
            "kind": "plain"
        }
    ],
  },
  "NxFeature.playComponent": {
    summary: "Preview a specific NX cross-synthesis component by index.",
    visibility: "porcelain",
    returns: "SamplePromise",
    params: [
        {
            "name": "index",
            "summary": "Component index (0-based).",
            "kind": "plain"
        }
    ],
  },
  "AudioDevice.record": {
    summary: "Start recording. Returns a RecordingHandle (manual stop) or SamplePromise (when opts.duration is set).",
    visibility: "porcelain",
    returns: "RecordingHandle | SamplePromise",
    params: [
        {
            "name": "opts",
            "summary": "Recording options: { duration?, overwrite? }.",
            "kind": "plain"
        },
        {
            "name": "sampleId",
            "summary": "Name for the new sample.",
            "kind": "plain"
        }
    ],
  },
  "RecordingHandle.stop": {
    summary: "Stop recording and return a SamplePromise resolving to SampleResult.",
    visibility: "porcelain",
    returns: "SamplePromise",
    params: [],
  },
  "Sample.play": {
    summary: "Play this sample from start to finish.",
    visibility: "porcelain",
    returns: "SamplePromise",
    params: [],
  },
  "Sample.stop": {
    summary: "Stop playback.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [],
  },
  "Sample.display": {
    summary: "Display the waveform in the visualization panel.",
    visibility: "porcelain",
    returns: "SamplePromise",
    params: [],
  },
  "Sample.slice": {
    summary: "Onset-slice the sample and store segment boundaries.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [
        {
            "name": "options",
            "summary": "Slice analysis options.",
            "kind": "options"
        }
    ],
  },
  "Sample.sep": {
    summary: "Separate the sample into NMF components via BufNMF.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [
        {
            "name": "options",
            "summary": "NMF separation options.",
            "kind": "options"
        }
    ],
  },
  "Sample.granularize": {
    summary: "Create a GrainCollection for granular synthesis.",
    visibility: "porcelain",
    returns: "GrainCollectionPromise",
    params: [
        {
            "name": "options",
            "summary": "Granularize options.",
            "kind": "options"
        }
    ],
  },
  "Sample.onsetSlice": {
    summary: "Analyse onset positions using FluidOnsetSlice.",
    visibility: "porcelain",
    returns: "SliceFeaturePromise",
    params: [
        {
            "name": "options",
            "summary": "Onset analysis options.",
            "kind": "options"
        }
    ],
  },
  "Sample.ampSlice": {
    summary: "Analyse amplitude-based segment boundaries.",
    visibility: "porcelain",
    returns: "SliceFeaturePromise",
    params: [
        {
            "name": "options",
            "summary": "Amplitude slice options.",
            "kind": "options"
        }
    ],
  },
  "Sample.noveltySlice": {
    summary: "Analyse novelty-based segment boundaries.",
    visibility: "porcelain",
    returns: "SliceFeaturePromise",
    params: [
        {
            "name": "options",
            "summary": "Novelty slice options.",
            "kind": "options"
        }
    ],
  },
  "Sample.transientSlice": {
    summary: "Analyse transient-based segment boundaries.",
    visibility: "porcelain",
    returns: "SliceFeaturePromise",
    params: [
        {
            "name": "options",
            "summary": "Transient slice options.",
            "kind": "options"
        }
    ],
  },
  "Sample.nmf": {
    summary: "Run BufNMF on the sample and return component matrices.",
    visibility: "porcelain",
    returns: "NmfFeaturePromise",
    params: [
        {
            "name": "options",
            "summary": "NMF options.",
            "kind": "options"
        }
    ],
  },
  "Sample.mfcc": {
    summary: "Compute MFCC coefficients for the sample.",
    visibility: "porcelain",
    returns: "MfccFeaturePromise",
    params: [
        {
            "name": "options",
            "summary": "MFCC options.",
            "kind": "options"
        }
    ],
  },
  "Sample.nx": {
    summary: "Run NMF cross-synthesis with another sample as a target.",
    visibility: "porcelain",
    returns: "NxFeaturePromise",
    params: [
        {
            "name": "options",
            "summary": "Cross-synthesis options: { components? }.",
            "kind": "options"
        },
        {
            "name": "other",
            "summary": "Target SampleResult for cross-synthesis.",
            "kind": "typed",
            "expectedType": "SampleResult"
        }
    ],
  },
  "MidiSequence.play": {
    summary: "Play this sequence through an instrument. Returns a MidiSequencePromise.",
    visibility: "porcelain",
    returns: "MidiSequencePromise",
    params: [
        {
            "name": "inst",
            "summary": "Target instrument to play through.",
            "kind": "typed",
            "expectedType": "InstrumentResult"
        }
    ],
  },
  "MidiSequence.stop": {
    summary: "Stop MIDI playback.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [],
  },
  "MidiRecordingHandle.stop": {
    summary: "Stop recording and return a MidiSequencePromise.",
    visibility: "porcelain",
    returns: "MidiSequencePromise",
    params: [],
  },
  "Pattern.play": {
    summary: "Start playing on mixer channel N (1–8).",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [
        {
            "name": "channel",
            "summary": "Mixer channel 1–8.",
            "kind": "plain"
        }
    ],
  },
  "Pattern.stop": {
    summary: "Stop the pattern on its mixer channel.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [],
  },
  "VisScene.title": {
    summary: "Set the title text for this scene.",
    visibility: "porcelain",
    returns: "VisScene",
    params: [
        {
            "name": "text",
            "summary": "Title string to display.",
            "kind": "plain"
        }
    ],
  },
  "VisScene.overlay": {
    summary: "Add a feature overlay (slice, NMF, or NX) to this scene.",
    visibility: "porcelain",
    returns: "VisScene",
    params: [
        {
            "name": "feature",
            "summary": "SliceFeature, NmfFeature, or NxFeature to overlay.",
            "kind": "typed",
            "expectedType": "SliceFeatureResult | NmfFeatureResult | NxFeatureResult"
        }
    ],
  },
  "VisScene.panel": {
    summary: "Add an NMF feature as a separate panel below the main scene.",
    visibility: "porcelain",
    returns: "VisScene",
    params: [
        {
            "name": "feature",
            "summary": "NmfFeature to display as a panel.",
            "kind": "typed",
            "expectedType": "NmfFeatureResult"
        }
    ],
  },
  "VisScene.show": {
    summary: "Render this scene in the terminal visualization panel.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [],
  },
  "VisScene.markShown": {
    summary: "Record the scene ID after it has been rendered.",
    visibility: "plumbing",
    params: [
        {
            "name": "id",
            "summary": "Rendered scene identifier.",
            "kind": "plain"
        }
    ],
  },
  "VisStack.waveform": {
    summary: "Add a waveform scene for a sample. Replaced at runtime by vis.stack().",
    visibility: "plumbing",
    params: [
        {
            "name": "sample",
            "summary": "SampleResult to visualize.",
            "kind": "typed",
            "expectedType": "SampleResult"
        }
    ],
  },
  "VisStack.addScene": {
    summary: "Append a pre-built VisScene to this stack.",
    visibility: "plumbing",
    params: [
        {
            "name": "scene",
            "summary": "VisSceneResult to add.",
            "kind": "typed",
            "expectedType": "VisSceneResult"
        }
    ],
  },
  "VisStack.title": {
    summary: "Set the title of the most recently added scene.",
    visibility: "porcelain",
    returns: "VisStack",
    params: [
        {
            "name": "text",
            "summary": "Title string to display.",
            "kind": "plain"
        }
    ],
  },
  "VisStack.overlay": {
    summary: "Add a feature overlay to the most recently added scene.",
    visibility: "porcelain",
    returns: "VisStack",
    params: [
        {
            "name": "feature",
            "summary": "SliceFeature, NmfFeature, or NxFeature to overlay.",
            "kind": "typed",
            "expectedType": "SliceFeatureResult | NmfFeatureResult | NxFeatureResult"
        }
    ],
  },
  "VisStack.panel": {
    summary: "Add an NMF feature panel to the most recently added scene.",
    visibility: "porcelain",
    returns: "VisStack",
    params: [
        {
            "name": "feature",
            "summary": "NmfFeature to display as a panel.",
            "kind": "typed",
            "expectedType": "NmfFeatureResult"
        }
    ],
  },
  "VisStack.show": {
    summary: "Render all scenes in this stack in the visualization panel.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [],
  },
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
  "env.dev": {
    summary: "Toggle developer mode to show or hide plumbing commands.",
    visibility: "porcelain",
    returns: "BounceResult",
    params: [
        {
            "name": "toggle",
            "summary": "True to enable, false to disable. Omit to query current state.",
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
