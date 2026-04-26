# Plan: Granularize Effect (Audio Editor Workflow)

**Spec:** specs/granularize-effect  
**Beads Parent Issue:** bounce-e1f  
**Created:** 2026-04-26  
**Status:** In Progress

## Context

Bounce has two existing granular features — grain extraction (`sample.granularize()`) and real-time granular instrument (`inst.granular()`). Neither provides the simple audio-editor workflow of "process these grains into a new sample." The research phase confirmed that overlap-add resynthesis in TypeScript is the right approach, with `bounce()` as a method on `GrainCollection`. Additionally, `granularize()` is being renamed to `grains()` for brevity.

## Approach Summary

Two changes plus one default adjustment:

1. **Rename `sample.granularize()` → `sample.grains()`** across all code, types, docs, and tests.

2. **Add `grains.bounce(options?)` → `SamplePromise`** that resynthesizes a `GrainCollection` into a single new sample via overlap-add.

3. **Change `silenceThreshold` default from `-60` dBFS to `-Infinity` (disabled).** Silent grain filtering should be opt-in, not opt-out. Users who want it can pass `{ silenceThreshold: -60 }` explicitly. This affects `computeGrains()` in `src/electron/services/granularize/index.ts`, the RPC type comment in `src/shared/rpc/granularize.rpc.ts`, and the opts-docs entry.

1. **Rename `sample.granularize()` → `sample.grains()`** across all code, types, docs, and tests.

2. **Add `grains.bounce(options?)` → `SamplePromise`** that resynthesizes a `GrainCollection` into a single new sample via overlap-add.

The full chaining workflow:

```typescript
const res = sn.load("foo").grains({ grainSize: 50 }).bounce({ density: 20, pitch: 1.2 })
vis.waveform(res).show()
res.play()
```

## Architecture Changes

No new processes or major architectural changes. The feature extends the existing granularize worker with a new RPC method and adds a method to `GrainCollection` / `GrainCollectionPromise`.

```
[REPL]  sample.grains(opts).bounce(opts)
  ↓ (IPC: bounce-grains)
[Main Process]  resolveAudioData(sourceHash) → source PCM
  ↓ (JSON-RPC: granularize/bounce)
[Worker]  resynthesize(sourcePCM, grainPositions, bounceOpts)
  ↓ returns Float32Array
[Main Process]  storeDerivedSample(hash, pcm) → SampleRecord
  ↓ (IPC response)
[REPL]  SampleResult (playable, chainable)
```

## Changes Required

### Native C++ Changes

None. The resynthesis engine is pure TypeScript math on `Float32Array`.

### TypeScript Changes

#### 1. Rename `granularize()` → `grains()`

Files requiring the rename (method name, help text, option references, tests):

| File | What Changes |
|------|-------------|
| `src/renderer/results/sample.ts` | `SampleResult.granularize()` → `grains()`, `SamplePromise.granularize()` → `grains()`, `CurrentSamplePromise.granularize()` → `grains()` |
| `src/renderer/namespaces/sample-namespace.ts` | `granularizeSample()` → `grainsSample()`, binding key `granularize` → `grains`, help text |
| `src/shared/repl-environment.d.ts` | Method signature `granularize` → `grains` |
| `src/renderer/opts-docs.ts` | `@usedby granularize` → `@usedby grains` |
| `src/shared/repl-registry.generated.ts` | Generated — will update via `npm run generate:help` after source changes |
| `src/renderer/namespaces/inst-commands.generated.ts` | Check for references |
| `src/renderer/bounce-api.ts` | Check for references |
| `src/renderer/bounce-globals.d.ts` | `granularize` in Sample interface → `grains` |
| `src/granular-instrument.test.ts` | Update any calls to `granularize` |
| `src/bounce-api.test.ts` | Update help coverage for renamed method |
| `src/results-sample.test.ts` | Update test descriptions if they reference `granularize` |
| `tests/granularize.spec.ts` | Playwright test — update REPL commands |
| `tests/workflows/granularize.test.ts` | Workflow test — update calls |

#### 2. Resynthesis Engine — `src/electron/services/granularize/resynthesize.ts` (new file)

Pure function implementing overlap-add granular resynthesis:

```typescript
export interface ResynthesisParams {
  audioData: Float32Array;       // source PCM
  sampleRate: number;
  grainPositions: number[];      // source sample offsets
  grainSizeSamples: number;
  outputLengthSamples: number;
  pitch: number;                 // playback rate (1.0 = original)
  envelope: number;              // 0=Hann, 1=Hamming, 2=Triangle, 3=Tukey
  density: number;               // grains per second in output
}

export function resynthesize(params: ResynthesisParams): Float32Array;
```

