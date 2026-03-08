# Plan: MFCC Feature Extraction

**Spec:** specs/mfcc-feature  
**Created:** 2026-03-08  
**Status:** In Progress

## Context

See `RESEARCH.md` for full details. Summary:
- MFCC pipeline: `STFT::processFrame` → `STFT::magnitude` (static) → `MelBands::processFrame` → `DCT::processFrame`
- All algorithms are header-only in `flucoma-core/include`
- Pattern follows `onset_feature.cpp` (frame loop, N-API ObjectWrap, constructor options)
- Key difference from `OnsetFeature`: output is a **vector per frame**, not a scalar

## Approach Summary

Create a new N-API binding class `MFCCFeature` in `native/src/mfcc_feature.cpp` that:
1. Accepts constructor options (numCoeffs, numBands, minFreq, maxFreq, windowSize, fftSize, hopSize, sampleRate)
2. Constructs and initializes STFT, MelBands, and DCT algorithm objects
3. Exposes a `process(Float32Array | Float64Array)` method that iterates frames and returns `Array<Array<number>>`
4. Exposes a `reset()` method that re-initializes internal state

Register it in `addon.cpp` and add TypeScript declarations to `src/native.d.ts`.

## Architecture Changes

No new components. Fits directly into the existing native binding pattern:
- One new `.cpp` file
- One forward declaration + `Init` call in `addon.cpp`
- One new source entry in `binding.gyp`
- New interface + class in `src/native.d.ts`

## Changes Required

### Native C++ Changes

**New file: `native/src/mfcc_feature.cpp`**

```cpp
#include <napi.h>
#include "../../flucoma-core/include/flucoma/algorithms/public/STFT.hpp"
#include "../../flucoma-core/include/flucoma/algorithms/public/MelBands.hpp"
#include "../../flucoma-core/include/flucoma/algorithms/public/DCT.hpp"
#include "../../flucoma-core/include/flucoma/data/FluidMemory.hpp"
#include "../../flucoma-core/include/flucoma/data/TensorTypes.hpp"

class MFCCFeature : public Napi::ObjectWrap<MFCCFeature> {
  // Constructor options:
  int mNumCoeffs{13};
  int mNumBands{40};
  double mMinFreq{20.0};
  double mMaxFreq{20000.0};
  int mWindowSize{1024};
  int mFFTSize{1024};
  int mHopSize{512};
  double mSampleRate{44100.0};

  // Algorithm objects:
  std::unique_ptr<fluid::algorithm::STFT> mSTFT;
  std::unique_ptr<fluid::algorithm::MelBands> mMelBands;
  std::unique_ptr<fluid::algorithm::DCT> mDCT;

  // Per-frame reusable tensors:
  fluid::FluidTensor<double, 1> mFrame;       // windowSize
  fluid::FluidTensor<std::complex<double>, 1> mSpectrum;  // fftSize/2+1
  fluid::FluidTensor<double, 1> mMagnitude;   // fftSize/2+1
  fluid::FluidTensor<double, 1> mBands;       // numBands
  fluid::FluidTensor<double, 1> mCoefficients; // numCoeffs
};
```

**Initialization order:**
1. `mSTFT = make_unique<STFT>(windowSize, fftSize, hopSize)`
2. `mMelBands = make_unique<MelBands>(numBands, fftSize, allocator)`
3. `mMelBands->init(minFreq, maxFreq, numBands, nBins, sampleRate, windowSize, allocator)`  
   where `nBins = fftSize / 2 + 1`
4. `mDCT = make_unique<DCT>(numBands, numCoeffs, allocator)`
5. `mDCT->init(numBands, numCoeffs, allocator)`

**Process loop per frame:**
```cpp
mSTFT->processFrame(frameView, spectrumView);
STFT::magnitude(spectrumView, magnitudeView);
mMelBands->processFrame(magnitudeView, bandsView, false, false, true, allocator);
mDCT->processFrame(bandsView, coeffsView);
// Copy coeffsView → JS array row
```

