# Plan: Concatenative Synthesis

**Spec:** specs/concat-synth  
**Created:** 2026-03-08  
**Status:** In Progress

## Context

Bounce has audio slicing (OnsetSlice) and MFCC feature extraction but no corpus matching or resynthesis. This plan delivers a full end-to-end concatenative synthesis pipeline: slice a corpus → extract MFCCs + SpectralShape descriptors → normalize → build a stateful KDTree → query nearest neighbors for a target segment → concatenate matched grains → play back via the existing AudioManager (Web Audio API).

All open questions from RESEARCH.md are resolved:
- **Resynthesis in scope** — full pipeline including audio playback
- **KDTree is stateful** — built once, queried many times, persisted in main process memory
- **Feature vector** — MFCCs (13) + SpectralShape (7) = 20-dimensional vectors
- **Audio output** — wire into existing `AudioManager.playAudio()`

## Approach Summary

Three new native bindings + one new manager class + new IPC + new REPL globals:

1. **`SpectralShape` binding** — wraps `SpectralShape.hpp`, extracts 7 spectral descriptors per frame, averaged over the segment → appended to MFCCs to form a 20-dim feature vector.
2. **`Normalization` binding** — wraps `Normalization.hpp`, fits a scaler on the corpus feature matrix and transforms features in-place.
3. **`KDTree` binding** — wraps `KDTree.hpp`, stateful insert + nearest-neighbor query.
4. **`CorpusManager`** (TypeScript, main process) — holds the in-memory corpus: segment audio buffers, raw feature vectors, normalized features, and the KDTree instance. Stateful across IPC calls.
5. **New IPC handlers** — `analyze-spectral-shape`, `corpus-build`, `corpus-query`, `corpus-resynthesize`.
6. **New preload bridge methods** — expose the four new IPC channels on `window.electron`.
7. **New REPL globals** — `corpus` object with `build()`, `query()`, `resynthesize()`.
8. **Resynthesis** — simple concatenation of matched segment `Float32Array` buffers, crossfaded with a short Hann window, passed to `audioManager.playAudio()`.

## Architecture Changes

```
REPL
  └─ corpus.build(source?) ──► IPC: corpus-build ──► CorpusManager.build()
                                                        ├─ getDerivedSamples (existing)
                                                        ├─ analyzeMFCC (existing native)
                                                        ├─ analyzeSpectralShape (new native)
                                                        ├─ Normalization.fit+transform (new native)
                                                        └─ KDTree.addPoints (new native)

  └─ corpus.query(index) ───► IPC: corpus-query ───► CorpusManager.query()
                                                        ├─ extract features for target segment
                                                        └─ KDTree.kNearest → segment indices

  └─ corpus.resynthesize() ► IPC: corpus-resynth ──► CorpusManager.resynthesize()
                                                        └─ Float32Array → renderer

renderer receives Float32Array → audioManager.playAudio()
```

`CorpusManager` lives in `src/electron/corpus-manager.ts` and is instantiated in `main.ts`, alongside the existing `DatabaseManager`.

## Changes Required

### Native C++ Changes

**New files:**

| File | Class | Exposes |
|------|-------|---------|
| `native/src/spectral_shape.cpp` | `SpectralShape` | `process(audioData: Float32Array): number[]` — internally runs STFT → magnitude → SpectralShape per frame, then averages to return a 7-element vector: **[centroid, spread(√), skewness, kurtosis, rolloff, flatness(dB), crest(dB)]**. Accepts same options as `MFCCFeature` (windowSize, fftSize, hopSize, sampleRate, minFreq, maxFreq, rolloffTarget, logFreq, usePower). |
| `native/src/normalization.cpp` | `Normalization` | `fit(data: number[][], min?: number, max?: number): void` — calls `fluid::algorithm::Normalization::init(min, max, matrix)`; `transform(data: number[][]): number[][]` — calls `process()`; `transformFrame(frame: number[]): number[]` — calls `processFrame()`; `clear(): void`. Target range defaults to [0, 1]. |
| `native/src/kdtree.cpp` | `KDTree` | `addPoint(id: string, point: number[]): void` — wraps `addNode(id, data)`; `kNearest(point: number[], k: number, radius?: number): Array<{id: string, distance: number}>` — wraps `kNearest()` and zips string IDs with distances; `size(): number`; `clear(): void`. String IDs allow CorpusManager to use `"0"`, `"1"`, … and convert back to integer indices. |

**Modified files:**

- `native/src/addon.cpp` — add `InitSpectralShape`, `InitNormalization`, `InitKDTree` exports
- `binding.gyp` — add three new source files to `sources` array

### TypeScript Changes

**New files:**

| File | Purpose |
|------|---------|
| `src/spectral-shape.ts` | TypeScript wrapper for `SpectralShape` native binding; typed options interface (windowSize, fftSize, hopSize, sampleRate, minFreq, maxFreq, rolloffTarget, logFreq, usePower); result type `SpectralShapeResult` with named fields for all 7 descriptors |
| `src/normalization.ts` | TypeScript wrapper for `Normalization` native binding; `fit(data, min?, max?)`, `transform(data)`, `transformFrame(frame)`, `clear()` |
| `src/kdtree.ts` | TypeScript wrapper for `KDTree` native binding; `addPoint(id, point)`, `kNearest(point, k, radius?)` → `KNNResult[]` where `KNNResult = {id: string, distance: number}`, `size()`, `clear()` |
| `src/electron/corpus-manager.ts` | Stateful `CorpusManager` class (main process); holds segment buffers, raw feature matrix, normalized feature matrix, and `KDTree` instance. Uses string IDs (`"0"`, `"1"`, …) and converts back to integer indices on query results. |