**Algorithm:**
1. Pre-compute window LUT (1024 samples) for selected envelope type:
   - Hann: `0.5 * (1 - cos(2π * n / (N-1)))`
   - Hamming: `0.54 - 0.46 * cos(2π * n / (N-1))`
   - Triangle: `1 - |2(n - N/2) / N|`
   - Tukey (α=0.5): Hann taper over outer 25% each side, flat middle 50%
2. Allocate output buffer of `outputLengthSamples`
3. Compute output grain placement interval: `outputHop = sampleRate / density`
4. For each output position `outPos` (0, outputHop, 2×outputHop, ...):
   a. Select source grain index: `srcIdx = Math.round(outPos / outputLengthSamples * (grainPositions.length - 1))`, clamped to `[0, grainPositions.length - 1]`
   b. Look up source read position: `srcStart = grainPositions[srcIdx]`
   c. Extract grain from source with pitch-shifted read: read `grainSizeSamples` output samples, advancing source position by `pitch` per output sample, using linear interpolation between source samples
   d. Apply window envelope: multiply each grain sample by the LUT value (linearly interpolated to fit grain length)
   e. Add to output buffer at `outPos` (overlap-add)
5. Normalize: if peak amplitude > 1.0, scale entire output by `1.0 / peak`. This prevents clipping by default while preserving relative dynamics.
6. Return output buffer

**Note on null/silent grains:** The `grainPositions` array passed to `resynthesize()` must contain only non-null grain positions. Silent grains (filtered by threshold in the granularize step) are excluded before resynthesis. This is handled by the `GrainCollection` which stores only non-null positions.

**Known limitation:** Linear interpolation for pitch-shifted reads may produce aliasing artifacts at extreme pitch values (>2.0x). This is acceptable for the initial implementation; a future iteration could add a simple lowpass filter before downsampled reads.

#### 3. RPC Extension — `src/shared/rpc/granularize.rpc.ts`

Add new types and RPC method to the existing contract. **`BounceGrainsOptions` is defined here as the single source of truth** and re-exported from `ipc-contract.ts`:

```typescript
export interface BounceGrainsOptions {
  density?: number;       // grains/sec, default 20
  pitch?: number;         // playback rate, default 1.0 (range 0.25–4.0)
  envelope?: number;      // 0=Hann, 1=Hamming, 2=Triangle, 3=Tukey, default 0
  duration?: number;      // output duration in seconds, default = input duration
}

// New RPC method added to GranularizeRpc:
bounceGrains: {
  params: {
    sourceHash: string;
    audioData: number[];
    sampleRate: number;
    channels: number;
    duration: number;           // source duration in seconds
    grainPositions: number[];   // source sample offsets from granularize step (non-null only)
    grainSizeSamples: number;
    options: BounceGrainsOptions;
  };
  result: {
    outputData: number[];       // resynthesized PCM
    outputHash: string;         // SHA-256 of output audio bytes
    sampleRate: number;
    duration: number;           // output duration in seconds
    channels: number;           // always 1 (mono output)
    grainCount: number;         // number of grains placed
  };
};
```

#### 4. IPC Contract — `src/shared/ipc-contract.ts`

Re-export `BounceGrainsOptions` from the RPC contract and add the new handle channel:

```typescript
// Re-export from rpc contract (single source of truth)
export type { BounceGrainsOptions } from "./rpc/granularize.rpc";

// In ElectronHandleContract:
BounceGrains: {
  channel: "bounce-grains";
  request: [sourceHash: string, grainPositions: number[], grainSizeSamples: number, options?: BounceGrainsOptions];
  response: SampleRecord;
};
```

#### 5. Main Process Handler — `src/electron/ipc/sample-handlers.ts`

Add handler for `bounce-grains`:
- Resolve source audio via `audioResolver.resolveAudioData()`
- Send to worker via `granularizeClient.invoke("bounceGrains", ...)`
- Store result as derived sample: `dbManager.storeDerivedSample(outputHash, outputData, sampleRate, 1, outputDuration)`
- Return `SampleRecord`

#### 6. Preload Bridge — `src/electron/preload.ts`

Expose `bounceGrains` through `window.electron`:

