# Plan: Granularize

**Spec:** specs/granularize  
**Created:** 2026-03-08  
**Status:** In Progress

## Context

From RESEARCH.md: `granularize` performs regular, time-based segmentation of a sample into fixed-size grains. Each raw grain is stored as a derived sample using the existing `storeFeature` + `createDerivedSample` database infrastructure — the same pattern as onset-slice. No C++ changes are required. The function returns a `GrainCollection` iterator object.

## Approach Summary

1. Call `storeFeature(sourceHash, 'granularize', grainStartPositions[], options)` → `featureHash`. This records all parameters used and deduplicates identical runs.
2. For each non-silent grain, call `createDerivedSample(sourceHash, featureHash, index, audioData, ...)` — links grain back to source and feature via `samples_features`.
3. Add `granularize(source?, options?)` to `bounce-api.ts` that calls this handler and wraps the returned hashes in a `GrainCollection`.
4. Implement `GrainCollection` in a new file `src/renderer/grain-collection.ts`.
5. Export types in `bounce-globals.d.ts`.

## Architecture Changes

No new native modules. The feature is a pure TypeScript addition on top of the existing IPC and database layers.

```
REPL
 └─ granularize() in bounce-api.ts
     └─ IPC: granularize-sample  →  main.ts handler
         ├─ loads source audio
         ├─ rejects if duration > 20s
         ├─ storeFeature('granularize', grainStartPositions[], options) → featureHash
         ├─ for each non-silent grain: createDerivedSample(sourceHash, featureHash, index, ...)
         └─ returns { grainHashes: Array<string | null> }
 └─ GrainCollection wraps hashes as AudioResult[] (null = silent/skipped grain)
```

## Changes Required

### Native C++ Changes

None.

### TypeScript Changes

#### `src/electron/main.ts`
- Add IPC handler `granularize-sample`.
  - Input: `{ sourceHash: string, options: GranularizeOptions }`
  - Loads source audio from DB.
  - **Rejects with an error if source sample duration exceeds 20 seconds.**
  - Computes grain count and start positions (applying `jitter` if set).
  - Extracts raw PCM for each grain — **no windowing at this stage**.
  - Computes RMS amplitude for each grain; skips `createDerivedSample` for grains below `silenceThreshold` (default -60 dBFS). Skipped grains still consume an `index_order` slot so positional structure is preserved.
  - Calls `db.createDerivedSample(sourceHash, featureHash, index, audioData, ...)` for each non-silent grain.
  - Returns `{ grainHashes: Array<string | null> }` — `null` entries represent skipped (silent) grains, preserving positional structure.

Note: windowing is a playback concern — it is not applied during grain extraction or storage.

#### `src/electron/database.ts`
- No schema changes needed (grains stored as derived samples, feature stored via existing `storeFeature`).
- Verify `createDerivedSample` signature accepts the granularize `featureHash`.

#### `src/renderer/grain-collection.ts` _(new file)_
- Implements `GrainCollection` class.

```typescript
export class GrainCollection {
  private grains: AudioResult[];
  private normalize: boolean;

  constructor(grains: AudioResult[], normalize: boolean) { ... }

  length(): number

  // Sequential: awaits each callback before proceeding.
  // Passes the raw AudioResult; windowing is applied by any play helper, not here.
  forEach(callback: (grain: AudioResult, index: number) => void | Promise<void>): Promise<void>

  map<T>(callback: (grain: AudioResult, index: number) => T): T[]

  filter(predicate: (grain: AudioResult, index: number) => boolean): GrainCollection
  // Returns a new GrainCollection (same normalize setting) for composability.

  toString(): string  // e.g. "GrainCollection(42 grains from <sourceHash>)"
}
```

The `normalize` setting is retained on the collection so playback helpers know whether to apply per-grain normalization.

#### `src/renderer/bounce-api.ts`
- Add `granularize` function:

```typescript
async function granularize(
  source?: string | AudioResult | Promise<AudioResult>,
  options?: GranularizeOptions
): Promise<GrainCollection>
```

