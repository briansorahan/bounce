# Implementation: Slice-to-Sampler Auto-Mapping

**Spec:** specs/slice-to-sampler  
**Created:** 2026-03-26  
**Status:** In Progress

## Context

Three new FluCoMa slicing algorithms (AmpSlice, NoveltySlice, TransientSlice) added alongside a clean rename of `OnsetFeature`→`SliceFeature` and `onsets()`→`onsetSlice()`. A new `toSampler()` method on `SliceFeature` auto-maps slices to MIDI notes on a sampler instrument. All four slice methods share the same result type and `toSampler()` convenience.

## Implementation Log

### 2026-03-26 - C++ native bindings

- `native/src/amp_slice.cpp` — wraps `EnvelopeSegmentation`, sample-by-sample, `highPassFreq` normalized by sample rate
- `native/src/novelty_slice.cpp` — wraps `NoveltySegmentation` + `STFT`, hop-frame loop; `kernelSize` forced odd
- `native/src/transient_slice.cpp` — wraps `TransientSegmentation`, block-based; `skew` via `pow(2, skew)`, `windowSize` halved
- `native/src/addon.cpp` updated; `binding.gyp` updated; `npm run rebuild` succeeded

### 2026-03-26 - TypeScript implementation

- `src/index.ts` + `src/native.d.ts`: `AmpSlice`, `NoveltySlice`, `TransientSlice` wrapper classes
- `src/shared/ipc-contract.ts`: `AmpSliceOptions`, `NoveltySliceOptions`, `TransientSliceOptions`; 3 new IPC channels; `ElectronAPI` methods
- `src/electron/ipc/analysis-handlers.ts`: 3 new handlers using string literals
- `src/electron/preload.ts`: 3 new `ipcRenderer.invoke` calls
- `src/renderer/results/features.ts`: `OnsetFeature`→`SliceFeature`, `OnsetFeaturePromise`→`SliceFeaturePromise`; `toSampler()` method + `ToSamplerOptions`
- `src/renderer/namespaces/sample-namespace.ts`: `bindSliceFeature` (renamed); `ampSlice`, `noveltySlice`, `transientSlice` analysis functions; `toSamplerBinding` closure
- All other renderer files: clean rename of `OnsetFeature`→`SliceFeature`, `onsets()`→`onsetSlice()`
- Unit tests: `src/amp-slice.test.ts`, `src/novelty-slice.test.ts`, `src/transient-slice.test.ts` — all 6 pass
- Playwright test `tests/onset-analysis.spec.ts` updated for rename

## Decisions Made

- **`"onset-slice"` DB feature type string NOT renamed** — preserves existing database records
- **`toSampler` reuses existing `create-slice-samples` IPC** — `createSliceSamples` already returns `{hash,index}[]`, so no new `get-slice-samples` channel was needed (plan was simplified)
- **`OnsetFeature` native wrapper in `src/index.ts` NOT renamed** — it's the raw feature analyzer, distinct from the slice result class

## Deviations from Plan

- No `get-slice-samples` IPC channel needed — existing `createSliceSamples` already returns hashes. Simpler.

## Flaws Discovered in Previous Phases

- PLAN.md proposed a new `get-slice-samples` IPC channel; this was unnecessary. Documented above.

## Issues & TODOs

- Playwright e2e tests for the new methods (slice-to-sampler.spec.ts, amp-slice.spec.ts, etc.) pending `./build.sh`

## Testing Results

- `npm run lint` — ✅ passes
- `npm run build:electron` — ✅ passes  
- Unit tests (6 native binding tests) — ✅ all pass
- `./build.sh` — pending

## Status Updates

### Last Status: 2026-03-26

**What's Done:**
- C++ bindings compiled and verified
- All TypeScript implementation complete
- Lint and build passing
- Native binding unit tests passing

**What's Left:**
- `./build.sh` full Playwright suite

**Next Steps:**
- Run `./build.sh`

**Blockers/Notes:**
- None

---

## Final Status

**Completion Date:** pending `./build.sh`

**Summary:**

**Verification:**
- [x] Linting passed (`npm run lint`)
- [x] TypeScript builds (`npm run build:electron`)
- [ ] `./build.sh` passes (full Dockerized Playwright suite — mandatory for every spec)
- [ ] Manual testing complete
- [x] REPL help() coverage verified by unit and/or Playwright tests (if applicable)
- [ ] REPL returned-object terminal summaries verified by unit and/or Playwright tests (if applicable)

**Known Limitations:**

**Future Improvements:**
