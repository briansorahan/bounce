---
# bounce-56ut
title: FluCoMa extern C wrappers
status: completed
type: task
priority: normal
created_at: 2026-05-25T20:46:32Z
updated_at: 2026-05-25T21:14:41Z
---

C++ source in v2/native/analysis/ that wraps each FluCoMa algorithm (onset, amplitude, novelty, transient slicing; MFCC, spectral shape, NMF, normalization, KD-tree) with extern C functions callable from Go via cgo.

## Summary of Changes\n\nImplemented extern "C" wrappers for all 9 FluCoMa algorithms:\n- flucoma_onset_slice\n- flucoma_amp_slice\n- flucoma_novelty_slice\n- flucoma_transient_slice\n- flucoma_mfcc\n- flucoma_spectral_shape\n- flucoma_nmf\n- flucoma_normalize\n- flucoma_kdtree_query\n\nFixed multiple API mismatches (EnvelopeSegmentation, NoveltySegmentation, TransientSegmentation, MelBands, KDTree). Library builds successfully as libflucoma.a.
