# Prioritzed Features

See the brainstorming section for the full description of what each of these ideas actually entails.

* Tutorials
* Simple Transformations
* Sample Lineage Visualization
* Utility Process Granular Sample Playback
* Multichannel Audio
* Multiline Editing
* Live-Coding Sample Playback
* Ableton Link Integration
* Freesound Integration
* Scripts
* Staging Area

# Brainstorming

## User Configuration

What all would we want to support here?

### Appearance and Layout

* Color schemes
* Fonts
* Customized prompt similar to the way folks configure PS1 for other terminal emulators

## Multichannel Audio

I'm wondering if there are any places in the codebase where we're intentionally ignoring
multi-channel audio and only using the L/Mono channel?
Maybe sn.read() does this?
Would be nice to support multi-channel audio but it feels like it could be a big lift.
Would we store each channel as a separate sample in the db, or would it make sense to store
multiple channels encoded into a single binary blob?

### Channel Transformations

* **Mono Mix** — Downmix stereo (or multichannel) to a single mono sample by summing channels.
* **Channel Extract** — Pull a single channel out of a multichannel sample as a new mono sample.

## Staging Area

The idea here would be that the audio stored in the main Bounce database is just stuff that the user
has elected to store from a given session, and that maybe a lot of the audio generated during a
session is ok to throw away when the application is closed. Maybe by default audio is always stored
to this temporary staging area and is only written to the main database when the user wants this.
One problem with this idea though is that users should be able to close Bounce and resume their
previous session. It might be surprising to users that work gets thrown away automatically
unless you explicitly save it to the main database.
We would need to think through how the provenance would work in this case, because
with just one database (which is how the application currently works) we can use the features_links
table to link samples with features, and in the case where a feature generates new samples
e.g. OnsetSlice, we can trace the lineage of each slice back to the source sample.
In a sense, this means that there is no such thing as destructive editing in Bounce.
But this also means that if we were going to require users to move a sample from their staging
area to the permanent storage, it raises the question of would we copy the entire lineage to
maintain that?
Probably not...
Maybe the main database is _just_ for audio?

I was thinking more about this feature last night.
I was thinking how it's cool that we keep track of lineage for derived samples, but that
sometimes the user might want to throw away the history and _just_ keep the resulting sample.
Maybe this is an option that people could use when they copy samples from the session to
the project? If this option is turned on, then the sample appears in the project db
as a raw sample.
Maybe this is actually how the copy should work by default?
Maybe we don't care about tracking lineage for samples that get moved into a project?

## Multiline Editing

* Opening bracket e.g. for a function body, for loop, if block, etc should indent automatically
* 

## Scripts

It would be cool if users had a way to define their own scripts and invoke these
from the REPL.
This would probably mean that we need to define a javascript editor interface.
Could be cool, but feels like a big lift!

## Simple Transformations

### Normalization

* Apply gain adjustment based on peak level detection.
* Adjust so peak level is -1dB by default, with configurable peak target.

### RMS / LUFS Normalization

* Normalize by perceived loudness rather than peak level.
* Useful when peak normalization produces inconsistent apparent loudness across samples.

### Gain

* Apply a fixed dB offset to a sample.
* Simpler and more explicit than normalization when the user knows the desired adjustment.

### DC Offset Removal

* Remove any DC bias from the signal.
* DC offset can cause clicks at loop points and distort analysis results.

### Reverse

* Reverse a sample.

### Fade In / Fade Out

* Apply an amplitude envelope at the start and/or end of a sample.
* Support linear and exponential curve shapes.
* Useful for removing clicks at sample boundaries.

### Trim Silence

* Strip leading and/or trailing silence below a configurable amplitude threshold.
* Helps normalize the perceived "start" of a sample, which matters when building a corpus.

### Noise Gate

* Attenuate or silence regions of a sample that fall below a configurable amplitude threshold.
* Unlike Trim Silence, operates throughout the entire sample — useful for removing room noise,
  breath, or bleed between transients in field recordings or live takes.
* Configurable attack, hold, and release times to avoid clicks and unnatural cutoffs.

### Crop

* Extract a time-bounded region from a sample, defined by start and end points in seconds or sample frames.
* The fundamental non-destructive edit — all other slicing operations could be expressed in terms of this.

### Resample

* Change the sample rate of a sample.
* Corpus analysis algorithms are sensitive to sample rate — FluCoMa descriptors (e.g. MFCC, spectral
  centroid) are computed relative to the Nyquist frequency, so comparing features across samples
  recorded at different rates produces misleading distances. Resampling everything to a common rate
  before building a corpus ensures that timbral queries and nearest-neighbor lookups are meaningful.

## Sample Lineage

* Render a pretty visualization that shows the lineage of a sample
* sample.tree()
* Output looks like the `tree` command

## Tutorials

