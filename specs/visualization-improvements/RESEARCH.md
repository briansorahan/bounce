# Research: Visualization Improvements

**Spec:** specs/visualization-improvements  
**Created:** 2026-03-16  
**Status:** Complete

## Problem Statement

Bounce's current visualization behavior is too tightly coupled to analysis and sample-loading commands. Today, loading a sample into the shared renderer context immediately shows the waveform, and some analysis commands immediately modify that shared visualization state. This makes visualization feel like a side effect of analysis rather than a user-controlled activity.

The desired direction is to move toward a dedicated global visualization API centered on a `vis` object. In that model, analysis commands produce sample and feature objects, while visualization is explicitly requested by the user. A likely target workflow is:

```ts
const samp = sn.read("loop.wav")
const onsets = samp.onsets()
const nmf = samp.nmf()

vis.waveform(samp)
  .overlay(onsets)
  .overlay(nmf)
  .show()
```

This shift is not only about syntax. It is also about clarifying the mental model: analysis creates data; `vis` turns data into visible scenes.

## Background

Bounce currently has two distinct visualization paths in the renderer:

- a shared waveform canvas at the bottom of the window
- a separate panel-based visualization system managed by `VisualizationManager`

The shared waveform canvas is the more complete path. It already supports:

- waveform rendering
- playback cursor rendering
- onset slice marker overlays
- NMF activation overlays

The panel-based system exists for richer standalone visualizations like NMF basis/activation views, but it is not fully integrated into the current renderer layout.

The user direction established during research is:

- commands should not automatically create visualizations
- visualization should be controlled through a global `vis` object
- the API should be builder-first rather than centered on an overloaded `vis.show(...)`
- `vis.waveform(samp)` should return a separate scene object
- scene composition should remain local to that object until `.show()` is called
- `.show()` should append a new scene rather than replace the current visualization
- appended scenes should stack vertically by default rather than render side by side

## Related Work / Prior Art

### Internal prior art: REPL namespaces

Bounce already uses top-level namespace objects for discoverable REPL APIs. The best example is `fs`, which groups related methods under one global object and provides `help()` both at the namespace level and on individual methods/results.

This is relevant because `vis` should likely follow the same pattern:

- `vis.help()` for overview usage
- scene objects with their own `help()`
- typed result objects rather than plain JSON

### Internal prior art: typed sample and feature objects

The current REPL already returns typed `Sample`, `OnsetFeature`, `NmfFeature`, and `MfccFeature` objects. These are good inputs to a visualization API because they already carry stable identifiers, source relationships, and summary metadata.

### Internal prior art: shared waveform context

The existing sample workflow is organized around a singleton-like audio/display context. `sn.read()` loads a sample into that shared context, and visual commands like `visualizeNmf()`, `visualizeNx()`, and `onsetSlice()` operate against it.

That is valuable precedent for a first visualization model, but it also demonstrates the main problem: rendering is currently organized around ambient global state rather than explicit scene objects.

## FluCoMa Algorithm Details

The main visualization-related FluCoMa outputs currently exposed in Bounce are:

- onset-slice results
- NMF decomposition results
- NX / cross-synthesis related visual output
- MFCC data, though it does not yet appear to have a first-class visualization path

The proposed `vis` API does not require changing the underlying FluCoMa analysis itself. The important shift is in how stored feature outputs are surfaced to the user:

- `sample.onsets()` should return an `OnsetFeature`
- `sample.nmf()` should return an `NmfFeature`
- feature objects become valid inputs to scene composition methods like `.overlay()` or `.panel()`

This keeps FluCoMa analysis and visualization loosely coupled.

## Technical Constraints

### Current visualization state is centralized

The current renderer architecture is built around a single `AudioManager` and a single waveform canvas. This means current visualization logic assumes:

- one active sample in the waveform context
- one active playback cursor
- shared overlay state such as onset slices and NMF activations

Moving to appended scene objects will require introducing a layer above this shared state so that multiple scenes can coexist in the UI even if playback remains globally shared.

### Existing panel infrastructure is incomplete

The renderer includes a `VisualizationManager` class and a dedicated `NMFVisualizer`, but the `nmf()` visualization path looks for a `visualizations-container` DOM node that is not present in `src/renderer/index.html`.

This is a useful finding for the spec:

- there is already some code for multi-panel visualization
- that code does not currently appear to be fully wired into the active layout
- the spec should treat multi-scene layout as a first-class architectural problem, not just an API rename

### Result typing is already favorable

The existing REPL result model already supports:

- `help()` on namespace and object surfaces
- typed sample/feature classes
- thenable wrappers so users can compose calls without explicit `await`

That means `vis` can likely follow the established pattern:

- `vis` as a namespace object
- a `VisScene` class as a typed result object
- maybe a `VisScenePromise` wrapper if scene construction becomes async

## Audio Processing Considerations

Visualization should stay separate from audio computation and playback concerns.

Important implications:

- constructing a scene should not require re-running analysis if the relevant sample/feature object already exists
- scene composition should be able to reference stored features by object identity, not only by "most recent feature for current audio"
- playback can remain globally shared even if multiple scenes are visible

Multiple waveform scenes shown at once do not imply multiple simultaneously playing transports. The scene stack is primarily an inspection model, not a multi-voice mixer.

