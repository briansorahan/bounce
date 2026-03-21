# Implementation: Visualization Improvements

**Spec:** specs/visualization-improvements  
**Created:** 2026-03-16  
**Status:** Complete

## Context

Following `specs/visualization-improvements/PLAN.md`, this work introduced a `vis` namespace as the canonical visualization API and removed automatic visualization side effects from sample loading and analysis commands.

## Implementation Log

### 2026-03-16 — Implemented as Part of Sample Object API Refactor

The visualization improvements were implemented in the same session as `specs/sample-object-api`. The two specs were tightly coupled: removing top-level sample globals and introducing `sn`/`Sample` naturally created the right seam to also stop auto-rendering visualizations.

Key changes made:

- `sn.read()` no longer automatically renders a waveform scene. Users must call `vis.waveform(sample).show()` explicitly.
- `sample.onsets()` and `sample.nmf()` return feature objects only; they no longer trigger visualization side effects.
- `vis` namespace added as a top-level REPL global with `vis.waveform()`, `vis.list()`, `vis.clear()`, `vis.remove()`, and `vis.help()`.
- `VisScene` builder object implemented with `.overlay()`, `.panel()`, `.title()`, and `.show()`.
- Renderer playback updated to track multiple active playbacks by sample hash, so stacked waveform scenes can show independent playheads.
- Scene stack renders as a vertical list of scene cards beneath the terminal.
- Legacy visualization helpers (`visualizeNmf`, `visualizeNx`, etc.) removed from canonical help and completion.

## Decisions Made

- Visualization and sample loading were decoupled in the same pass as the `sn`/`Sample` refactor rather than as a separate PR, since both required reworking `bounce-api.ts` and `bounce-result.ts`.
- `VisScene` returns `this` from `.overlay()`, `.panel()`, and `.title()` to enable builder-style chaining.
- `.show()` appends a new scene rather than replacing the current one.

## Deviations from Plan

- `VisSceneHandle` as a separate post-show return type was not introduced; `.show()` returns a `BounceResult`. `vis.list()` and `vis.remove(id)` satisfy the lifecycle management requirement.
- Implementation was not tracked in a dedicated IMPL.md at the time it was completed — it was absorbed into the `sample-object-api` session.

## Issues & TODOs

- Compare/grid layout modes remain future work.
- Loop-region controls for `sample.loop()` may eventually warrant scene-level transport controls.

## Testing Results

- `npm run lint` — passed
- `npm run build:electron` — passed
- `npm run test` — passed
- Playwright specs updated to use explicit `vis.waveform(sample).show()` rather than relying on auto-rendering side effects.

## Final Status

**Completion Date:** 2026-03-16

**Summary:** Introduced the `vis` namespace as the canonical visualization API. Sample loading and analysis commands no longer produce automatic visualization side effects. Users build scene objects via `vis.waveform(sample).overlay(...).show()` and manage the scene stack with `vis.list()`, `vis.remove(id)`, and `vis.clear()`. Multiple scenes stack vertically and support independent playheads.

**Verification:**
- [x] Linting passed
- [x] TypeScript builds
- [x] Tests pass
- [ ] Manual testing complete
- [x] REPL help() coverage verified by unit and/or Playwright tests
- [x] REPL returned-object terminal summaries verified by unit and/or Playwright tests
- [ ] Cross-platform tested (if applicable)

**Known Limitations:**
- Compare and grid layout modes are not yet implemented.
- Legacy visualization helpers have been removed from help/completion but may still exist as internal references.

**Future Improvements:**
- `vis.compare(a, b)` for side-by-side waveform comparison
- `vis.layout("grid" | "stack")` for layout control
- Scene-local transport controls if multi-scene playback UX demands it
