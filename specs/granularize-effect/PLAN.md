# Plan: Granularize Effect (Audio Editor Workflow)

**Spec:** specs/granularize-effect  
**Beads Parent Issue:** bounce-e1f  
**Created:** 2026-04-26  
**Status:** In Progress

## Context

Bounce has two existing granular features — grain extraction (`sample.granularize()`) and real-time granular instrument (`inst.granular()`). Neither provides the simple audio-editor workflow of "process this sample, get a new sample back." The research phase confirmed that overlap-add resynthesis in TypeScript is the right approach, reusing the existing grain computation infrastructure and adding a new resynthesis engine.

## Approach Summary

Add `sn.granularizeEffect()` as a new sample processing method that:

1. Resolves the source sample to PCM data (existing infrastructure)
2. Computes grain read positions in the source (reuse `computeGrains()` logic)
3. Resynthesizes grains into a single output buffer via overlap-add with window envelopes, optional pitch shifting, and configurable output duration
4. Stores the result as a derived sample in the database
5. Returns a `SampleResult` that can be played, chained, and further analyzed

The resynthesis engine is implemented in TypeScript as a pure function. Computation runs in the existing granularize worker process via JSON-RPC to avoid blocking the main process.

## Architecture Changes

No new processes or major architectural changes. The feature extends the existing granularize worker with a new RPC method and adds a REPL method that follows established patterns.

```
[REPL]  sn.granularizeEffect(sample, opts)
  ↓ (IPC: granularize-effect)
[Main Process]  resolveAudioData(hash) → PCM
  ↓ (JSON-RPC: granularize/effect)
[Worker]  computeGrainPositions() + overlapAddResynthesize()
  ↓ returns Float32Array
[Main Process]  storeDerivedSample(hash, pcm) → SampleRecord
  ↓ (IPC response)
[REPL]  SampleResult (playable, chainable)
```

## Changes Required

### Native C++ Changes

None. The resynthesis engine is pure TypeScript math on `Float32Array`.

### TypeScript Changes

#### 1. Resynthesis Engine — `src/electron/services/granularize/resynthesize.ts` (new file)

Pure function implementing overlap-add granular resynthesis:

```typescript
export interface ResynthesisParams {
  audioData: Float32Array;
  sampleRate: number;
  grainPositions: number[];       // source sample offsets (from computeGrains)
  grainSizeSamples: number;
  outputLengthSamples: number;
  pitch: number;                  // playback rate (1.0 = original)
  envelope: number;               // 0=Hann, 1=Hamming, 2=Triangle, 3=Tukey
  density: number;                // grains per second in output
}

export function resynthesize(params: ResynthesisParams): Float32Array;
```

**Algorithm:**
1. Pre-compute window LUT (1024 samples) for selected envelope type
2. Allocate output buffer of `outputLengthSamples`
3. Compute output grain placement interval: `outputHop = sampleRate / density`
4. For each output position (0, outputHop, 2*outputHop, ...):
   a. Select source grain: map output position linearly into the `grainPositions` array
   b. Extract grain from source with pitch-shifted read (linear interpolation)
   c. Apply window envelope
   d. Add to output buffer at current output position (overlap-add)
5. Return output buffer (no normalization by default — user can normalize after)

#### 2. RPC Extension — `src/shared/rpc/granularize.rpc.ts`

Add new RPC method to the existing contract:

```typescript
export interface GranularizeEffectOptions {
  grainSize?: number;     // ms, default 50
  density?: number;       // grains/sec, default 20
  pitch?: number;         // playback rate, default 1.0 (range 0.25–4.0)
  scatter?: number;       // position randomization 0–1, default 0
  envelope?: number;      // 0=Hann, 1=Hamming, 2=Triangle, 3=Tukey, default 0
  duration?: number;      // output duration in seconds, default = input duration
}

// New RPC method added to GranularizeRpc:
granularizeEffect: {
  params: {
    sourceHash: string;
    audioData: number[];
    sampleRate: number;
    channels: number;
    duration: number;
    options: GranularizeEffectOptions;
  };
  result: {
    outputData: number[];       // resynthesized PCM
    outputHash: string;         // SHA-256 of output audio
    sampleRate: number;
    duration: number;           // output duration in seconds
    channels: number;           // always 1 (mono output)
    grainCount: number;         // number of grains placed
  };
};
```

#### 3. IPC Contract — `src/shared/ipc-contract.ts`

Add the `GranularizeEffectOptions` interface and new handle channel:

