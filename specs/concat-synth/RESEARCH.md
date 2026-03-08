# Research: Concatenative Synthesis

**Spec:** specs/concat-synth  
**Created:** 2026-03-08  
**Status:** In Progress

## Problem Statement

Bounce currently has audio analysis capabilities (onset detection, slicing, MFCCs) but no end-to-end concatenative synthesis workflow. Users cannot yet search a corpus of audio segments by timbral or spectral similarity and resynthesize a target using matched grains. This is the core use case for sound designers using FluCoMa.

## Background

Concatenative synthesis works by:
1. **Corpus analysis** — slicing a source audio collection into segments and extracting descriptor features per segment
2. **Target matching** — for each frame of a target signal (or descriptor-driven score), finding the nearest-matching corpus segment via nearest-neighbor search in feature space
3. **Resynthesis** — concatenating (with crossfading/windowing) matched segments to produce output audio

This is the primary workflow FluCoMa was designed to support. Bounce already has the slicing primitives (OnsetSlice) and one descriptor (MFCCFeature), but lacks the feature search infrastructure and additional descriptors needed to make corpus matching practical.

## Related Work / Prior Art

- **FluCoMa** (Max/MSP, SuperCollider, Pure Data) — primary reference; full concat synth demonstrated in FluCoMa tutorials
- **CataRT** (IRCAM) — seminal real-time concatenative synthesis system
- **Caterpillar** (IRCAM) — offline concatenative synthesis
- **AudioStellar** — open-source corpus explorer using UMAP + audio grains

## FluCoMa Algorithm Details

### Already Implemented
| Algorithm | File | Purpose |
|-----------|------|---------|
| OnsetFeature | `native/src/onset_feature.cpp` | Onset detection |
| OnsetSlice | `native/src/onset_slice.cpp` | Slice audio on onsets |
| MFCCFeature | `native/src/mfcc_feature.cpp` | 13-coefficient MFCCs |
| BufNMF | `native/src/buf_nmf.cpp` | NMF decomposition |
| BufNMFCross | `native/src/buf_nmf.cpp` | NMF cross-synthesis |

### Available in flucoma-core (not yet bound)

All headers confirmed present in `flucoma-core/include/flucoma/algorithms/public/`.

#### Feature Extraction (corpus descriptor building)
| Header | Purpose | Priority for concat synth |
|--------|---------|--------------------------|
| `SpectralShape.hpp` | Centroid, spread, skewness, flatness, rolloff, crest, flux | High — essential timbral descriptors |
| `Loudness.hpp` | True-peak + loudness (EBU R128) | High — energy-based matching |
| `MelBands.hpp` | Raw mel filterbank output | Medium — complements MFCCs |
| `ChromaFilterBank.hpp` | Pitch-class content (12 bins) | Medium — harmonic matching |
| `YINFFT.hpp` | Pitch estimation | Medium — melodic corpus navigation |
| `NoveltyFeature.hpp` | Spectral novelty curve as descriptor | Low-Medium |
| `CepstrumF0.hpp` | Fundamental frequency via cepstrum | Low |

#### Segmentation (corpus slicing alternatives)
| Header | Purpose | Priority |
|--------|---------|---------|
| `NoveltySegmentation.hpp` | Slice on spectral novelty — good for textural/percussive material | High |
| `TransientSegmentation.hpp` | Isolate transients | Medium |
| `EnvelopeSegmentation.hpp` | Amplitude-envelope-based slicing | Medium |

