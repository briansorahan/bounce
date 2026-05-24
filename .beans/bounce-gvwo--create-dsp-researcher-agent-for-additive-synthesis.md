---
# bounce-gvwo
title: Create DSP Researcher Agent for additive synthesis
status: completed
type: task
priority: normal
created_at: 2026-05-20T18:38:27Z
updated_at: 2026-05-20T18:40:42Z
---

Create a .github/agents/dsp-researcher.md agent definition specialized in FFT/iFFT, spectral analysis/resynthesis, and iFFT-based additive synthesis. Agent knowledge derived from Harmor, NI Razor, and Xaoc Odessa manuals.

## Summary of Changes

Created `.github/agents/dsp-researcher.md` — a new custom agent definition for DSP research specializing in iFFT-based additive synthesis, spectral analysis/resynthesis, and FFT/iFFT algorithms.

The agent incorporates deep domain knowledge extracted from three commercial additive synthesizer manuals:
- **Image-Line Harmor** (516 partials, iFFT engine, spectral processing chain)
- **Native Instruments Razor** (320 partials, sine bank, everything-in-spectral-domain)
- **Xaoc Odessa** (2560 partials, warped comb/tilt/tension macro controls)

Each synth's features include feasibility assessments rated ⭐ to ⭐⭐⭐⭐⭐ for reproduction in Bounce.
