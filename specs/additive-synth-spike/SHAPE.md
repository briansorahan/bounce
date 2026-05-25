# Shape: Offline iFFT Additive Synthesis Renderer

**Spec:** specs/additive-synth-spike
**Bean:** bounce-obqi
**Created:** 2026-05-20
**Appetite:** Small (~1 day)
**Status:** Approved

---

## Problem

Bounce has no additive synthesis capability. To build features inspired by Harmor (spectral
processing chain), Razor (sine-bank-everything), and Odessa (spectral tilt/comb/tension), we need
a proven iFFT additive synthesis pipeline as the foundation. Without validating that the core
algorithm works — phase accumulation, bin mapping, overlap-add, HISSTools iFFT integration — we
cannot build any of the higher-level spectral features. This spike establishes that foundation.

## Rough Solution Sketch

A pure C++ class `AdditiveSynth` that renders a harmonic tone into a float buffer via iFFT
overlap-add. Wrapped as a single NAPI function `renderAdditive(options) → Float32Array` and
registered in the `flucoma_native` addon (analysis utility process — offline rendering, not
real-time). The C++ class has no NAPI dependency so it can later be reused inside a real-time
`Instrument` in the audio engine.

**Algorithm per hop:**
1. For each partial n (1..numPartials): compute frequency `f_n = n * f0`, skip if `f_n >= Nyquist`
2. Compute amplitude `a_n = 1 / n^γ` (spectral tilt)
3. Accumulate phase `φ_n += 2π * f_n * hopSize / sampleRate`
4. Map to nearest FFT bin, write amplitude and phase into split-complex buffer
5. iFFT via `htl::rifft`
6. Apply Hann synthesis window, overlap-add into output buffer
7. Normalize output (peak ≤ 1.0)

**Fixed constraints for V1:** `hopSize = fftSize/4`, Hann window, nearest-bin mapping.

## Design Challenges

**Simplest alternative**: Direct sine-wave summation (sum N sinusoids sample-by-sample) would
also produce additive tones without FFT complexity.

> _Resolution:_ Rejected. Direct summation is O(N×samples) and doesn't prove the iFFT pipeline
> that all future spectral processing depends on. The iFFT approach is O(N log N) per hop and
> enables spectral-domain effects (filters, blur, prism) as simple array operations on the
> frequency-domain buffer. The point of this spike is to validate that pipeline.

**Failure modes**: (1) HISSTools `rifft` may use unexpected output scaling (no 1/N, or different
convention). (2) Phase accumulator wrapping could cause clicks. (3) Bin collisions at low
fundamentals could produce pitch errors.

> _Resolution:_ (1) Include an empirical scaling test: iFFT a known cosine, verify amplitude.
> (2) Use `fmod(phase, 2π)` to prevent float precision loss. (3) Accept nearest-bin imprecision
> for V1; document that low fundamentals (< ~50 Hz with fftSize=2048) will have quantized pitch.
> Bin interpolation is a follow-up.

**Hidden dependencies**: HISSTools FFT is already compiled into `flucoma_native` (used by FluCoMa
internally). The `native/include/fft/fft.hpp` wrapper is header-only. Need to verify
`hisstools_create_setup` / `hisstools_destroy_setup` lifecycle is compatible with single-call
rendering.

> _Resolution:_ Create FFT setup once at the start of `render()`, destroy at end. No persistent
> state needed.

**Hardest part**: Getting the overlap-add normalization correct so there are no amplitude ripples
at the hop rate. This is the most likely source of audible artifacts.

> _Resolution:_ Resolved by fixing `hopSize = fftSize/4` with Hann window. At this ratio, the
> sum of overlapping Hann windows is constant (1.5). Divide each windowed frame by 1.5. This is
> a well-established result.

**No-go safety**: Excluding real-time playback, REPL integration, and spectral effects is safe.
The spike proves the DSP core; integration comes next.

