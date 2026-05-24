---
# bounce-szlm
title: Write test skeletons for additive-synth-spike
status: completed
type: task
priority: normal
created_at: 2026-05-20T19:46:17Z
updated_at: 2026-05-21T20:40:04Z
parent: bounce-obqi
---

Write unit test skeletons in src/additive-synth.test.ts that define done for the additive-synth-spike spec.

Tests to skeleton (use test.todo() or minimal assertions):
1. Pure sine: renderAdditive with numPartials=1, tilt=0 produces a sine wave at the fundamental
2. Sawtooth: renderAdditive with numPartials=128, tilt=1 produces harmonic amplitudes following 1/n
3. Spectral tilt: tilt=2 attenuates higher partials more than tilt=0
4. Nyquist culling: partials above Nyquist are silent
5. Output normalization: peak absolute value <= 1.0
6. Invalid inputs: throws on fundamentalHz <= 0, numPartials <= 0, etc.

The test file should import renderAdditive from the flucoma_native addon (src/index.ts re-exports).
See specs/additive-synth-spike/SPEC.md §Acceptance Test Plan for full details.
Must be committed before BUILD begins.