```typescript
bounceGrains: (sourceHash: string, grainPositions: number[], grainSizeSamples: number, options?: BounceGrainsOptions) =>
  ipcRenderer.invoke("bounce-grains", sourceHash, grainPositions, grainSizeSamples, options),
```

#### 7. Worker Handler — `src/electron/services/granularize/index.ts`

Add `bounceGrains()` method to `GranularizeService`:
- Receive source PCM, grain positions, and bounce options
- Call `resynthesize()` for overlap-add
- Compute output hash (SHA-256 of output PCM bytes)
- Return result

#### 8. GrainCollection — `src/renderer/grain-collection.ts`

**Major changes to this class:**

a. **Add `@replType` decorator** so the registry discovers `bounce()` and `attachMethodHelpFromRegistry()` can attach help:

```typescript
@replType("GrainCollection", {
  summary: "A collection of grains extracted from a sample, ready for resynthesis.",
  instanceName: "grains",
})
export class GrainCollection extends BounceResult { ... }
```

b. **Expand constructor** with grain metadata and bounce callback:

```typescript
constructor(
  grains: Array<SampleResult | null>,
  normalize: boolean,
  sourceHash: string,
  grainPositions: number[],           // source sample offsets (non-null only)
  grainSizeSamples: number,
  bounceCallback?: (sourceHash: string, positions: number[], sizeSamples: number, options?: BounceGrainsOptions) => Promise<SampleResult>,
) {
  // ... existing display logic ...
  this.#grainPositions = grainPositions;
  this.#grainSizeSamples = grainSizeSamples;
  this.#bounceCallback = bounceCallback;
  attachMethodHelpFromRegistry(this, "GrainCollection");
}
```

c. **Add `bounce()` method** with `@describe` and `@param` decorators:

```typescript
@describe({ summary: "Resynthesize grains into a new sample via overlap-add.", returns: "SamplePromise" })
@param("options", { summary: "Bounce options: density, pitch, envelope, duration.", kind: "options" })
bounce(options?: BounceGrainsOptions): SamplePromise {
  if (!this.#bounceCallback) {
    throw new Error("bounce() is not available for this GrainCollection");
  }
  return new SamplePromise(
    this.#bounceCallback(this.#sourceHash, this.#grainPositions, this.#grainSizeSamples, options)
  );
}
```

d. **Update `filter()` to preserve grain position correspondence:**

```typescript
filter(predicate: (grain: SampleResult, index: number) => boolean): GrainCollection {
  const keptGrains: Array<SampleResult | null> = [];
  const keptPositions: number[] = [];
  let i = 0;
  for (let j = 0; j < this.#grains.length; j++) {
    const grain = this.#grains[j];
    if (grain !== null && predicate(grain, i++)) {
      keptGrains.push(grain);
      keptPositions.push(this.#grainPositions[j]);
    }
  }
  return new GrainCollection(keptGrains, this.#normalize, this.#sourceHash, keptPositions, this.#grainSizeSamples, this.#bounceCallback);
}
```

**Note on help system:** `GrainCollection` uses `attachMethodHelpFromRegistry` (for type instances), NOT `attachNamespaceMethodHelp` (which is for namespace objects like `sn`, `vis`, etc.).

#### 9. GrainCollectionPromise — `src/renderer/results/sample.ts`

Add `bounce()` proxy so chaining works:

```typescript
bounce(options?: BounceGrainsOptions): SamplePromise {
  return new SamplePromise(this.promise.then((collection) => collection.bounce(options)));
}
```

#### 10. Sample Namespace — `src/renderer/namespaces/sample-namespace.ts`

Update `grainsSample()` (renamed from `granularizeSample()`) to:
- Pass `grainStartPositions` and `grainSizeSamples` from the granularize result to the `GrainCollection` constructor
- Provide a bounce callback that calls `window.electron.bounceGrains()` and wraps the result via `bindSample()`

#### 11. Options Documentation — `src/renderer/opts-docs.ts`

Add `BounceGrainsOptions` documentation:

```typescript
/**
 * @opts BounceGrainsOptions
 * Options for granular resynthesis via bounce().
 * @usedby bounce
 * @prop {number} density Grains placed per second in output (default: 20)
 * @prop {number} pitch Playback rate multiplier 0.25–4.0 (default: 1.0)
 * @prop {number} envelope Window type: 0=Hann 1=Hamming 2=Triangle 3=Tukey (default: 0)
 * @prop {number} duration Output duration in seconds (default: input duration)
 */
```

#### 12. Tab Completion — `src/electron/completers/options-completer.ts`