#### Machine Learning / Search (the core of concat synth)
| Header | Purpose | Priority |
|--------|---------|---------|
| `KDTree.hpp` | Fast nearest-neighbor lookup in feature space | **Critical** — enables matching step |
| `KNNClassifier.hpp` | KNN classification on top of KDTree | Medium |
| `KNNRegressor.hpp` | KNN regression on top of KDTree | Medium |
| `PCA.hpp` | Dimensionality reduction for multi-feature matching | High |
| `Normalization.hpp` | Normalize features before search | High — required for meaningful distances |
| `Standardization.hpp` | Z-score standardization of features | High |
| `KMeans.hpp` | Cluster corpus segments | Medium |
| `SKMeans.hpp` | Spherical K-Means variant | Low |
| `UMAP.hpp` | Non-linear dimensionality reduction for visualization | Medium |
| `MDS.hpp` | Multidimensional scaling | Low |

#### Decomposition / Resynthesis
| Header | Purpose | Priority |
|--------|---------|---------|
| `HPSS.hpp` | Harmonic/percussive source separation | Low-Medium |
| `SineExtraction.hpp` | Sinusoidal extraction | Low |
| `TransientExtraction.hpp` | Transient extraction | Low |
| `NMFMorph.hpp` | NMF morphing between components | Low |
| `GriffinLim.hpp` | Phase reconstruction from magnitude spectrum | Low |

## Technical Constraints

- Native bindings must use N-API (`Napi::ObjectWrap<T>`) — matches existing pattern in `native/src/`
- FluCoMa algorithms use `fluid::FluidDefaultAllocator()` — must be consistent
- Electron renderer runs with `contextIsolation: true` and `nodeIntegration: false` — all native calls go through preload IPC bridge
- Node.js v24+ required
- C++17 for native code

## Audio Processing Considerations

- Corpus segments are Float32 or Float64 arrays — existing bindings handle both
- KDTree search must be fast enough for real-time or near-real-time matching; FluCoMa's KDTree is designed for this
- Feature vectors per segment are typically 13–40 dimensional (MFCCs alone are 13)
- PCA/Normalization should be applied before KDTree insertion for stable distances
- Memory: large corpora (thousands of segments × 40 features) are modest in size

## Terminal UI Considerations

- A corpus explorer command (e.g., `corpus.analyze(audioPath)`) should return a dataset of segments with features
- KDTree search results should be printable as a ranked list of matching segment indices/times
- UMAP/PCA projections could be visualized as ASCII scatter plots in the terminal
- Progress reporting during long corpus analysis runs is important UX

## Cross-Platform Considerations

- FluCoMa core is header-only C++ — no platform-specific linking concerns beyond what already exists
- `binding.gyp` changes must include new source files — follows established pattern
- No platform-specific audio I/O is introduced by these algorithms

## Open Questions

1. **What is the minimum viable concat synth workflow?** Likely: slice → extract features → normalize → build KDTree → query nearest neighbors. Should we scope the first iteration to just this pipeline?
2. **Should KDTree be stateful (persisted between REPL calls)?** Probably yes — users will want to build once, query many times.
3. **How should multi-descriptor feature vectors be constructed?** Concatenate MFCCs + SpectralShape + Loudness into a single vector before normalization?
4. **Does FluCoMa's KDTree support incremental insertion, or must it be built all at once?**
5. **What audio output mechanism exists in Bounce for resynthesis playback?**

## Research Findings

- All priority algorithms for concat synth are confirmed present in `flucoma-core/include/flucoma/algorithms/public/`
- The existing native binding pattern (N-API + FluCoMa, see `onset_feature.cpp`) is well-established and can be reused for all new algorithms
- The `add-flucoma-algorithm` skill provides a step-by-step guide for wrapping new algorithms
- KDTree is the single most critical missing primitive — without it, feature extraction has nowhere to go
- Normalization/Standardization must accompany KDTree to produce meaningful nearest-neighbor distances
- SpectralShape provides 7 descriptors in one call (centroid, spread, skewness, flatness, rolloff, crest, flux) — high value per binding effort

## Next Steps

- Resolve open questions (especially #1 and #2) before planning
- Define the minimum viable concat synth pipeline as the scope for PLAN phase
- Design the TypeScript API surface for corpus building and querying
- Determine whether resynthesis (audio output) is in scope for this spec or a follow-on