I think interactive tutorials could be cool!
Maybe it's a `tutorial()` global function to learn the global functions.
Then each global object could expose a tutorial() method to educate the user
about how to use that object.
Each tutorial would run in a temp directory and temp db, to sandbox everything the
user does. When they exit the tutorial, everything they did is removed.
I think that seems right?
It could be kinda sad if someone did something they actually wanted to save
while in a tutorial session, but couldn't :(
Once you start a tutorial, there are globals added to the bounce REPL:
* next() goes to the next page in the tutorial
* prev() goes back to the previous page in the tutorial
* quit() exits the tutorial and deletes everything in the sandbox environment

## Freesound Integration

* Searching sounds from freesound.org
* Downloading sounds
* How do we honor the sound's license?
  * We would need to track that a sound is downloaded from freesound, and store the URL
  * Could prob fetch the license info from the URL?
  * Ability to generate an attribution document
  
## Live-Coding Sample Playback

* Create sample-playback instruments that trigger via MIDI-ish messages
* Each MIDI note is assigned to a sample
* Samples can be triggered with a velocity value that controls loudness
* Simple percussion notation similar to what I did with the python version of crispy
* IPC calls would instantiate the sample-playback instrument within the audio utility process
* The instrument would be linked to a predefined collection of samples and automatically map them to MIDI notes
* The instrument would also receive pattern messages and trigger the samples according to the patterns
* The renderer defines the patterns via a DSL that is embedded in multiline string literals
  
## Ableton Link Integration

* Prob comes after migrating all audio playback/voicing to a dedicated utility
  process that runs a realtime audio thread.
* What could we do with this?
  * Sync to DAW
  * Sync sample playback to transport?
* The live-coding instrument that we support within the audio utility process will sync with Link

# AI-Generated Future Ideas

## Semantic Audio Search

Embed audio segments using a local model (CLAP-style audio embeddings) so you can query your corpus
with natural language: `corpus.search("warm pad with slow attack")`. FluCoMa's KDTree is already
there; the embedding pipeline is the missing layer.

## 3D Corpus Map

UMAP/t-SNE dimensionality reduction on MFCC/spectral features rendered as a navigable 3D point
cloud in the terminal (sixel graphics or a separate WebGL window). Click a point → play the slice.
Spatially explore your entire sample library.

## Evolutionary Corpus Search

"Breed" sounds by combining nearest neighbors. `corpus.breed(a, b)` finds slices that are
spectrally between two sources, enabling gradient-based navigation through timbre space.

## Rhythmic Pattern Mining

Extract onset grids, quantize to tempo, and find recurring rhythmic motifs across a corpus.
Output a "groove DNA" you can transpose to other sources.

## Timbral Lineage Graph

Track derivation: which slices came from which originals, which components from which NMF run.
Visualize as a DAG in the terminal. `sample.lineage()` would be uniquely powerful.

## Instrument / Role Classifier

On-device classifier (tiny ONNX model) that labels each segment: pitched/percussive/noise, or
instrument family. Automatically tag your corpus on import.

## Loudness & Dynamics Fingerprint

Not just RMS — full LUFS trajectory, crest factor curves, and transient density.
`sample.dynamics()` as a counterpart to `.mfcc()`.

## Live-Coding Instrument Mode

Ableton Link sync (already on the roadmap) combined with a percussion pattern DSL:

```js
link.bpm(120)
pattern("x . x x . x . .").play(corpus.slice(3))
```

No other terminal-based tool lets you do this.

## Reactive Variables

Observable bindings that re-run downstream analysis when their dependency changes.
Change a sample → onsets recalculate → corpus rebuilds. Like a spreadsheet for audio.

## REPL Notebook Mode

Interleaved markdown cells + audio REPL cells (Jupyter for sound design). Cells are saved
per-project, shareable as `.bnb` files. Reproducible experiments.

## OSC Output

`corpus.query(5).osc("localhost:57120")` fires OSC messages to SuperCollider/Max/MSP.
Bridge the terminal world with hardware/DAW ecosystems.

## Export to Code

`session.export("supercollider")` or `session.export("maxmsp")` generates idiomatic code
from your REPL session. Teach through reverse-engineering your own workflow.

## Real-Time Spectrogram in Terminal

Using sixel protocol or Unicode block chars, render a scrolling spectrogram directly in xterm.
Most tools require a separate GUI window; doing this in-terminal would be iconic.

## Waveform Diff

`vis.diff(sampleA, sampleB)` — side-by-side spectral comparison highlighting where two sounds
diverge. Essential for iteration-heavy sound design.

## Animated Corpus Similarity Network

Force-directed graph of samples where proximity = timbral similarity. Samples that share spectral
features cluster together in real time as you add to your library.

## LLM REPL Co-pilot

Natural language → REPL command translation, running locally (Ollama).
`bounce: "split this into beats and find 3 similar textures"` → generates and executes the REPL
commands. Keeps data local, no API keys.

## Parameter Suggestion Engine

After running `sample.onsets()`, the system suggests NMF component count based on the spectral
complexity it observed. Reduces the "what settings do I use?" friction for new users.

## Anomaly Detection

Flag outlier slices in a corpus automatically. Slices that are spectrally unlike the rest of the
library are surfaced so users can decide whether to keep them as wildcards or remove them as noise.