Add `BounceGrainsOptions` keys to `KNOWN_OPTION_KEYS`:

```typescript
BounceGrainsOptions: [
  "density", "pitch", "envelope", "duration",
],
```

#### 13. Type Declarations

- `src/shared/repl-environment.d.ts` — Rename `granularize` to `grains`, add `bounce` to `GrainCollectionPromise` type
- `src/renderer/types.d.ts` — Add `bounceGrains` to `window.electron`

### Terminal UI Changes

No new visualizations. The method uses existing terminal feedback patterns:
- Progress message via `terminal.writeln()` during processing
- Result displayed as standard `SampleResult` (hash, duration, channels, sample rate)

### REPL Interface Contract

**Exposed methods requiring `help()`:**
- `grains.bounce.help()` — Documents parameters, defaults, ranges, and usage examples. Attached via `attachMethodHelpFromRegistry(this, "GrainCollection")` in the `GrainCollection` constructor (NOT `attachNamespaceMethodHelp` — GrainCollection is a type, not a namespace).
- `sample.grains.help()` — Updated (renamed from granularize). Already attached via existing SampleResult help infrastructure.

**Returned object terminal summary:**
- `bounce()` returns standard `SampleResult` — no new type needed
- The existing `SampleResult.toString()` displays hash, duration, channels, sample rate
- Processing feedback line printed before the result (grain count, output duration)

**Tab completion:**
- `BounceGrainsOptions` keys autocomplete inside `grains.bounce({ | })`
- `GranularizeOptions` keys autocomplete inside `sample.grains({ | })` (renamed)

#### REPL Contract Checklist

- [x] Every exposed object/namespace/function has a `help()` entry point — `grains.bounce.help()`, `sample.grains.help()`
- [x] Every returned custom REPL type defines a useful terminal summary — reuses existing `SampleResult` display
- [x] The summary highlights workflow-relevant properties — hash, duration, channels, sample rate
- [x] Unit tests identified for `help()` output — see Testing Strategy
- [x] Playwright tests identified for returned-object display behavior — see Testing Strategy

### Configuration/Build Changes

None. No new dependencies, no binding.gyp changes, no tsconfig changes.

## Testing Strategy

### Unit Tests

**`src/resynthesize.test.ts`** (new file):
- **Identity resynthesis:** grainSize=full duration, density=1, pitch=1.0 → output ≈ input (max sample deviation < 0.01)
- **Time stretching:** outputDuration = 2x input → output is 2x length
- **Pitch shifting:** pitch=2.0 → verify output samples read at double rate
- **Window envelopes:** Test all 4 window types produce valid output (no NaN, no Inf)
- **Empty input:** Zero grains → returns zero-length silent buffer
- **Single grain:** One grain position → output contains one windowed grain
- **Very high density:** density=500 → produces many overlapping grains without buffer overflow
- **Determinism:** Same inputs → identical outputs
- **Normalization:** Overlapping grains that would clip → output peak ≤ 1.0

**`src/grain-collection.test.ts`** (new or extended):
- **bounce() calls callback:** Verify `bounce()` invokes the injected callback with correct args
- **bounce() passes options:** Verify options are forwarded
- **bounce() on filtered collection:** Filter grains, then bounce — verify only kept grain positions are used
- **bounce() on empty collection:** Returns error or zero-length sample
- **bounce() without callback:** Throws descriptive error
- **filter() preserves position alignment:** After filter, grainPositions correspond 1:1 with remaining grains
- **Input validation:** pitch < 0.25 or > 4.0, negative density, duration ≤ 0 — verify rejection or clamping

**Updates to existing test files:**
- `src/ipc-contract.test.ts` — Add `BounceGrains` channel (`["BounceGrains", "bounce-grains"]`) to contract tests
- `src/bounce-api.test.ts` — Update help coverage for `grains` (renamed from `granularize`), add `bounce` help test
- `src/results-sample.test.ts` — Rename `granularize` references to `grains`, add `GrainCollectionPromise.bounce()` proxy test:
  ```
  test("GrainCollectionPromise.bounce() proxies to resolved GrainCollection.bounce()")
  ```

### E2E Tests

**`tests/workflows/granularize-effect.test.ts`** (new file):
- Load a sample → call `.grains().bounce()` with defaults → verify returns a sample with expected duration
- Call with custom options (pitch, density, duration) → verify output properties
- Chain with `.play()` → verify playable
- Verify `grains.bounce.help()` prints expected output

**Update `tests/granularize.spec.ts` and `tests/workflows/granularize.test.ts`:**
- Rename `granularize()` calls to `grains()`