## Terminal UI Considerations

This feature affects the REPL interface directly and should follow Bounce's existing REPL conventions.

### Proposed surface

The builder-first model currently has the strongest product support:

```ts
const a = sn.read("a.wav")
const b = sn.read("b.wav")

vis.waveform(a).overlay(a.onsets()).show()
vis.waveform(b).overlay(b.nmf()).show()
```

Recommended scene concepts:

- `vis.waveform(sample)` creates a scene rooted in a waveform
- `.overlay(feature)` adds data aligned to the waveform timeline
- `.panel(feature)` adds a secondary panel below or within the scene card
- `.title("...")` optionally names the scene
- `.show()` appends the scene to the rendered visualization area

### Scene layout direction

Research discussion established that appended scenes should not default to side-by-side waveform comparisons. Instead, the default appended layout should be a vertical stack of scene cards beneath the terminal.

For example:

- Scene 1: waveform for sample A with overlays/panels
- Scene 2: waveform for sample B with overlays/panels

This is preferable because:

- waveforms benefit from maximum horizontal width
- stacked scenes are easier to scan in a terminal-adjacent layout
- appended scenes match REPL history better than a shrinking grid
- comparison layouts can be introduced explicitly later if desired

### Comparison as an explicit mode

If Bounce eventually supports side-by-side comparison, it should probably be explicit rather than the default append behavior. Possible future directions:

- `vis.compare(a, b)`
- `vis.layout("grid")`
- scene-level synchronization options for zoom/cursor alignment

For the initial spec, stacked-by-default is the clearest direction.

### REPL help and object display requirements

Because `vis` would be a REPL-facing namespace, it should follow the established REPL contract:

- `vis.help()` should explain the visualization model
- `vis.waveform.help()` should explain scene creation
- `VisScene.help()` should explain composition and rendering
- displaying a `VisScene` in the terminal should print a useful summary, such as source sample, overlay count, panel count, and whether it has been shown

## Cross-Platform Considerations

The proposed changes are renderer-side TypeScript and DOM layout work, so they should be broadly cross-platform. The main cross-platform concerns are indirect:

- preserving current path/sample-loading behavior through existing `sn.read()` and database lookups
- ensuring any new scrollable or stacked scene layout works well across platform font/rendering differences
- avoiding assumptions that depend on a specific window size or pixel density

The decision to prefer stacked scenes over default side-by-side layout should help cross-platform consistency because it reduces pressure on width-constrained windows.

## Open Questions

1. **What is the first supported scene root besides waveform, if any?**  
   Waveform is the clearest initial anchor, but later versions may want feature-first scenes such as spectrogram, MFCC heatmap, or corpus views.

2. **How should appended scenes be managed once many exist?**  
   A first release likely needs lifecycle controls such as `vis.list()`, `vis.remove(id)`, and `vis.clear()`.

3. **How much mutable behavior should a `VisScene` expose after `.show()`?**  
   Options include:
   - immutable scenes that require creating a new scene for changes
   - live scene handles that can update the rendered scene after it has been shown

   The current discussion leans toward simple build-then-show semantics first.

4. **Should overlays and panels accept only typed objects, or also hashes/options objects?**  
   Strongly typed sample/feature inputs are preferable for clarity, but compatibility helpers may still be useful.

5. **How should playback relate to multiple visible scenes?**  
   The UI can show many scenes at once, but playback likely remains tied to the single active `AudioManager`. The spec should decide whether scene-local playback controls are in scope.

## Research Findings

1. **Current visualization behavior is coupled to sample loading and analysis.**  
   `sn.read()` loads audio into the shared waveform context, and onset analysis currently updates slice markers immediately. This is the main behavioral pattern the new `vis` model is intended to replace.

2. **Bounce already has the beginnings of two visualization systems.**  
   The current renderer supports both shared waveform overlays and separate visualization panels, but they are not yet unified under one consistent user-facing model.

3. **A builder-first `vis` API is a strong fit for Bounce's REPL.**  
   It aligns with the existing namespace/help/result conventions and keeps visualization composition explicit.

4. **A separate scene object is preferable to implicit global mutation.**  
   `vis.waveform(samp)` should return a `VisScene` that accumulates composition locally and only affects the UI when `.show()` is called.

5. **Appended scenes should stack vertically by default.**  
   This is the clearest fit for waveform-heavy visual inspection and for the existing terminal-plus-bottom-pane layout. Side-by-side comparison should be an explicit future mode rather than default append behavior.

6. **Scene management should be part of the first-class API.**  
   Once `.show()` appends instead of replaces, lifecycle methods such as listing, removing, and clearing scenes become important.

7. **The current panel-based path appears incomplete.**  
   `VisualizationManager` and `NMFVisualizer` exist, but the expected panel container is not currently present in the renderer HTML. The spec should account for real layout wiring, not just object API design.

## Next Steps

- Move to the PLAN phase for `visualization-improvements`
- Define the concrete `vis` namespace surface and `VisScene` type
- Decide which current visualization commands become compatibility shims versus removals
- Decide how stacked scenes are represented in the DOM and how they coexist with the terminal layout
- Define tests for:
  - no automatic visualization from sample/feature commands
  - `vis.help()` and `VisScene.help()`
  - `VisScene` terminal summary output
  - stacked appended scene rendering behavior