```typescript
export interface GranularizeEffectOptions {
  grainSize?: number;
  density?: number;
  pitch?: number;
  scatter?: number;
  envelope?: number;
  duration?: number;
}

// In ElectronHandleContract:
GranularizeEffect: {
  channel: "granularize-effect";
  request: [sourceHash: string, options?: GranularizeEffectOptions];
  response: SampleRecord;
};
```

#### 4. Main Process Handler — `src/electron/ipc/sample-handlers.ts`

Add handler for `granularize-effect`:
- Resolve source audio via `audioResolver.resolveAudioData()`
- Send to worker via `granularizeClient.invoke("granularizeEffect", ...)`
- Store result as derived sample: `dbManager.storeDerivedSample(outputHash, outputData, sampleRate, 1, outputDuration)`
- Return `SampleRecord`

#### 5. Preload Bridge — `src/electron/preload.ts`

Expose `granularizeEffect` through `window.electron`:

```typescript
granularizeEffect: (sourceHash: string, options?: GranularizeEffectOptions) =>
  ipcRenderer.invoke("granularize-effect", sourceHash, options),
```

#### 6. Worker Handler — `src/electron/services/granularize/index.ts`

Add `granularizeEffect()` method to `GranularizeService`:
- Compute grain positions (reuse existing logic or simplified version)
- Call `resynthesize()` for overlap-add
- Compute output hash
- Return result

#### 7. Sample Namespace — `src/renderer/namespaces/sample-namespace.ts`

Add `granularizeEffect()` method following the existing overloaded pattern:

```typescript
private async granularizeEffectSample(
  source?: string | SampleResult | PromiseLike<SampleResult> | GranularizeEffectOptions,
  options?: GranularizeEffectOptions,
): Promise<SampleResult>
```

Wire into `bindSample()` result methods:
```typescript
granularizeEffect: (options) => this.granularizeEffectSample(bound, options),
```

#### 8. Options Documentation — `src/renderer/opts-docs.ts`

Add `GranularizeEffectOptions` documentation:

```typescript
/**
 * @opts GranularizeEffectOptions
 * Options for granular resynthesis effect.
 * @usedby granularizeEffect
 * @prop {number} grainSize Grain duration in milliseconds (default: 50)
 * @prop {number} density Grains placed per second in output (default: 20)
 * @prop {number} pitch Playback rate multiplier 0.25–4.0 (default: 1.0)
 * @prop {number} scatter Source position randomization 0–1 (default: 0)
 * @prop {number} envelope Window type: 0=Hann 1=Hamming 2=Triangle 3=Tukey (default: 0)
 * @prop {number} duration Output duration in seconds (default: input duration)
 */
```

#### 9. Tab Completion — `src/electron/completers/options-completer.ts`

Add `GranularizeEffectOptions` keys to `KNOWN_OPTION_KEYS`:

```typescript
GranularizeEffectOptions: [
  "grainSize", "density", "pitch", "scatter", "envelope", "duration",
],
```

#### 10. Type Declarations — `src/shared/repl-environment.d.ts`

Add `granularizeEffect` to the `SampleResult` method signatures:

```typescript
granularizeEffect(options?: GranularizeEffectOptions): SamplePromise;
```

#### 11. Renderer Type Declarations — `src/renderer/types.d.ts`

Add `granularizeEffect` to `window.electron`:

```typescript
granularizeEffect: (sourceHash: string, options?: GranularizeEffectOptions) => Promise<SampleRecord>;
```

### Terminal UI Changes

No new visualizations. The method uses existing terminal feedback patterns:
- Progress message via `terminal.writeln()` during processing
- Result displayed as standard `SampleResult` (hash, duration, channels, sample rate)

### REPL Interface Contract

**Exposed methods requiring `help()`:**
- `sn.granularizeEffect.help()` — Documents parameters, defaults, ranges, and usage examples
- `sample.granularizeEffect.help()` — Same documentation, accessed from a bound sample

**Returned object terminal summary:**
- Returns standard `SampleResult` — no new type needed
- The existing `SampleResult.toString()` displays hash, duration, channels, sample rate
- Processing feedback line printed before the result (grain count, output duration)

**Tab completion:**
- `GranularizeEffectOptions` keys autocomplete inside `sn.granularizeEffect({ | })`

#### REPL Contract Checklist

