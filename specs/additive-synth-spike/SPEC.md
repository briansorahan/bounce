# Spec: Offline iFFT Additive Synthesis Renderer

**Spec:** specs/additive-synth-spike
**Bean:** bounce-obqi
**Created:** 2026-05-20
**Appetite:** Small
**Status:** In Progress

---

## Research

### Key Findings

1. **HISSTools FFT split-complex format**: Separate real and imaginary arrays. For a real FFT of
   size N, the output has N/2+1 complex bins. Bin 0 (DC) and bin N/2 (Nyquist) are real-only;
   HISSTools stores DC in `realp[0]` and Nyquist in `imagp[0]`.

2. **HISSTools iFFT scaling**: `hisstools_rifft` returns unnormalized output. Caller must divide
   by `fftSize/2` to recover correct amplitudes. (Confirmed by FluCoMa's ISTFT implementation
   which applies this scaling.)

3. **Existing NAPI pattern**: All flucoma_native bindings use `Napi::ObjectWrap` with a static
   `Init` function registered in `addon.cpp`. For this spike, a standalone function export
   (`Napi::Function::New`) is simpler since there's no persistent state, but using the class
   pattern is consistent. Decision: use a simple function export (`renderAdditive`) since there
   is no state between calls.

4. **Hann window at 75% overlap**: The constant-overlap-add (COLA) constraint for Hann window
   with hop = fftSize/4 yields a constant sum of 1.5. Divide each windowed frame by 1.5.

### Open Questions Resolved

- **Q: Where does the new C++ file go?** A: `native/src/additive_synth.cpp` for the NAPI
  wrapper, `native/include/additive-synth/additive-synth.hpp` for the pure C++ DSP class.
- **Q: How to register a function (not class) export?** A: In `addon.cpp`, call
  `exports.Set("renderAdditive", Napi::Function::New(env, RenderAdditive))`.
- **Q: Float type?** A: Use `float` (not `double`) since the output is `Float32Array` and
  HISSTools supports both via template overloads.

---

## Per-Service Design

This spike does not add or modify any service or RPC contract. It adds a native function to the
`flucoma_native` addon.

### Native Addon: `flucoma_native`

**New files:**
- `native/include/additive-synth/additive-synth.hpp` — Pure C++ class `AdditiveSynth`
- `native/src/additive_synth.cpp` — NAPI wrapper function

**Changes to existing files:**
- `native/src/addon.cpp` — Add `InitAdditiveSynth` forward declaration and call in `Init`
- `binding.gyp` — Add `native/src/additive_synth.cpp` to flucoma_native sources
- `src/native.d.ts` — Add TypeScript type declaration for `renderAdditive`

**Exported function:**

```typescript
interface AdditiveRenderOptions {
  fundamentalHz: number;    // Fundamental frequency (> 0)
  numPartials: number;      // Number of harmonic partials (1-512)
  spectralTilt: number;     // γ exponent for 1/n^γ amplitude rolloff (0 = flat, 1 = sawtooth)
  durationSec: number;      // Duration in seconds (> 0)
  sampleRate?: number;      // Default: 44100
  fftSize?: number;         // Power of 2, default: 2048
}

function renderAdditive(options: AdditiveRenderOptions): Float32Array;
```

**`bootServices()` update needed:** No

---

## REPL Interface Contract

None. This spike does not add REPL surface area.

---

## Acceptance Test Plan

### Unit Tests

| Test file | Behaviors |
|-----------|-----------|
| `src/additive-synth.test.ts` | 1. Pure sine (numPartials=1, tilt=0): output is a sine wave at the fundamental frequency — verify by measuring zero-crossings or FFT peak bin<br>2. Sawtooth (numPartials=128, tilt=1): harmonic amplitudes follow 1/n — verify first few harmonics via FFT analysis of output<br>3. Spectral tilt (tilt=2 vs tilt=0): higher partials attenuated more — verify partial amplitude ratio<br>4. Nyquist culling: partials above Nyquist are silent — use high fundamental + many partials<br>5. Output normalization: peak absolute value ≤ 1.0<br>6. Invalid inputs: throws on fundamentalHz ≤ 0, numPartials ≤ 0, etc. |

### Workflow Tests

No workflow tests — this spike does not involve services or RPC.

---

## Task Graph

| Bean ID | Title | Type | Blocked By |
|---------|-------|------|------------|
| bounce-szlm | Write test skeletons for additive-synth-spike | task | — |
| bounce-ow17 | Implement AdditiveSynth C++ class | task | bounce-szlm |
| bounce-svx1 | NAPI wrapper and binding registration | task | bounce-ow17 |

```bash
# Bean creation commands (recorded for reproducibility)
beans create --json "Write test skeletons for additive-synth-spike" -t task -d "..."
# → bounce-szlm
beans create --json "Implement AdditiveSynth C++ class" -t task -d "..."
# → bounce-ow17
beans create --json "NAPI wrapper and binding registration" -t task -d "..."
# → bounce-svx1
beans update bounce-szlm --parent bounce-obqi
beans update bounce-ow17 --parent bounce-obqi --blocked-by bounce-szlm
beans update bounce-svx1 --parent bounce-obqi --blocked-by bounce-ow17
```