### Manual Testing

- Load a real audio file, apply `grains().bounce()` with various parameter combinations
- Compare output to original — verify audible granular processing
- Test with very long files (> 1 minute) to verify memory and performance
- Test time-stretching: 5-second input → 30-second output

## Success Criteria

1. `sn.load("foo").grains().bounce()` returns a playable `SampleResult` with duration matching input
2. `sn.load("foo").grains({ grainSize: 50 }).bounce({ density: 40, pitch: 1.5, duration: 10 })` produces a 10-second output
3. All 4 window envelopes produce audible, artifact-free output
4. Result is stored in database as a derived sample
5. `grains.bounce.help()` works and documents all parameters
6. `sample.grains.help()` works (renamed from granularize)
7. Tab completion suggests all option keys for both `grains()` and `bounce()`
8. Full chaining works: `sn.load("foo").grains().bounce().play()`
9. All unit tests pass with coverage
10. Playwright workflow test passes in Docker
11. Existing `granularize` tests updated to use `grains` and still pass

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `granularize()` → `grains()` rename breaks user scripts | Breaking change | This is pre-1.0 software; document in changelog. Clean rename with no ambiguity. |
| Large file memory usage | High memory for long files | Output buffer is the only large allocation; source is already in memory. Could add streaming for files > 5 minutes in a future iteration. |
| Audio artifacts at grain boundaries | Poor audio quality | Hann window default with proper overlap-add eliminates discontinuities. Unit tests verify smooth output. |
| Aliasing at extreme pitch values | Audio quality degradation | Linear interpolation without anti-aliasing is acceptable for initial release. Document as known limitation. Future: add lowpass before downsampled reads for pitch > 2.0. |
| Worker process blocking | UI freeze during long renders | Computation runs in the granularize worker (separate process via JSON-RPC). Main process stays responsive. |
| PCM transfer overhead (worker↔main) | Slow for large files | JSON-RPC serializes as `number[]`. For typical files (< 2 minutes) this is fine. Could optimize with SharedArrayBuffer later. |
| GrainCollection constructor change breaks callers | Regression | All callers are internal (sample-namespace.ts). Single point of change. Update filter() to forward new fields. |

## Task Graph

| Issue | Title | Depends On |
|-------|-------|-----------|
| TBD-1 | Rename `granularize()` → `grains()` across all code | — |
| TBD-2 | Resynthesis engine (`resynthesize.ts`) | — |
| TBD-3 | RPC contract + worker handler for `bounceGrains` | TBD-2 |
| TBD-4 | IPC contract + main handler + preload for `bounce-grains` | TBD-3 |
| TBD-5 | `GrainCollection.bounce()` + constructor changes | TBD-4 |
| TBD-6 | `GrainCollectionPromise.bounce()` proxy | TBD-5 |
| TBD-7 | Opts docs + tab completion + type declarations for `BounceGrainsOptions` | TBD-5 |
| TBD-8 | Unit tests for resynthesis engine + bounce integration | TBD-2, TBD-5 |
| TBD-9 | Update existing granularize tests for `grains()` rename | TBD-1 |
| TBD-10 | Playwright workflow test for `grains().bounce()` | TBD-7 |

> **Note:** Beads issue IDs will be assigned when issues are created at the start of the implementation phase.

## Land the Plane Checklist

```bash
npm test                    # All unit tests must pass — fix failures before proceeding
npm run lint                # No lint errors — fix before proceeding
npm run build:electron      # TypeScript must compile cleanly
./build.sh                  # Full Dockerized Playwright suite — mandatory, no exceptions
npm run dev:electron        # Manual smoke test
```

After all checks pass:
- [ ] Update `ARCHITECTURE.md` if the process model, IPC protocol, data flows, database schema, native addon surface, or renderer architecture changed
- [ ] If REPL surface area changed: verify unit and/or Playwright tests cover `help()` and returned-object display
- [ ] Fill in `## Final Status` in IMPL.md
- [ ] Set `**Status:** Complete` at the top of IMPL.md
- [ ] Commit all spec files and implementation
- [ ] `bd close bounce-e1f`
- [ ] `bd dolt push && git push`

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements — pre-1.0, rename is acceptable
- [x] All sections agree on the data model / schema approach — reuses existing derived sample storage
- [x] REPL-facing changes define help() coverage and returned-object terminal summaries
- [x] Testing strategy names unit and Playwright coverage for REPL help/display behavior
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
