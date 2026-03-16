# Plan: Visualization Improvements

**Spec:** specs/visualization-improvements  
**Created:** 2026-03-16  
**Status:** Ready

## Goal

Introduce a user-controlled visualization system centered on a global `vis` namespace and explicit scene objects, replacing the current behavior where sample loading and some analysis commands immediately update the shared waveform display.

The first planned user model is:

```ts
const samp = sn.read("loop.wav")
const onsets = samp.onsets()
const nmf = samp.nmf()

vis.waveform(samp)
  .overlay(onsets)
  .overlay(nmf)
  .show()
```

Key product decisions already established in research:

- commands should not automatically create visualizations
- `vis` should be builder-first, not centered on overloaded `vis.show(...)`
- `vis.waveform(sample)` should return a separate scene object
- scene composition should remain local until `.show()` is called
- `.show()` should append a new scene rather than replace the current one
- appended scenes should stack vertically by default rather than render side by side

## Architecture

### Public API shape

Add a top-level `vis` namespace parallel to `sn`, `fs`, and `corpus`.

Planned namespace surface:

- `vis.help()`
- `vis.waveform(sample): VisScene`
- `vis.list(): VisSceneListResult | BounceResult`
- `vis.clear(): BounceResult`
- `vis.remove(id: string): BounceResult`

Optional future-facing methods that should not be part of the first implementation unless needed:

- `vis.compare(a, b)`
- `vis.layout("grid" | "stack")`
- `vis.show(...)` as sugar over builder flows

Introduce a `VisScene` class as the main composition object. Expected methods:

- `help(): BounceResult`
- `title(text: string): VisScene`
- `overlay(feature: OnsetFeature | NmfFeature | other overlay-capable features): VisScene`
- `panel(feature: NmfFeature | MfccFeature | other panel-capable features): VisScene`
- `show(): BounceResult | VisSceneHandle`

Expected `VisScene` summary properties:

- scene id or pending temporary id
- source sample
- overlay count
- panel count
- whether the scene has been shown
- optional title

If post-show lifecycle needs a separate return type, introduce `VisSceneHandle` with:

- `help(): BounceResult`
- `id`
- `remove(): BounceResult`

The initial implementation can also keep `show()` returning `BounceResult` if a separate handle adds too much scope. The main requirement is that `vis.list()` and `vis.remove(id)` exist once scenes can accumulate.

### Rendering model

Create a dedicated scene stack beneath the terminal. The default layout should be a vertical list of scene cards, where each scene card may contain:

- a primary waveform region
- zero or more overlays aligned to the waveform timeline
- zero or more subordinate analysis panels

Default append behavior:

- first `.show()` adds Scene 1
- second `.show()` adds Scene 2 below Scene 1
- each scene retains its own visual composition

Do not default to side-by-side waveforms for appended scenes. Comparison layouts remain out of scope for the first pass unless explicitly added later.

### Overlay vs panel distinction

Keep two visualization composition modes distinct:

- `.overlay(feature)` for information that should align to the waveform timeline
- `.panel(feature)` for richer standalone views that are not best expressed as marks on the waveform

Initial mapping:

- `OnsetFeature` -> overlay
- `NmfFeature` -> overlay and/or panel, depending on chosen renderer support
- MFCC and future feature types -> likely panel-first

This preserves a clean mental model and avoids overloading a single visualization mechanism.

### Current-state migration

The new design requires removing visualization side effects from existing analysis/sample-loading paths.

Planned behavior changes:

- `sn.read()` should load or return the sample object without automatically creating a visible waveform scene
- `sample.onsets()` should return `OnsetFeature` without immediately drawing slice markers
- `sample.nmf()` should return `NmfFeature` without immediately drawing overlays or panels
- top-level legacy visualization helpers (`visualizeNmf`, `visualizeNx`, `onsetSlice`, `nmf`) should either:
  - become compatibility shims over the new `vis` system, or
  - be deprecated and removed from help/completion in a deliberate migration step

The plan should favor one coherent visualization path rather than maintaining two competing systems indefinitely.

### Internal structure

The likely implementation will touch:

- `src/renderer/bounce-api.ts`
  - add `vis` namespace construction
  - stop analysis/sample methods from triggering visualization side effects
  - build `VisScene` objects and scene-management helpers

- `src/renderer/bounce-result.ts`
  - add `VisScene` and possibly `VisSceneHandle` / `VisSceneListResult`
  - ensure all new REPL-facing objects expose `help()` and useful terminal summaries

- `src/renderer/bounce-globals.d.ts`
  - declare `vis`, `VisScene`, and any scene-management result types
  - expose typed `.overlay()` / `.panel()` contracts

- renderer layout / visualization files
  - `src/renderer/index.html`
  - `src/renderer/app.ts`
  - `src/renderer/waveform-visualizer.ts`
  - `src/renderer/visualization-manager.ts`
  - potentially new scene/container components or helpers

### Layout refactor direction

Current code has a split between:

- one shared waveform canvas driven by `AudioManager`
- a panel-based `VisualizationManager` that is not fully wired into the live DOM

The implementation should consolidate these into a scene-oriented layout model. The simplest path is likely:

1. introduce a real scene-stack container in the renderer DOM
2. treat each appended scene as a DOM card with one waveform canvas plus optional panel region
3. reuse existing waveform and panel visualizer logic where possible, but bind them to scene-local DOM elements rather than a single global canvas

Avoid assuming the current `VisualizationManager` can be dropped in unchanged. The plan should treat it as reusable prior art, not finished infrastructure.

## Files to Change

### Core API and types

- `src/renderer/bounce-api.ts`
- `src/renderer/bounce-result.ts`
- `src/renderer/bounce-globals.d.ts`

