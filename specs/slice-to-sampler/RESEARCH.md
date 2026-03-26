# Research: Slice-to-Sampler Auto-Mapping

**Spec:** specs/slice-to-sampler  
**Created:** 2026-03-26  
**Status:** Complete

## Problem Statement

After analyzing onsets on a sample the user must manually call `inst.sampler()`, then loop through each slice and call `loadSample(note, slice)` one at a time. There is no convenience path to go from "I have onset slices" to "I have a playable sampler instrument". This is a high-friction, repetitive workflow that should be a single REPL call.

## Background

Bounce already has:
- **Onset analysis:** `sample.onsets()` returns an `OnsetFeature` with a `slices: number[]` array of frame-index positions and a `featureHash` identifying the analysis in the DB.
- **Slice creation:** `onsets.slice()` calls `createSliceSamples(sourceHash, featureHash, audioData)` in the DB layer, which creates a derived `samples` record for every adjacent pair of onset positions and links them in `samples_features` with an `index_order`.
- **Sampler instrument:** `inst.sampler({ name, polyphony? })` returns an `InstrumentResult` with `loadSample(note, sample, opts?)`, `noteOn`, `noteOff`, `stop`, `free`.
- **DB tables:** `instruments`, `instrument_samples` (with `note_number` 0–127).

What is **missing** is a convenience layer that wires these together automatically.

## Related Work / Prior Art

- Standard samplers (e.g., Kontakt, EXS24, Ableton Sampler) all support "auto-map" — slicing a sample and distributing the results across a keyboard range starting from a root note.
- FluCoMa's own examples demonstrate onset slicing followed by manual playback loops; they do not have an auto-map primitive.

## FluCoMa Algorithm Details

No new FluCoMa algorithm is needed. This feature is purely a TypeScript convenience wrapper over existing onset-slice analysis and the existing sampler instrument engine.

## Technical Constraints

- Onset positions (`slices: number[]`) are **frame indices** (not seconds). Converting to slice samples requires the source sample's sample rate.
- The `samples_features` table links source sample → slice samples via `index_order`. Slice sample hashes can be recovered from the DB given `featureHash`.
- MIDI note range is 0–127. Starting from note 36 (C2) is a common default for drum samplers; starting from 60 (C4) is common for melodic samplers. We should accept a configurable `startNote` (default 36).
- If `onsets.slice()` has not been called yet the DB will have no slice sample records for that `featureHash`. The auto-map convenience method must call or trigger `slice()` internally.
- Maximum 128 slices can be mapped (notes 0–127). If there are more slices, the excess beyond `startNote + 127` is silently dropped (or we warn the user).

## Audio Processing Considerations

- The auto-map operation is DB-and-IPC work, not audio DSP. It should be fast.
- Each slice is loaded into the native audio engine as a PCM buffer. Memory scales linearly with total slice duration.
- `createSliceSamples` in `database.ts` already manages deduplication via `UNIQUE(project_id, sample_hash)`.

## Terminal UI Considerations

The new API should:
- Add `toSampler(opts)` method to `OnsetFeature` (in `src/renderer/results/features.ts` and wired in `src/renderer/namespaces/sample-namespace.ts`).
- Return an `InstrumentResult` (existing type) so the existing instrument help/display machinery is reused.
- The method itself should have a `help` property consistent with other REPL methods.
- Tab completion: the `OnsetFeature` object is returned from `samp.onsets()`, so tab completion on `onsets.` should include `toSampler`.

**REPL interface:**
```
onsets.toSampler({ name: "drums" })
// → InstrumentResult: drums (sampler, 7 notes loaded)
onsets.toSampler({ name: "keys", startNote: 48, polyphony: 8 })
// → InstrumentResult: keys (sampler, 7 notes loaded)
```

## Cross-Platform Considerations

No platform-specific concerns. All changes are TypeScript in the renderer process.

## Open Questions

1. **Should `toSampler` call `slice()` internally**, or should it require the user to have already called `slice()`?
   - Leaning toward: call it internally (transparent), similar to how `onsets()` auto-stores the feature.
   - If slices already exist for the `featureHash`, `createSliceSamples` deduplicates, so re-calling is safe.

2. **What should the default `startNote` be?** 36 (C2, drum convention) or 60 (C4, melodic convention)?
   - Leaning toward **36** as onset slicing is most often used for rhythmic/percussive material.

3. **Should `toSampler` return a thenable wrapper** (`InstrumentResultPromise`) for chaining, or just return `InstrumentResult` directly (since `inst.sampler()` is synchronous today)?
   - `toSampler` needs to be async (it calls `slice()` and `loadSample` for each note), so wrapping in a thenable makes sense for REPL ergonomics.

4. **What if slice count exceeds the available MIDI range** (startNote to 127)?  
   - Clamp and warn the user in the terminal output.

## Research Findings

- **`OnsetFeature.slices`** holds frame-index onset positions. The number of slices is `slices.length - 1` (N onset positions → N-1 slices between adjacent pairs).
- **`onsets.slice()`** internally calls `window.electron.sliceSamples(audio.hash, featureHash)`, which maps to `ipcMain.handle("slice-samples", ...)` → `dbManager.createSliceSamples(...)`. It returns a `BounceResult` (not the slice hashes directly).
- **Slice hashes** can be retrieved post-creation via a DB query: `getSliceSamples(featureHash)` does not currently exist, but `getSliceSamplesByFeature(featureHash)` or similar can be added (or the IPC handler can return the hashes).
- **`inst.sampler()` is synchronous** today; `loadSample` sends an async IPC message but returns a `BounceResult` synchronously.
- No `toSampler`, `mapToNotes`, or `fromSlices` method exists anywhere in the codebase.

## Next Steps

In PLAN phase:
1. Decide on the open questions above (startNote default, async/thenable wrapper).
2. Design the exact API signature and return type.
3. Identify all files needing changes (feature result, sample namespace, IPC handler for returning slice hashes, tab completion).
4. Define the testing strategy (unit test for note mapping arithmetic, Playwright test for end-to-end REPL flow).