**Modified files:**

| File | Change |
|------|--------|
| `src/index.ts` | Export `SpectralShape`, `Normalization`, `KDTree` |
| `src/electron/main.ts` | Instantiate `CorpusManager`; add 4 new `ipcMain.handle` handlers: `analyze-spectral-shape`, `corpus-build`, `corpus-query`, `corpus-resynthesize` |
| `src/electron/preload.ts` | Expose 4 new methods on `window.electron`: `analyzeSpectralShape`, `corpusBuild`, `corpusQuery`, `corpusResynthesize` |
| `src/renderer/bounce-api.ts` | Add `corpus` global object with `build()`, `query(index, k?)`, `resynthesize(queryResult)` methods |
| `src/renderer/repl-evaluator.ts` | Add `"corpus"` to `BOUNCE_GLOBALS` set |

### Terminal UI Changes

- `corpus.build()` prints progress lines: segment count, feature extraction status, normalization done, KDTree built — e.g. `Built corpus: 47 segments, 20-dim features, KDTree ready`
- `corpus.query(index, k?)` prints a ranked table of matching segment indices + distances
- `corpus.resynthesize(result)` prints: `Resynthesizing N segments…` then plays audio

### Configuration/Build Changes

- `binding.gyp` — add `native/src/spectral_shape.cpp`, `native/src/normalization.cpp`, `native/src/kdtree.cpp` to sources
- No `package.json` dependency changes (all new code uses FluCoMa core headers already present)

## Testing Strategy

### Unit Tests

- `src/spectral-shape.test.ts` — SpectralShape on a known sine wave; verify 7 output values are finite and in expected ranges
- `src/normalization.test.ts` — fit + transform on a small matrix; verify mean ≈ 0, std ≈ 1 after normalization
- `src/kdtree.test.ts` — insert points, query nearest neighbor; verify correct index returned for exact match and closest-point query
- `src/corpus-manager.test.ts` — end-to-end: build corpus from mock segment data, query, check indices returned

### E2E Tests

- Playwright test: load a sample, run `corpus.build()` in REPL, verify terminal output contains `"Built corpus"` and segment count > 0
- Playwright test: run `corpus.query(0)`, verify terminal output shows ranked results
- Playwright test: run `corpus.resynthesize(...)`, verify no error and audio plays (check `audioManager.getIsPlaying()`)

### Manual Testing

- Load a real drum loop, slice it, run full `corpus.build()` → `corpus.query(0)` → `corpus.resynthesize()` pipeline end-to-end
- Verify resynthesized audio is audible and plausibly matches corpus segments
- Verify KDTree persists across multiple `corpus.query()` calls without rebuild

## Success Criteria

1. `corpus.build()` successfully processes a real audio file's slices through feature extraction, normalization, and KDTree insertion
2. `corpus.query(index, k)` returns `k` nearest segment indices with distances
3. `corpus.resynthesize(queryResult)` concatenates matched segments and plays back via `AudioManager`
4. All new unit tests pass (`npm test`)
5. E2E tests pass (`npm run test:e2e`)
6. `npm run lint` passes
7. `npm run rebuild` succeeds with three new native bindings

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| `SpectralShape` binding must do STFT internally (takes magnitude spectrum, not raw audio) | Binding follows same pattern as `MFCCFeature`: STFT → magnitude → processFrame per frame, average results |
| `Normalization::init` combines fit+range-setting in one call; no separate fit/transform | Binding exposes `fit(data, min=0, max=1)` which calls `init(min, max, matrix)`; `transform` calls `process()` |
| `KDTree::addNode` takes string IDs; `kNearest` returns string IDs, not integer indices | Binding uses `"0"`, `"1"`, … string IDs; CorpusManager converts back to integers on query results |
| `SpectralShape` descriptors are: centroid, spread(√), skewness, **kurtosis**, rolloff, flatness(dB), crest(dB) — not "flux" | Documented correctly in binding; TS wrapper uses named fields to avoid confusion |
| Resynthesis crossfade introduces audio artifacts | Start with zero-crossfade (hard concatenation); add Hann window crossfade in a follow-on |
| KDTree state is lost on app restart | Acceptable for v1; corpus rebuild is fast. Persistence can be a follow-on |
| Large corpora (1000+ segments) slow to build | Feature extraction is the bottleneck; can add progress callbacks later |

## Implementation Order

1. **`SpectralShape` native binding** — cpp (STFT→magnitude→SpectralShape per frame, averaged) + TS wrapper + unit test
2. **`Normalization` native binding** — cpp (`fit`→`init`, `transform`→`process`, `transformFrame`→`processFrame`, `clear`) + TS wrapper + unit test
3. **`KDTree` native binding** — cpp (`addPoint(id, data)`, `kNearest`→zipped `{id, distance}[]`, `clear`) + TS wrapper + unit test
4. **`CorpusManager`** — TypeScript class using all three new bindings + MFCCFeature (existing); integer↔string ID mapping
5. **IPC handlers** — `corpus-build`, `corpus-query`, `corpus-resynthesize` in main.ts + preload.ts
6. **REPL globals** — `corpus` object in bounce-api.ts + register in repl-evaluator.ts
7. **Resynthesis wiring** — renderer receives Float32Array from IPC and calls `audioManager.playAudio()`
8. **Tests** — unit tests for each new native binding + CorpusManager + E2E tests
9. **Lint + build validation** — `npm run lint && npm run rebuild && npm test`

## Estimated Scope

**Large** — 3 new native C++ bindings, 1 new manager class, 4 new IPC channels, new REPL globals, and full test coverage.

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements
- [x] All sections agree on the data model / schema approach
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
