# Prioritzed Features

See the brainstorming section for the full description of what each of these ideas actually entails.

* Utility Process Playback (Simple Sample Playback)
* Utility Process Granular Sample Playback
* Normalization
* Multichannel Audio
* Multiline Editing
* Live-Coding Sample Playback
* Ableton Link Integration
* Tutorials
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

## Normalization

I would like to be able to normalize a sample!
There may be some other kinds of gain adjustments we could apply.

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

## Tab Completion

* clearDebug() is still exposed through tab-completion. Also need to remove things like helpFactory().
  * General audit to make sure everything showing up in tab completion is stuff we want to expose to users.
  * Also need to remove toString() from tab completion
* vis builder pattern doesn't support tab completion for chained method calls.
* We don't support tab completion for method calls that are not the outer most call, e.g. the sn.read() within vis.waveform() above

## sn.help()

* sn.help() output sucks. We should enforce a consistent approach for the help() output of all top-level objects.

## Cleanup help() Output and Remove Legacy Functions

Current output (minus the example code):
```
── Sample API ──
  sn                               Sample namespace: .read() .list() .current() .stop() .help()
  env                              Runtime introspection: .vars() .globals() .inspect() .functions()
  proj                             Project namespace: .current() .list() .load() .rm() .help()
  Sample                           .play() .loop() .stop() .display() .onsets() .nmf() .mfcc()
                                   .slice() .sep() .granularize() .help()
  vis                              Visualization namespace: .waveform() .list() .remove() .clear()
  nx(options)                      NMF cross-synthesis
  corpus                           KDTree corpus: .build() .query() .resynthesize()

── Utilities ──
  visualizeNmf(options?)           Legacy helper: vis waveform + NMF overlay
  visualizeNx(options?)            Legacy helper for NX visualization
  onsetSlice(options?)             Legacy helper: vis waveform + onset overlay
  nmf(options?)                    Legacy helper: vis waveform + NMF panel
  fs                               Filesystem: .ls .la .cd .pwd .glob .walk
  debug(limit?)                   Show debug log entries
  clearDebug()                    Clear stored debug log entries
  help()                           Show this help message
  clear()                          Clear the terminal screen
```

* Remove visualizeNmf, visualizeNx, onsetSlice, nmf.
* Do not show debug() or clearDebug(). We can document these in developer docs in a markdown file in the repo.
* Sample API is a stupid heading.
  * I don't think we should document the Sample type.
  * Things like proj and vis are not just part of the sample API.
  * Where does nx belong?
  * Maybe we don't really need headings?

## General Typescript Functionality

* Need to be able to do things like vis.waveform(sn.read(PATH)) i.e. shouldn't have to assign sn.read(PATH) to a variable
