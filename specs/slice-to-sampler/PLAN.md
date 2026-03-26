# Plan: Slice-to-Sampler Auto-Mapping

**Spec:** specs/slice-to-sampler  
**Created:** 2026-03-26  
**Status:** In Progress

## Context

The sampler instrument, onset analysis, and slice-creation machinery all exist. What is missing is a single-call convenience method `onsets.toSampler({ name, startNote?, polyphony? })` on `OnsetFeature` that:
1. Internally calls `slice()` (idempotent — DB deduplicates).
2. Creates a sampler instrument.
3. Auto-maps each slice to a consecutive MIDI note starting at `startNote` (default 36 / C2).
4. Returns an `InstrumentResult` ready to play.

Decisions from research:
- `toSampler` lives on `OnsetFeature`; chain is `sn.read(…).onsets().toSampler({ name })`.
- Default `startNote` = **36** (C2, drum convention).
- If slice count exceeds available MIDI range, **load what fits and warn** the user in the terminal output.

## Approach Summary

Add `toSampler(opts)` to `OnsetFeature`:
1. Call the existing `slice()` helper (which triggers `window.electron.sliceSamples`).
2. Retrieve the resulting slice sample hashes from the DB via a new IPC call.
3. Create the sampler via `window.electron.defineInstrument`.
4. Call `window.electron.loadInstrumentSample` for each slice at its assigned note.
5. Return an `InstrumentResult`.

A new IPC channel `"get-slice-samples"` will return `{ hash: string; index: number }[]` given a `featureHash`, letting the renderer retrieve slice hashes without a separate DB access pattern.

## Architecture Changes

No new processes or major structural changes. Changes are contained to:
- Renderer result type (`OnsetFeature`)
- Renderer sample namespace (bindings wiring)
- Main-process IPC handler (new `get-slice-samples` channel)
- DB manager (new `getSliceSamplesByFeatureHash` query)

## Changes Required

### Native C++ Changes

None.

### TypeScript Changes

**`src/electron/database.ts`**
- Add `getSliceSamplesByFeatureHash(featureHash: string): { hash: string; index: number }[]`
  - Queries `samples_features JOIN samples` filtering by `feature_hash`, ordered by `index_order`.

**`src/electron/ipc/audio-handlers.ts`** (or a new `slice-handlers.ts`)
- Add `ipcMain.handle("get-slice-samples", (_event, payload: { featureHash: string }) => ...)` returning `{ hash: string; index: number }[]`.

**`src/electron/preload.ts`**
- Add `getSliceSamples: (featureHash: string) => Promise<{ hash: string; index: number }[]>` to the exposed electron API.

**`src/shared/ipc-contract.ts`** (if it tracks channel names)
- Document `"get-slice-samples"` channel. _(Use string literal in handler per project convention — do NOT import IpcChannel enum in main process.)_

**`src/renderer/results/features.ts`**
- Add `toSampler(opts: ToSamplerOptions): Promise<InstrumentResult>` to `OnsetFeature`.
- Add `ToSamplerOptions` interface: `{ name: string; startNote?: number; polyphony?: number }`.

**`src/renderer/namespaces/sample-namespace.ts`**
- Pass a `toSampler` binding into `bindOnsetFeature(...)` so the method has access to `window.electron.*` calls.

**`src/renderer/tab-completion.ts`**
- Ensure `toSampler` appears in tab completion for `OnsetFeature` instances (it will if `getCallablePropertyNames` reflects it from the object, which it should automatically).

### Terminal UI Changes

`toSampler` returns an existing `InstrumentResult`. Its terminal summary line already shows:
```
<name> (sampler, <n> notes loaded)
```
The `toSampler` method itself will print a prefix message in the `InstrumentResult` display if any slices were dropped due to MIDI range overflow, e.g.:
```
Warning: 4 slices beyond note 127 were dropped.
drums (sampler, 88 notes loaded, polyphony 16)
```

### REPL Interface Contract

**New API surface:**

```typescript
// On OnsetFeature instance returned by samp.onsets()
onsets.toSampler({ name: "drums" })
// → InstrumentResult (reuses existing display + help machinery)

onsets.toSampler({ name: "keys", startNote: 60, polyphony: 8 })
// → InstrumentResult

onsets.toSampler.help()
// → prints description + usage examples
```