## Streaming Audio Pipeline

Process audio in chunks as it's recorded/loaded, so analysis starts before the file is fully read.
Critical for long-form or live-input workflows.

## Plugin System

User-installable FluCoMa algorithm wrappers as npm packages.
`npm install bounce-plugin-pitch` → `sample.pitch()` appears in the REPL. Open ecosystem.

# Cleanup Tasks

## Nested/Chained Tab Completion

These two things prob make sense to tackle together.

* vis builder pattern doesn't support tab completion for chained method calls.
* We don't support tab completion for method calls that are not the outer most call, e.g. the sn.read() within vis.waveform() above

I'm curious if it would make sense to just import the official typescript parser, i.e. the same one
that `tsc` uses. Apparently we can use this programatically to parse source code into an AST.

### Install the package
```
npm install typescript --save-dev
```

### Parse a Code Snippet
```
import * as ts from "typescript";

// Your code as a plain string
const myInMemoryCode = `const x: number = 10;`;

const sourceFile = ts.createSourceFile(
  "virtual-file.ts",     // Just a label, no file is created on disk
  myInMemoryCode,        // The actual string to parse
  ts.ScriptTarget.Latest,
  true                   // setParentNodes: allows you to walk "up" the tree
);

// You can now analyze 'sourceFile' immediately
console.log(sourceFile.statements.length); // 1
```

Would this be a robust way to understand the structure of the code that the user is
typing into the REPL? Would it be performant enough to not compromise the rapid
interactivity that users will want from tab completion?

## Audio Recordings With No Name

This seems to work
```typescript
const mic = sn.dev(0)
const rec = mic.record()
rec.stop()
```

But I'm curious what happens to the recorded sample in this case.
I think we need a better data model for recorded samples in general.
I was looking at the samples table I have in my local bounce db.
I see there are two samples where file_path is null, but neither of these two samples have a linked row in the samples_features
table so they can't be derived samples.
I think these are recorded samples that were recorded with no name, like in the snippet above.
I also think that it is stupid to use the NAME from mic.record(NAME) as the file_path in the db since we aren't actually
writing these recorded samples to the filesystem.
Should we just add a name column?
If this column is populated then we could infer that it's a recorded sample.
I would like to impose a constraint on the schema: we can never have both file_path and name both be populated, i.e.
either exactly one of them is null or both are null. If both are null then it's a derived sample. In this case it would
be nice to have a constraint that there is a linked row in samples_features, but maybe that's a bit heavy and might
not actually be supported in any way by sqlite.
But I think that sqlite's CHECK contraints will prevent us from having a row where both file_path and name are populated.

Actually, we may also want to think about the planned freesound integration when we design the schema for the samples table.
For freesound samples, we're going to want a `url` column that points to the sample's freesound page, or maybe the download
link we used from the API. Either way, we will want to record a url for freesound samples.
Maybe it would be convenient to have a `sample_type` column with a CHECK constraint that ensures that all rows have a value in
the set `('raw', 'derived', 'recording', 'freesound')`.

After chatting with my web browser's AI Mode, I think that the suggested "hybrid approach" seems like a good path forward.
In this approach, we would have 4 new tables:
```sql
CREATE TABLE samples_raw_metadata       (file_path TEXT NOT NULL);
CREATE TABLE samples_recorded_metadata  (name      TEXT NOT NULL);
CREATE TABLE samples_freesound_metadata (url       TEXT NOT NULL);
```
For each sample_type we insert into the samples table (except for `derived`), we would atomically insert a row into the
corresponding metadata table.
This appeals to me because then we have an easy way in the samples table to filter for different types of samples without
bloating the schema with nullable columns.
Application code would enforce the fact that a given sample_type MUST have a linked row in the corresponding metadata table
by atomically inserting to the two tables.

I also think I may want to consider rethinking how we're storing audio data in the db.
I think it might be a good idea to avoid storing this blob data to conserve disk space, e.g. for slices or grains
the only place where we actually have a strong technical reason to cache the actual audio data is in the
audio utility process. The instrument that is going to play the samples will need to cache it in memory because it
wouldn't be realtime-safe for the instrument to read from the filesystem or from sqlite.

But if look at the GranularInstrument example as a thought experiment, where would the audio data for each grain be computed?
I think there are 2 IPC calls involved in defining an instrument:
renderer -> main -> audio utility
And as far as I know, we want to ensure that nothing in the audio utility process is reading from the filesystem or sqlite.
So it seems like the audio data for each grain would be computed by the main process?
Then it would be encoded into the message that is sent via IPC to the audio utility process?

Either way, I think that the audio_data column should only be populated for recorded samples, so maybe it actually belongs
in the samples_recorded_metadata table?
We may also want to consider adding an audio_data column to the samples_freesound_metadata table so that we actually
cache freesound audio data in the sqlite db? That would avoid potentially slow calls to the freesound API every time
we define an instrument that uses freesound samples.

## sn.help()

* sn.help() output sucks. We should enforce a consistent approach for the help() output of all top-level objects.