- Resolves `source` using the same pattern as `play()` / `slice()` (falls back to most-recent sample).
- Sends `granularize-sample` IPC call with resolved `sourceHash` and `options`.
- Constructs `AudioResult` objects for each returned grain hash.
- Returns a `GrainCollection`.

#### `src/renderer/bounce-globals.d.ts`
- Export `GranularizeOptions` interface and `GrainCollection` type.
- Add `granularize` to the global `BounceApi` declaration.

### Terminal UI Changes

`GrainCollection.toString()` returns a summary string displayed after the call:
```
GrainCollection(42 grains from abc123...)
```

### Configuration/Build Changes

None — no new native modules, no new npm dependencies.

## `GranularizeOptions` Interface

```typescript
interface GranularizeOptions {
  /** Duration of each grain in milliseconds. Defaults to 20. */
  grainSize?: number;

  /** Distance between consecutive grain start positions in ms.
   *  Defaults to grainSize (non-overlapping).
   *  Values less than grainSize produce overlapping grains. */
  hopSize?: number;

  /** Random offset (0–1) applied to grain start positions as a fraction of hopSize.
   *  0 = no jitter (default). */
  jitter?: number;

  /** Process only from this time offset (ms). Defaults to 0. */
  startTime?: number;

  /** Stop processing at this time offset (ms). Defaults to end of sample. */
  endTime?: number;

  /** Normalize each grain to unit peak amplitude. Defaults to false. */
  normalize?: boolean;

  /** Grains whose RMS amplitude is below this level (dBFS) are not stored.
   *  Defaults to -60. Set to -Infinity to disable silence filtering. */
  silenceThreshold?: number;
}
```

## Windowing Implementation (renderer, at playback time)

Window functions are applied in the renderer process when a grain is played, not during storage. Applied sample-by-sample to a grain of `N` samples:

```
Hann:     w[i] = 0.5 * (1 - cos(2π * i / (N-1)))
Hamming:  w[i] = 0.54 - 0.46 * cos(2π * i / (N-1))
Rect:     w[i] = 1
```

Multi-channel audio: apply window independently to each channel's samples.

Last grain handling: if the final grain would extend beyond the sample end during extraction, **drop it** (do not pad).

## Testing Strategy

### Unit Tests

- `grain-collection.test.ts`: test `forEach` sequential ordering, `map`, `filter`, `length`.
- `granularize.test.ts` (main process): test grain boundary computation, edge cases (grainSize > sample duration, jitter clamping). No windowing tests here — windowing is a renderer concern.

### E2E Tests

- Playwright test: call `granularize(hash, { grainSize: 100 })`, verify `GrainCollection` is returned with correct `length()`, iterate with `forEach`.

### Manual Testing

- Granularize a short sample and play individual grains with `play()`.
- Verify grains appear in `list()` output.
- Test `filter` → `forEach` composition.

## Success Criteria

- `granularize(hash, { grainSize: 50 })` returns a `GrainCollection` with the expected number of grains.
- Each grain is retrievable from the database by its hash.
- `forEach`, `map`, `filter`, `length` all behave correctly.
- `forEach` with an async callback executes sequentially.
- No grains extend beyond the source sample boundary.
- Grains appear as derived samples in `list()` output.

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| `createDerivedSample` signature doesn't fit grain use-case | Audit signature early; add minimal overload if needed |
| Large samples produce thousands of grains, slow IPC | Return hashes only from IPC; construct `AudioResult` lazily or in batch |
| Overlapping grains confuse `samples_features` provenance | Use a `granularize` sentinel feature hash per call to group grains |

## Implementation Order

1. Audit `database.ts` `createDerivedSample` — confirm it works for grains or note required changes.
2. Add `granularize-sample` IPC handler to `main.ts`.
3. Implement `GrainCollection` in `src/renderer/grain-collection.ts`.
4. Add `granularize()` to `bounce-api.ts`.
5. Update `bounce-globals.d.ts` with new types.
6. Write unit tests.
7. Write E2E test.
8. Manual verification.

## Estimated Scope

Medium.

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements (no breaking changes)
- [x] All sections agree on the data model / schema approach (derived samples, no schema changes)
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
