#pragma once

#include "../fft/fft.hpp"
#include "SIMDSupport.hpp"

#include <climits>
#include <cmath>
#include <cstring>
#include <memory>
#include <stdexcept>
#include <vector>

namespace bounce {

struct RenderOptions {
    float fundamentalHz;
    int   numPartials;
    float spectralTilt;   // gamma exponent: A_n = 1 / n^gamma (0 = flat, 1 = sawtooth)
    float durationSec;
    float sampleRate = 44100.0f;
    int   fftSize    = 2048; // must be a power of 2
};

namespace detail {

struct AlignedDeleter {
    void operator()(float* p) const { if (p) deallocate_aligned(p); }
};
using AlignedFloatPtr = std::unique_ptr<float[], AlignedDeleter>;

inline AlignedFloatPtr make_aligned(size_t count) {
    return AlignedFloatPtr(allocate_aligned<float>(count));
}

struct FFTSetupDeleter {
    void operator()(FFT_SETUP_F s) const { if (s) htl::destroy_fft_setup(s); }
};

} // namespace detail

class AdditiveSynth {
public:
    static std::vector<float> render(const RenderOptions& opts)
    {
        // ── 0. Validate inputs ────────────────────────────────────────────────
        if (opts.fundamentalHz <= 0.0f)
            throw std::invalid_argument("fundamentalHz must be > 0");
        if (opts.numPartials < 1 || opts.numPartials > 512)
            throw std::invalid_argument("numPartials must be in [1, 512]");
        if (opts.durationSec <= 0.0f)
            throw std::invalid_argument("durationSec must be > 0");
        if (opts.sampleRate <= 0.0f)
            throw std::invalid_argument("sampleRate must be > 0");
        if (opts.fftSize <= 0 || (opts.fftSize & (opts.fftSize - 1)) != 0)
            throw std::invalid_argument("fftSize must be a power of 2");

        const float maxDuration = static_cast<float>(INT_MAX) / opts.sampleRate;
        if (opts.durationSec > maxDuration)
            throw std::invalid_argument("durationSec too large for given sampleRate");

        // ── 1. RAII guard: flush-to-zero + denormal-as-zero ──────────────────
        SIMDDenormals denormals;

        // ── 2. Derived values ────────────────────────────────────────────────
        const int   fftSize      = opts.fftSize;
        const int   hopSize      = fftSize / 4;
        const int   numBins      = fftSize / 2 + 1;
        const float sampleRate   = opts.sampleRate;
        const int   totalSamples = static_cast<int>(sampleRate * opts.durationSec);

        // Enough hops to fully cover output + windowing tail
        const int numHops =
            static_cast<int>(std::ceil(static_cast<float>(totalSamples + fftSize) /
                                       static_cast<float>(hopSize)));

        // Integer log2 via bit scan
        uintptr_t log2n = 0;
        {
            int tmp = fftSize;
            while (tmp > 1) { tmp >>= 1; ++log2n; }
        }

        // ── 3. FFT setup (RAII) ─────────────────────────────────────────────
        FFT_SETUP_F rawSetup{};
        htl::create_fft_setup(&rawSetup, log2n);
        auto setupGuard = std::unique_ptr<std::remove_pointer_t<FFT_SETUP_F>,
                                          detail::FFTSetupDeleter>(rawSetup);

        // ── 4. Aligned buffers (RAII) ────────────────────────────────────────
        auto realp      = detail::make_aligned(static_cast<size_t>(numBins));
        auto imagp      = detail::make_aligned(static_cast<size_t>(numBins));
        auto timeDomain = detail::make_aligned(static_cast<size_t>(fftSize));

        // ── 5. Output buffer ─────────────────────────────────────────────────
        std::vector<float> output(static_cast<size_t>(totalSamples), 0.0f);

        // ── 6. Pre-compute Hann window, already divided by COLA factor (1.5) ─
        const float twoPi = 2.0f * static_cast<float>(M_PI);
        std::vector<float> window(static_cast<size_t>(fftSize));
        for (int k = 0; k < fftSize; ++k) {
            const float hann = 0.5f * (1.0f - std::cos(twoPi * static_cast<float>(k) /
                                                        static_cast<float>(fftSize)));
            window[static_cast<size_t>(k)] = hann / 1.5f;
        }

        // ── 7. Phase accumulators ─────────────────────────────────────────────
        std::vector<float> phases(static_cast<size_t>(opts.numPartials), 0.0f);

        // iFFT scale factor for HISSTools unnormalized result
        const float ifftScale = 1.0f / static_cast<float>(fftSize / 2);

        // ── 8. Synthesis loop ─────────────────────────────────────────────────
        for (int h = 0; h < numHops; ++h) {
            // a. Zero the frequency-domain buffers
            std::memset(realp.get(), 0, static_cast<size_t>(numBins) * sizeof(float));
            std::memset(imagp.get(), 0, static_cast<size_t>(numBins) * sizeof(float));

            // b. Accumulate partials into split-complex spectrum
            for (int n = 1; n <= opts.numPartials; ++n) {
                const float freq = static_cast<float>(n) * opts.fundamentalHz;

                // Nyquist cull
                if (freq >= sampleRate * 0.5f)
                    break; // partials are in ascending frequency order

                const float amplitude = 1.0f / std::powf(static_cast<float>(n),
                                                          opts.spectralTilt);

                // Advance phase by one hop
                phases[static_cast<size_t>(n - 1)] +=
                    twoPi * freq * static_cast<float>(hopSize) / sampleRate;
                // Wrap to [0, 2π) to prevent float drift
                phases[static_cast<size_t>(n - 1)] =
                    std::fmodf(phases[static_cast<size_t>(n - 1)], twoPi);

                // Map frequency to nearest FFT bin, clamped away from DC and Nyquist
                int bin = static_cast<int>(
                    std::roundf(freq * static_cast<float>(fftSize) / sampleRate));
                if (bin < 1)             bin = 1;
                if (bin > fftSize / 2 - 1) bin = fftSize / 2 - 1;

                realp[static_cast<size_t>(bin)] +=
                    amplitude * std::cosf(phases[static_cast<size_t>(n - 1)]);
                imagp[static_cast<size_t>(bin)] +=
                    amplitude * std::sinf(phases[static_cast<size_t>(n - 1)]);
            }

            // c. Build split-complex struct
            FFT_SPLIT_COMPLEX_F split;
            split.realp = realp.get();
            split.imagp = imagp.get();

            // d. Inverse real FFT
            htl::rifft(rawSetup, &split, timeDomain.get(), log2n);

            // e–f. Scale (iFFT normalisation) and apply windowed COLA factor
            for (int k = 0; k < fftSize; ++k) {
                timeDomain[static_cast<size_t>(k)] *=
                    ifftScale * window[static_cast<size_t>(k)];
            }

            // g. Overlap-add into output
            const int outputOffset = h * hopSize;
            for (int k = 0; k < fftSize; ++k) {
                const int idx = outputOffset + k;
                if (idx < totalSamples)
                    output[static_cast<size_t>(idx)] +=
                        timeDomain[static_cast<size_t>(k)];
            }
        }

        // ── 9. Peak normalisation ─────────────────────────────────────────────
        float peak = 0.0f;
        for (const float s : output) {
            const float abs_s = std::fabsf(s);
            if (abs_s > peak) peak = abs_s;
        }
        if (peak > 0.0f) {
            const float invPeak = 1.0f / peak;
            for (float& s : output) s *= invPeak;
        }

        // ── 10. Return ────────────────────────────────────────────────────────
        // RAII handles cleanup of aligned buffers and FFT setup
        return output;
    }
};

} // namespace bounce
