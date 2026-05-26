---
# bounce-hd9e
title: Go analysis package
status: completed
type: task
priority: normal
created_at: 2026-05-25T20:46:38Z
updated_at: 2026-05-25T21:18:54Z
blocked_by:
    - bounce-56ut
    - bounce-x7cp
---

Go package (internal/analysis/) wrapping the extern C FluCoMa functions with idiomatic Go APIs. Each algorithm gets a function with typed options and results. Table-driven tests with golden file comparison using the Freesound fixture.

## Summary of Changes\n\nCreated `v2/internal/analysis/` package with idiomatic Go wrappers for all 9 FluCoMa C functions via cgo:\n- OnsetSlice, AmpSlice, NoveltySlice, TransientSlice (slicers)\n- MFCC, SpectralShape (feature extractors)\n- NMF (decomposition)\n- Normalize, KDTreeQuery (utilities)\n\nEach function has typed options structs with sensible defaults and structured result types. 18 tests passing, covering both normal operation and empty-input edge cases. Also fixed a bug in the C++ MelBands init (was passing fft_size instead of nBins=fft_size/2+1).