> _Resolution:_ Safe. The C++ class is designed with no NAPI coupling, so wrapping it as an
> `Instrument` or exposing it via RPC is a natural follow-up with no refactoring of the core.

**Architectural fit**: This adds a function to the `flucoma_native` addon, following the existing
pattern of offline analysis functions. It runs in the analysis utility process, consistent with
how other CPU-intensive operations work. The C++ core is separated from the NAPI wrapper per
VISION.md's "native addons are thin wrappers" principle.

> _Resolution:_ Good fit. Follows established patterns.

## Rabbit Holes

- **HISSTools split-complex format**: Need to confirm whether `rifft` expects interleaved or
  split real/imaginary arrays and whether bin 0 and bin N/2 have special handling. **Resolved:**
  HISSTools uses split-complex (separate real and imaginary arrays), and bin 0 / bin N/2 are
  stored as the first elements of real and imaginary arrays respectively. This is confirmed by
  the existing usage in FluCoMa's STFT.hpp.

- **Window normalization constant**: Could spend time deriving the general formula for arbitrary
  hop ratios. **Resolved:** Fix hop ratio to fftSize/4 for V1. Normalization constant is 1.5
  for Hann window at 75% overlap. No general formula needed.

- **Bin interpolation / sub-bin accuracy**: Could go deep on parabolic or sinc interpolation
  for sub-bin partial placement. **Moved to no-gos.** Nearest-bin is sufficient for V1.

## No-Gos

- No real-time `Instrument` or voice management — offline render only
- No REPL namespace or `help()` — this is a C++ spike, not a user-facing feature yet
- No spectral effects (filters, blur, pluck, prism, harmonizer) — just the raw additive tone
- No bin interpolation — nearest-bin mapping only
- No inharmonicity / tension control — harmonic partials only (f_n = n × f0)
- No unison or multi-voice — single monophonic tone
- No audio file export — returns Float32Array to JS, caller decides what to do with it
- No database interaction

## Alignment

### Product Principles

| Principle | Status | Notes |
|-----------|--------|-------|
| REPL-first | ⚠ | Spike is callable from JS but has no REPL namespace yet — follow-up |
| Self-documenting | — | No user-facing surface in this spike |
| Hackable and extensible | ✓ | Pure C++ class with clean API enables future composition |
| Open-source throughout | ✓ | HISSTools FFT is open source |
| Reflects cutting-edge research | ✓ | iFFT additive synthesis is the engine behind Harmor/Razor |
| Non-destructive by default | ✓ | Generates new buffers, mutates nothing |

### Technical Principles

| Principle | Status | Notes |
|-----------|--------|-------|
| Service-oriented architecture | ✓ | Runs in analysis utility process via existing service |
| Audio utility process is the central service | — | Not involved in this spike |
| Streaming is first-class | — | Offline rendering, no streaming |
| Renderer is a service | — | Not involved |
| IPC contracts are explicit and typed | ⚠ | No new RPC method in this spike — follow-up adds it |
| Native addons are thin wrappers | ✓ | C++ core class separated from NAPI wrapper |
| Database changes require versioned migrations | — | No DB changes |
| New REPL surface uses decorator registration | — | No REPL surface in this spike |

⚠ **REPL-first / IPC contracts**: This spike intentionally defers REPL and RPC integration to
keep scope within the Small appetite. The follow-up spec will add a proper RPC method and REPL
command.

## Specialist Review — Round 1

_Skipped — Small appetite._

## Specialist Review — Round 2

_Skipped — Small appetite._

## Approval Checklist

- [x] Every rabbit hole is resolved or explicitly moved to no-gos
- [x] No tangled interdependencies remain
- [x] Every design challenge has a documented resolution
- [x] All specialist concerns addressed or explicitly accepted (Medium/Large only) — N/A (Small)
- [x] All cross-domain tensions resolved or accepted by user (Medium/Large only) — N/A (Small)
- [x] Rough solution fits the appetite
- [x] No-gos are specific enough that a builder would know what is excluded