**Modified: `native/src/addon.cpp`**
- Add `Napi::Object InitMFCCFeature(Napi::Env env, Napi::Object exports);` declaration
- Add `InitMFCCFeature(env, exports);` call in `Init()`

**Modified: `binding.gyp`**
- Add `"native/src/mfcc_feature.cpp"` to `"sources"`

### TypeScript Changes

**Modified: `src/native.d.ts`**

Add:

```typescript
export interface MFCCFeatureOptions {
  /** Number of cepstral coefficients. Default: 13 */
  numCoeffs?: number;
  /** Number of Mel bands. Default: 40 */
  numBands?: number;
  /** Low frequency bound in Hz. Default: 20 */
  minFreq?: number;
  /** High frequency bound in Hz. Default: 20000 */
  maxFreq?: number;
  /** Analysis window size in samples. Default: 1024 */
  windowSize?: number;
  /** FFT size in samples. Default: 1024 */
  fftSize?: number;
  /** Hop size in samples. Default: 512 */
  hopSize?: number;
  /** Sample rate in Hz. Default: 44100 */
  sampleRate?: number;
}

export class MFCCFeature {
  constructor(options?: MFCCFeatureOptions);
  /** Process audio buffer; returns one array of numCoeffs values per frame */
  process(audioBuffer: Float32Array | Float64Array): number[][];
  reset(): void;
}
```

### Terminal UI Changes

None required for this feature.

### Configuration/Build Changes

`binding.gyp`: add `"native/src/mfcc_feature.cpp"` to `sources`. No new include paths or libraries needed.

## Testing Strategy

### Unit Tests

Add a test in `tests/` (following existing test file conventions):
- Construct `MFCCFeature` with defaults
- Pass a known audio buffer (e.g., 4096-sample sine wave at 440 Hz)
- Verify output shape: `numFrames × numCoeffs` (e.g., for 4096 samples, windowSize=1024, hopSize=512 → 7 frames × 13 coefficients)
- Verify values are finite numbers (not NaN/Inf)
- Test with Float32Array and Float64Array inputs
- Test edge case: buffer smaller than windowSize should throw

### E2E Tests

Not required for a pure native binding. The terminal UI doesn't change.

### Manual Testing

- Load a real audio file via existing wav-decode tooling in the app
- Call `MFCCFeature.process()` on the samples
- Inspect output in the REPL — verify reasonable MFCC values

## Success Criteria

1. `npm run rebuild` completes without errors
2. `new MFCCFeature().process(buffer)` returns an `Array` of `Array<number>` with the expected shape
3. Values are finite floats (no NaN/Inf)
4. TypeScript types are correct and exported
5. All new unit tests pass

## Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| STFT complex type mismatch (`complex<double>` vs `ComplexVectorView`) | Use `FluidTensorView` wrappers; check STFT.hpp exact signature |
| MelBands init requires `nBins` not `fftSize` | Compute `nBins = fftSize / 2 + 1` in constructor |
| DCT `processFrame` modifies bands in-place? | Check DCT.hpp; use separate input/output tensors |
| Memory corruption from reusing tensors | Allocate all tensors in constructor at max size; never resize during processing |
| `numCoeffs > numBands` — invalid | Validate in constructor, throw JS TypeError |
| `fftSize < windowSize` — invalid | Validate in constructor |

## Implementation Order

1. Write `native/src/mfcc_feature.cpp` with `MFCCFeature` class
2. Update `addon.cpp` (add declaration + call)
3. Update `binding.gyp` (add source)
4. Run `npm run rebuild` — fix any compile errors
5. Update `src/native.d.ts` (add TypeScript types)
6. Write unit tests
7. Run tests: `npm test`
8. Manual REPL test with a real audio file

## Estimated Scope

**Medium** — ~200–300 lines of C++, ~30 lines TypeScript, ~50 lines tests.

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements (additive only)
- [x] All sections agree on the data model (Array<Array<number>> return type)
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