**`toSampler.help()` output (example):**
```
toSampler(opts) — create a sampler instrument from onset slices

  Arguments:
    opts.name       string   instrument name (required)
    opts.startNote  number   first MIDI note (default 36 / C2)
    opts.polyphony  number   max simultaneous voices (default 16)

  Returns: InstrumentResult

  Examples:
    const drums = onsets.toSampler({ name: "drums" })
    const keys  = onsets.toSampler({ name: "keys", startNote: 60 })
    drums.noteOn(36)
```

**Returned `InstrumentResult` terminal summary** (unchanged from existing):
```
drums (sampler, 7 notes loaded, polyphony 16)
```
Plus an optional overflow warning prepended when slices are dropped.

#### REPL Contract Checklist

- [x] `toSampler` has a `help` property consistent with other methods on `OnsetFeature`
- [x] Returns existing `InstrumentResult` which already has a useful terminal summary
- [x] Summary highlights name, kind, notes-loaded count, and polyphony
- [x] Unit tests identified for note-mapping arithmetic and overflow warning
- [x] Playwright test identified for end-to-end REPL flow

### Configuration/Build Changes

None. No new npm packages. No `binding.gyp` or native rebuild required.

## Testing Strategy

### Unit Tests

File: `src/slice-to-sampler.test.ts` (or add cases to an existing features test)

1. **Note mapping arithmetic:** Given N slices and `startNote`, verify notes assigned are `[startNote, startNote+1, …, startNote+N-1]`.
2. **Overflow warning:** Given `startNote=100` and 40 slices, verify only 28 slices are loaded (notes 100–127) and the display string contains "dropped".
3. **Zero-slice edge case:** If `onsets.slices` has ≤ 1 entry (no slices), `toSampler` should return an error `BounceResult` rather than an empty instrument.

### E2E Tests

File: `tests/slice-to-sampler.spec.ts`

1. Load a sample with onsets (`sn.read(path).onsets()`), call `toSampler({ name: "test-sampler" })`, verify the REPL output contains the instrument name and a note count > 0.
2. Call `toSampler.help()`, verify help output contains `startNote` and usage example.
3. Trigger `noteOn` on the returned instrument, verify no error.

### Manual Testing

- `npm run dev:electron`, load a drum loop, run `samp.onsets().toSampler({ name: "kit" })`, verify notes appear loaded in `kit.help()` output.
- Trigger `kit.noteOn(36)` through `kit.noteOn(43)` and verify each slice plays.

## Success Criteria

1. `sn.read(path).onsets().toSampler({ name })` works end-to-end in the REPL.
2. Each slice is correctly mapped to a consecutive MIDI note starting at `startNote`.
3. Overflow (>128-startNote slices) warns and loads what fits.
4. `toSampler.help()` prints useful docs with usage examples.
5. Returned `InstrumentResult` displays name + notes-loaded count in the terminal.
6. All unit tests pass; Playwright e2e test passes via `./build.sh`.

## Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| `createSliceSamples` is not idempotent and errors on re-call | Verify DB uses `INSERT OR IGNORE` / `UNIQUE` constraint — it does (`UNIQUE(project_id, sample_hash)`). Safe to re-call. |
| `get-slice-samples` IPC returns stale data if slice hasn't completed | `toSampler` must `await` the `sliceSamples` IPC call before calling `get-slice-samples`. |
| Main-process handler uses IpcChannel enum (breaks CJS build) | Use string literal `"get-slice-samples"` per project convention. |
| Tab completion doesn't pick up `toSampler` automatically | Verify `getCallablePropertyNames` enumerates it; add explicit entry if not. |

## Implementation Order

1. `database.ts` — add `getSliceSamplesByFeatureHash`.
2. IPC handler — add `"get-slice-samples"` channel (string literal).
3. `preload.ts` — expose `getSliceSamples`.
4. `src/renderer/results/features.ts` — add `ToSamplerOptions` interface and `toSampler` method signature.
5. `src/renderer/namespaces/sample-namespace.ts` — wire `toSampler` binding into `bindOnsetFeature`.
6. Unit tests.
7. Playwright e2e test.
8. Manual smoke test via `npm run dev:electron`.
9. `./build.sh` — full suite verification.

## Estimated Scope

Medium (≈6–8 TypeScript files, no C++ changes, one new DB query, one new IPC channel).

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility (additive only, no existing API changes)
- [x] All sections agree on the data model (reuses existing `instruments`/`instrument_samples` tables, new `getSliceSamplesByFeatureHash` query only)
- [x] REPL-facing changes define `help()` surface and `InstrumentResult` terminal summary
- [x] Testing strategy names unit test for arithmetic/overflow and Playwright test for REPL flow
- [x] No contradictory constraints between sections
- [x] `startNote` default (36) is consistent throughout