### Renderer UI and visualization infrastructure

- `src/renderer/app.ts`
- `src/renderer/index.html`
- `src/renderer/waveform-visualizer.ts`
- `src/renderer/visualization-manager.ts`
- `src/renderer/nmf-visualizer.ts`
- `src/renderer/onset-slice-visualizer.ts`

Additional new renderer files may be warranted, for example:

- `src/renderer/vis-scene.ts`
- `src/renderer/scene-stack.ts`

The exact file split can be decided during implementation if `bounce-api.ts` or the renderer files become too crowded.

### Tests

- `src/bounce-api.test.ts`
- `src/tab-completion.test.ts`
- relevant Playwright specs in `tests/`

## Implementation Steps

1. **Define the public `vis` model in types first**
   - add `vis` declarations to `bounce-globals.d.ts`
   - define `VisScene` and any supporting scene result types
   - define which feature types are valid for `.overlay()` and `.panel()`
   - require `help()` on all new REPL-facing visualization objects

2. **Introduce scene result objects**
   - implement `VisScene` in `bounce-result.ts` or a dedicated renderer result file
   - implement useful terminal summary output for scene objects
   - add lifecycle-oriented result types if needed (`VisSceneHandle`, `VisSceneListResult`)

3. **Refactor the renderer layout around a real scene stack**
   - add a scene container to the renderer DOM
   - create a vertical stack layout below the terminal
   - ensure the scene stack can host multiple appended scene cards
   - preserve terminal usability and scrolling behavior

4. **Make visualization rendering scene-local**
   - stop assuming a single global waveform canvas is the only render target
   - adapt waveform rendering so each shown scene can own its own canvas
   - adapt or replace `VisualizationManager` for scene-local panel rendering
   - reuse existing visualizers where possible

5. **Remove automatic visualization side effects**
   - update `sn.read()` behavior so it no longer creates visible visualization by itself
   - update analysis methods like `sample.onsets()` and `sample.nmf()` so they only return data objects
   - preserve analysis storage and playback behavior unless explicitly changed

6. **Add the `vis` namespace implementation**
   - implement `vis.help()`
   - implement `vis.waveform(sample)`
   - implement `.overlay()`, `.panel()`, `.title()`, `.show()`
   - implement scene lifecycle helpers like `vis.list()`, `vis.remove(id)`, and `vis.clear()`

7. **Decide legacy utility migration**
   - either reimplement `visualizeNmf`, `visualizeNx`, `onsetSlice`, and `nmf` as thin shims over `vis`
   - or remove them from canonical help/completion and keep temporary compatibility wrappers
   - ensure the final help output presents one clear preferred path

8. **Update help, completion, and tests**
   - add `vis.help()` and `VisScene.help()`
   - update root help output
   - update completion/type coverage for `vis` and scene methods
   - update Playwright flows to use explicit visualization commands rather than auto-rendering

9. **Validate the new behavior**
   - confirm no visualization appears until the user calls `vis...show()`
   - confirm multiple scenes append and stack vertically
   - confirm scene lifecycle methods behave predictably

## Testing Strategy

- Run `npm run lint`
- Run `npm run test`
- Run focused REPL tests:
  - `npx tsx src/bounce-api.test.ts`
  - `npx tsx src/tab-completion.test.ts`
- Run relevant Playwright specs that cover visualization and REPL interaction

Manual verification checklist:

- `const samp = sn.read("x.wav")` does not automatically render a visualization scene
- `const onsets = samp.onsets()` does not automatically draw markers
- `const nmf = samp.nmf()` does not automatically create an NMF panel
- `vis.waveform(samp)` returns a useful `VisScene` summary in the REPL
- `vis.waveform(samp).overlay(onsets).show()` creates one scene
- a second `.show()` appends a second scene below the first
- appended scenes keep full-width waveform readability
- `vis.list()` reports current scenes accurately
- `vis.remove(id)` removes the correct scene
- `vis.clear()` removes all scenes
- `vis.help()` and `VisScene.help()` describe the preferred workflow clearly

## Success Criteria

- Bounce exposes a top-level `vis` namespace as the canonical visualization API
- sample/feature commands no longer automatically create visualizations
- users can build scene objects locally and render them explicitly with `.show()`
- appended scenes render as a vertical stack by default
- multiple scenes can coexist in the UI without overwriting each other
- overlays and panels are distinguished in the public API
- `vis`, `VisScene`, and related results follow the REPL `help()` and summary conventions
- help text, typings, and completion consistently describe the new workflow
- lint and relevant automated tests pass after implementation

## Risks / Mitigations

### Risk: The renderer layout becomes too complex too early

Moving from one global waveform canvas to many scene-local canvases is a meaningful renderer change.

Mitigation:

- keep the first scene layout simple: vertical stacked cards only
- postpone compare/grid layouts
- reuse existing waveform and feature visualizers where practical

### Risk: Legacy visualization helpers confuse the new model

If the old helpers remain prominent, users may still treat visualization as a command side effect system.

Mitigation:

- make `vis` the only first-class workflow in help/completion
- keep legacy commands as compatibility shims only if necessary
- ensure their implementation delegates to the new scene system

### Risk: Playback semantics become muddled with multiple visible scenes

Multiple visible scenes may imply independent playback to users even if playback remains globally shared.

Mitigation:

- explicitly document that scene visibility and playback are separate concepts
- keep playback out of scope for the first visualization plan unless a scene-local transport is intentionally designed

### Risk: Incomplete existing panel infrastructure leads to false assumptions

The presence of `VisualizationManager` and related code may suggest multi-panel support is already complete when it is not.

Mitigation:

- treat current visualization code as reusable pieces, not a finished architecture
- make DOM/container wiring a deliberate implementation step in the plan