- [x] Every exposed object/namespace/function has a `help()` entry point — `granularizeEffect.help()` on both `sn` and bound samples
- [x] Every returned custom REPL type defines a useful terminal summary — reuses existing `SampleResult` display
- [x] The summary highlights workflow-relevant properties — hash, duration, channels, sample rate
- [x] Unit tests identified for `help()` output — see Testing Strategy
- [x] Playwright tests identified for returned-object display behavior — see Testing Strategy

### Configuration/Build Changes

None. No new dependencies, no binding.gyp changes, no tsconfig changes.

## Testing Strategy

### Unit Tests

**`src/resynthesize.test.ts`** (new file):
- **Identity resynthesis:** grainSize=full duration, density=1, pitch=1.0 → output ≈ input (within windowing tolerance)
- **Time stretching:** outputDuration = 2x input → output is 2x length
- **Pitch shifting:** pitch=2.0 → verify output samples read at double rate
- **Window envelopes:** Test all 4 window types produce valid output (no NaN, no Inf)
- **Empty/edge cases:** Zero-length input, very small grain size, very high density
- **Determinism:** Same inputs → identical outputs (no random state unless scatter > 0)

**`src/granularize-effect.test.ts`** (new file):
- **Full pipeline test:** Source PCM → computeGrains → resynthesize → verify output hash and dimensions
- **Options defaults:** Verify all defaults are applied correctly
- **Parameter validation:** Out-of-range values clamped or rejected

**Updates to existing test files:**
- `src/ipc-contract.test.ts` — Add `GranularizeEffect` channel to contract tests
- `src/bounce-api.test.ts` — Add `granularizeEffect` to help coverage

### E2E Tests

**`tests/workflows/granularize-effect.test.ts`** (new file):
- Load a sample → call `sn.granularizeEffect()` with defaults → verify returns a sample with expected duration
- Call with custom options (pitch, density, duration) → verify output properties
- Chain with `.play()` → verify playable
- Verify `sn.granularizeEffect.help()` prints expected output

### Manual Testing

- Load a real audio file, apply granularize effect with various parameter combinations
- Compare output to original — verify audible granular processing
- Test with very long files (> 1 minute) to verify memory and performance
- Test time-stretching: 5-second input → 30-second output

## Success Criteria

1. `sn.granularizeEffect(sample, { grainSize: 50, density: 20 })` returns a playable `SampleResult`
2. Output duration matches input by default; overridden when `duration` is specified
3. All 4 window envelopes produce audible, artifact-free output
4. Pitch parameter works: `pitch: 2.0` produces audibly higher-pitched output
5. Result is stored in database as a derived sample
6. `help()` works on both `sn.granularizeEffect` and `sample.granularizeEffect`
7. Tab completion suggests all option keys
8. All unit tests pass with coverage
9. Playwright workflow test passes in Docker

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Large file memory usage | High memory for long files | Output buffer is the only large allocation; source is already in memory. Could add streaming for files > 5 minutes in a future iteration. |
| Audio artifacts at grain boundaries | Poor audio quality | Hann window default with proper overlap-add eliminates discontinuities. Unit tests verify smooth output. |
| Worker process blocking | UI freeze during long renders | Computation runs in the granularize worker (separate process via JSON-RPC). Main process stays responsive. |
| PCM transfer overhead (worker↔main) | Slow for large files | JSON-RPC serializes as `number[]`. For typical files (< 2 minutes) this is fine. Could optimize with SharedArrayBuffer later. |
| Name collision with existing `granularize()` | User confusion | Distinct name `granularizeEffect()` clearly communicates "returns a processed sample." |

## Task Graph

| Issue | Title | Depends On |
|-------|-------|-----------|
| bounce-e1g | Resynthesis engine (resynthesize.ts) | — |
| bounce-e1h | RPC contract + worker handler | bounce-e1g |
| bounce-e1i | IPC contract + main handler + preload | bounce-e1h |
| bounce-e1j | Sample namespace REPL integration | bounce-e1i |
| bounce-e1k | Opts docs + tab completion + type declarations | bounce-e1j |
| bounce-e1l | Unit tests | bounce-e1g |
| bounce-e1m | Playwright workflow test | bounce-e1k |

> **Note:** Task graph issues will be created in beads during the implementation phase after spec review.

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

- [x] All sections agree on backwards compatibility requirements — no breaking changes, purely additive
- [x] All sections agree on the data model / schema approach — reuses existing derived sample storage
- [x] REPL-facing changes define help() coverage and returned-object terminal summaries
- [x] Testing strategy names unit and Playwright coverage for REPL help/display behavior
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
