# Research: MFCC Feature Extraction

**Spec:** specs/mfcc-feature  
**Created:** 2026-03-08  
**Status:** Complete

## Problem Statement

Bounce needs an MFCC (Mel-Frequency Cepstral Coefficients) feature extractor that can analyze audio samples and return per-frame coefficient vectors. MFCCs are among the most widely-used features in audio analysis, music information retrieval, and corpus-based synthesis workflows.

## Background

MFCCs model the short-term spectral shape of audio in a way that correlates with human auditory perception. They are a standard feature for:
- Timbre similarity search across audio corpora
- Automatic classification (instruments, phonemes, sound events)
- Corpus-based resynthesis (finding similar grains/slices)

Bounce already exposes `OnsetFeature` and `OnsetSlice` as native N-API bindings. Adding MFCC follows the same architectural pattern and extends the feature extraction surface meaningfully.

## FluCoMa Algorithm Details

### Pipeline

```
Audio samples → STFT → magnitude → MelBands.processFrame → DCT.processFrame → MFCC coefficients
```

### Relevant files in `flucoma-core/`

| File | Role |
|------|------|
| `include/flucoma/algorithms/public/STFT.hpp` | FFT/windowing; `STFT::magnitude()` static helper |
| `include/flucoma/algorithms/public/MelBands.hpp` | Mel filterbank |
| `include/flucoma/algorithms/public/DCT.hpp` | Discrete Cosine Transform |
| `include/flucoma/clients/rt/MFCCClient.hpp` | Reference implementation (RT streaming; **not used directly**) |

### STFT

```cpp
class STFT {
  STFT(index windowSize, index fftSize, index hopSize, index windowType = 0, ...)
  void processFrame(const RealVectorView frame, ComplexVectorView out)
  static void magnitude(const FluidTensorView<complex<double>, 1> in, RealVectorView out)
};
```

### MelBands

```cpp
class MelBands {
  MelBands(index maxBands, index maxFFT, Allocator& alloc)
  void init(double lo, double hi, index nBands, index nBins, double sampleRate,
            index windowSize, Allocator& alloc)
  void processFrame(const RealVectorView in, RealVectorView out,
                    bool magNorm, bool usePower, bool logOutput, Allocator&)
};
```

- `nBins` = `fftSize / 2 + 1`
- Typical call: `processFrame(mags, bands, false, false, true, alloc)` (log output enabled)

### DCT

```cpp
class DCT {
  DCT(index maxInputSize, index maxOutputSize, Allocator& alloc)
  void init(index inputSize, index outputSize, Allocator& alloc)
  void processFrame(RealVectorView in, RealVectorView out)
};
```

- `inputSize` = numBands, `outputSize` = numCoeffs

### Default parameters (from MFCCClient)

| Parameter | Default | Constraints |
|-----------|---------|-------------|
| numCoeffs | 13 | 2 ≤ numCoeffs ≤ numBands |
| numBands | 40 | 2 ≤ numBands |
| minFreq | 20 Hz | ≥ 0 |
| maxFreq | 20000 Hz | > minFreq |
| windowSize | 1024 | power of 2 recommended |
| fftSize | 1024 | ≥ windowSize |
| hopSize | 512 | — |
| sampleRate | 44100 | — |

### Output shape

Per frame: a vector of `numCoeffs` doubles (e.g., 13 values by default).  
Full buffer: `numFrames × numCoeffs` — returned as a JS `Array` of `Array<number>`.

## Related Work / Prior Art

- `onset_feature.cpp` — scalar-per-frame pattern; closest structural analog
- `buf_nmf.cpp` — shows whole-buffer STFT approach, but NMF is far more complex
- `MFCCClient.hpp` — RT streaming client; shows the exact algorithm composition but uses `STFTBufferedProcess` which is designed for sample-accurate streaming, not batch processing

## Technical Constraints

- Must use N-API (`node-gyp`, `napi.h`) — same as all other native bindings
- C++17 (existing code uses structured bindings, `std::unique_ptr`, etc.)
- Must link against flucoma-core headers (header-only library)
- Eigen is used internally by MelBands/DCT — already available via flucoma-core

## Audio Processing Considerations

- Frame iteration: same hop-based loop as `onset_feature.cpp`
- STFT output: complex vector of length `fftSize / 2 + 1`
- MelBands input: magnitude vector of length `fftSize / 2 + 1`
- Memory: all intermediate tensors (`magnitude`, `bands`, `coefficients`, `spectrum`) allocated once in the constructor and reused per frame
- The `STFT` object must be re-initialized if parameters change (stateful windowing)

## Terminal UI Considerations

No immediate terminal UI changes required for the binding itself. The feature data (vectors of floats per frame) can be displayed in existing ways (e.g., `inspect`, table output). Visualization can be a follow-up.

## Cross-Platform Considerations

- FluCoMa and Eigen are cross-platform (macOS, Linux, Windows)
- N-API is cross-platform
- No platform-specific code expected in this binding

## Open Questions

1. **sampleRate parameter**: `OnsetFeature` doesn't need sampleRate; MFCC does (for MelBands `init`). Should it be required or default to 44100?  
   → **Decision**: Default to 44100, optional override via constructor options.

2. **startCoeff (drop0)**: Should we expose the 0th coefficient (energy term)?  
   → **Decision**: Default to including it (startCoeff = 0), optional via options.

3. **Return shape**: `Array<Array<number>>` (per-frame arrays) vs flat `Float64Array` with stride metadata?  
   → **Decision**: `Array<Array<number>>` for consistency with `OnsetFeature` returning `number[]`, and for ease of use in JS. Can revisit for performance later.

## Research Findings

- All three algorithms (STFT, MelBands, DCT) are header-only and available in flucoma-core
- The pipeline is straightforward: construct each algorithm once, call `init`, then loop frames
- `STFT::magnitude()` is a static helper — no instance needed for the magnitude step
- The `STFTBufferedProcess` used in `MFCCClient` is unnecessary for batch processing; direct `STFT::processFrame` + `STFT::magnitude` is cleaner
- Memory allocation via `FluidDefaultAllocator()` works the same as in `onset_feature.cpp`
- The `FluidTensor<double, 1>` type works as intermediate storage for magnitude, bands, spectrum, and coefficients

## Next Steps

- Define the exact C++ class interface and constructor options in PLAN.md
- Define the TypeScript declaration to add to `src/native.d.ts`
- Confirm `binding.gyp` needs no changes (headers already included)
- Outline implementation order and testing strategy
