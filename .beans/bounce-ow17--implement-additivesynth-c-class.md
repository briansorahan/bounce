---
# bounce-ow17
title: Implement AdditiveSynth C++ class
status: completed
type: task
priority: normal
created_at: 2026-05-20T19:46:32Z
updated_at: 2026-05-21T20:42:23Z
parent: bounce-obqi
blocked_by:
    - bounce-szlm
---

Create the pure C++ AdditiveSynth class with no NAPI dependency.

File: native/include/additive-synth/additive-synth.hpp

The class provides a single static method:
  static std::vector<float> render(const RenderOptions& opts)

RenderOptions struct:
  float fundamentalHz;   // > 0
  int numPartials;       // 1-512
  float spectralTilt;    // gamma exponent (0=flat, 1=sawtooth-like)
  float durationSec;     // > 0
  float sampleRate;      // default 44100
  int fftSize;           // power of 2, default 2048

Algorithm (per hop, hopSize = fftSize/4):
1. Zero the split-complex buffer (fftSize/2+1 bins)
2. For each partial n=1..numPartials:
   a. freq = n * fundamentalHz; skip if freq >= sampleRate/2
   b. amplitude = 1.0 / pow(n, spectralTilt)
   c. phase += 2*PI * freq * hopSize / sampleRate; wrap with fmod
   d. bin = round(freq * fftSize / sampleRate); clamp to [1, fftSize/2-1]
   e. Add amplitude*cos(phase) to realp[bin], amplitude*sin(phase) to imagp[bin]
3. Call htl::rifft to get time-domain frame
4. Divide by (fftSize/2) for HISSTools scaling
5. Apply Hann window, divide by COLA normalization (1.5)
6. Overlap-add into output buffer
7. After all hops: normalize output so peak <= 1.0

Uses HISSTools FFT via native/include/fft/fft.hpp (htl::create_fft_setup, htl::rifft, htl::destroy_fft_setup).
Keep it header-only for simplicity.

Performance requirements:
- Include SIMDSupport.hpp and use SIMDDenormals RAII guard at the top of render()
  to flush denormals to zero (prevents 100x slowdown on near-zero partial amplitudes).
- Use allocate_aligned<float>() from SIMDSupport.hpp for the FFT split-complex buffers
  and the time-domain scratch buffer. Use deallocate_aligned() to free them.
- Use std::sin/std::cos for phase-to-complex conversion (correct for V1; optimization
  to lookup tables or fast approximations is a follow-up if profiling shows need).

Validate inputs: throw std::invalid_argument for bad values.
