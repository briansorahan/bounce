#include "flucoma.h"

#include "flucoma/algorithms/public/OnsetSegmentation.hpp"
#include "flucoma/algorithms/public/EnvelopeSegmentation.hpp"
#include "flucoma/algorithms/public/NoveltySegmentation.hpp"
#include "flucoma/algorithms/public/TransientSegmentation.hpp"
#include "flucoma/algorithms/public/STFT.hpp"
#include "flucoma/algorithms/public/MelBands.hpp"
#include "flucoma/algorithms/public/DCT.hpp"
#include "flucoma/algorithms/public/SpectralShape.hpp"
#include "flucoma/algorithms/public/NMF.hpp"
#include "flucoma/algorithms/public/Normalization.hpp"
#include "flucoma/algorithms/public/KDTree.hpp"
#include "flucoma/data/FluidMemory.hpp"
#include "flucoma/data/FluidTensor.hpp"
#include "flucoma/data/TensorTypes.hpp"
#include "flucoma/data/FluidDataSet.hpp"

#include <algorithm>
#include <cmath>
#include <complex>
#include <memory>
#include <string>
#include <vector>

extern "C" {

int flucoma_onset_slice(
    const float* audio, int num_frames,
    int* out_onsets, int max_onsets,
    int function, double threshold,
    int min_slice_length, int filter_size, int frame_delta,
    int window_size, int fft_size, int hop_size
) {
    try {
        using namespace fluid;

        Allocator& allocator = FluidDefaultAllocator();
        const int maxFFTSize = std::max(fft_size, 16384);

        algorithm::OnsetSegmentation algo(maxFFTSize, 101, allocator);
        algo.init(window_size, fft_size, filter_size);

        std::vector<double> audioData(num_frames);
        for (int i = 0; i < num_frames; i++) {
            audioData[i] = static_cast<double>(audio[i]);
        }

        fluid::index numOutputFrames = (num_frames - window_size) / hop_size + 1;
        int count = 0;

        for (fluid::index i = 0; i < numOutputFrames && count < max_onsets; i++) {
            fluid::index offset = i * hop_size;
            RealVector inputVec(window_size + frame_delta, allocator);

            for (int j = 0; j < window_size + frame_delta && offset + j < num_frames; j++) {
                inputVec(j) = audioData[offset + j];
            }

            double detected = algo.processFrame(
                inputVec, function, filter_size, threshold, min_slice_length, frame_delta, allocator
            );

            if (detected > 0.0) {
                out_onsets[count++] = static_cast<int>(offset);
            }
        }

        return count;
    } catch (...) {
        return -1;
    }
}

int flucoma_amp_slice(
    const float* audio, int num_frames,
    int* out_slices, int max_slices,
    int fast_ramp_up, int fast_ramp_down,
    int slow_ramp_up, int slow_ramp_down,
    double on_threshold, double off_threshold, double floor_val,
    int min_slice_length, double high_pass_freq, double sample_rate
) {
    try {
        using namespace fluid;

        algorithm::EnvelopeSegmentation algo;

        double normalizedHPF = std::min(high_pass_freq / sample_rate, 0.5);
        algo.init(floor_val, normalizedHPF);

        int count = 0;

        for (int i = 0; i < num_frames && count < max_slices; i++) {
            double sample = static_cast<double>(audio[i]);

            double detected = algo.processSample(
                sample,
                on_threshold,
                off_threshold,
                floor_val,
                static_cast<fluid::index>(fast_ramp_up),
                static_cast<fluid::index>(slow_ramp_up),
                static_cast<fluid::index>(fast_ramp_down),
                static_cast<fluid::index>(slow_ramp_down),
                normalizedHPF,
                static_cast<fluid::index>(min_slice_length)
            );

            if (detected > 0.0) {
                out_slices[count++] = i;
            }
        }

        return count;
    } catch (...) {
        return -1;
    }
}

int flucoma_novelty_slice(
    const float* audio, int num_frames,
    int* out_slices, int max_slices,
    int kernel_size, double threshold, int filter_size,
    int min_slice_length, int window_size, int fft_size, int hop_size
) {
    try {
        using namespace fluid;

        Allocator& alloc = FluidDefaultAllocator();

        fluid::index frameSize = fft_size / 2 + 1;

        // Ensure kernel_size is odd
        int ks = (kernel_size % 2 == 0) ? kernel_size + 1 : kernel_size;

        algorithm::NoveltySegmentation novelty(ks, frameSize, filter_size, alloc);
        novelty.init(ks, filter_size, frameSize, alloc);

        algorithm::STFT stft(window_size, fft_size, hop_size, 0, alloc);

        // Convert to double
        std::vector<double> audioData(num_frames);
        for (int i = 0; i < num_frames; i++) {
            audioData[i] = static_cast<double>(audio[i]);
        }

        fluid::index numFramesOut = (num_frames - window_size) / hop_size + 1;
        int count = 0;

        FluidTensor<std::complex<double>, 1> spectrum(frameSize, alloc);
        FluidTensor<double, 1> magnitude(frameSize, alloc);
        FluidTensor<double, 1> frame(window_size, alloc);

        for (fluid::index i = 0; i < numFramesOut && count < max_slices; i++) {
            fluid::index offset = i * hop_size;

            for (fluid::index j = 0; j < window_size; j++) {
                fluid::index src = offset + j;
                frame(j) = (src < num_frames) ? audioData[src] : 0.0;
            }

            stft.processFrame(frame, spectrum);
            algorithm::STFT::magnitude(spectrum, magnitude);

            double detected = novelty.processFrame(
                magnitude, threshold, static_cast<fluid::index>(min_slice_length), alloc
            );

            if (detected > 0.0) {
                out_slices[count++] = static_cast<int>(offset);
            }
        }

        return count;
    } catch (...) {
        return -1;
    }
}

int flucoma_transient_slice(
    const float* audio, int num_frames,
    int* out_slices, int max_slices,
    int order, int block_size, int pad_size,
    double skew, double thresh_fwd, double thresh_back,
    int window_size, int clump_length, int min_slice_length
) {
    try {
        using namespace fluid;

        Allocator& alloc = FluidDefaultAllocator();

        algorithm::TransientSegmentation algo(order, block_size, pad_size, alloc);
        algo.init(order, block_size, pad_size);
        algo.setDetectionParameters(skew, thresh_fwd, thresh_back,
                                    static_cast<fluid::index>(window_size),
                                    static_cast<fluid::index>(clump_length),
                                    static_cast<fluid::index>(min_slice_length));

        std::vector<double> audioData(num_frames);
        for (int i = 0; i < num_frames; i++) {
            audioData[i] = static_cast<double>(audio[i]);
        }

        int count = 0;

        for (int offset = 0; offset + block_size <= num_frames && count < max_slices; offset += block_size) {
            RealVector frame(block_size, alloc);
            for (int j = 0; j < block_size; j++) {
                frame(j) = audioData[offset + j];
            }

            RealVector detected(block_size, alloc);
            algo.process(frame, detected, alloc);

            for (int j = 0; j < block_size && count < max_slices; j++) {
                if (detected(j) > 0.0) {
                    out_slices[count++] = offset + j;
                }
            }
        }

        return count;
    } catch (...) {
        return -1;
    }
}

int flucoma_mfcc(
    const float* audio, int num_frames,
    double* out_mfccs, int max_output_frames,
    int num_coeffs, int num_bands,
    double min_freq, double max_freq,
    int window_size, int fft_size, int hop_size,
    double sample_rate
) {
    try {
        using namespace fluid;

        Allocator& alloc = FluidDefaultAllocator();

        fluid::index frameSize = fft_size / 2 + 1;

        algorithm::STFT stft(window_size, fft_size, hop_size, 0, alloc);
        algorithm::MelBands melBands(num_bands, fft_size);
        melBands.init(min_freq, max_freq, num_bands, frameSize, sample_rate, window_size);
        algorithm::DCT dct(num_bands, num_coeffs);
        dct.init(num_bands, num_coeffs);

        // Convert to double
        std::vector<double> audioData(num_frames);
        for (int i = 0; i < num_frames; i++) {
            audioData[i] = static_cast<double>(audio[i]);
        }

        fluid::index numFramesOut = (num_frames - window_size) / hop_size + 1;

        FluidTensor<std::complex<double>, 1> spectrum(frameSize, alloc);
        FluidTensor<double, 1> mag(frameSize, alloc);
        FluidTensor<double, 1> bands(num_bands);
        FluidTensor<double, 1> coefficients(num_coeffs);
        FluidTensor<double, 1> frame(window_size, alloc);

        int framesProcessed = 0;
        for (fluid::index i = 0; i < numFramesOut && framesProcessed < max_output_frames; i++) {
            fluid::index offset = i * hop_size;

            for (fluid::index j = 0; j < window_size; j++) {
                fluid::index src = offset + j;
                frame(j) = (src < num_frames) ? audioData[src] : 0.0;
            }

            stft.processFrame(frame, spectrum);
            algorithm::STFT::magnitude(spectrum, mag);

            melBands.processFrame(mag, bands, false, false, false, alloc);
            dct.processFrame(bands, coefficients);

            for (int j = 0; j < num_coeffs; j++) {
                out_mfccs[framesProcessed * num_coeffs + j] = coefficients(j);
            }
            framesProcessed++;
        }

        return framesProcessed;
    } catch (...) {
        return -1;
    }
}

int flucoma_spectral_shape(
    const float* audio, int num_frames,
    double* out_features, int max_output_frames,
    int window_size, int fft_size, int hop_size,
    double sample_rate,
    double min_freq, double max_freq,
    double rolloff_target, int log_freq, int use_power
) {
    try {
        using namespace fluid;

        Allocator& alloc = FluidDefaultAllocator();

        fluid::index frameSize = fft_size / 2 + 1;

        algorithm::STFT stft(window_size, fft_size, hop_size, 0, alloc);
        algorithm::SpectralShape spectralShape(alloc);

        std::vector<double> audioData(num_frames);
        for (int i = 0; i < num_frames; i++) {
            audioData[i] = static_cast<double>(audio[i]);
        }

        fluid::index numFramesOut = (num_frames - window_size) / hop_size + 1;

        FluidTensor<std::complex<double>, 1> spectrum(frameSize, alloc);
        FluidTensor<double, 1> mag(frameSize, alloc);
        FluidTensor<double, 1> shapeOutput(7);
        FluidTensor<double, 1> frame(window_size, alloc);

        double actualMaxFreq = max_freq < 0 ? sample_rate / 2.0 : max_freq;

        int framesProcessed = 0;
        for (fluid::index i = 0; i < numFramesOut && framesProcessed < max_output_frames; i++) {
            fluid::index offset = i * hop_size;

            for (fluid::index j = 0; j < window_size; j++) {
                fluid::index src = offset + j;
                frame(j) = (src < num_frames) ? audioData[src] : 0.0;
            }

            stft.processFrame(frame, spectrum);
            algorithm::STFT::magnitude(spectrum, mag);

            spectralShape.processFrame(
                mag, shapeOutput, sample_rate,
                min_freq, actualMaxFreq,
                rolloff_target / 100.0,
                log_freq != 0, use_power != 0, alloc
            );

            for (int j = 0; j < 7; j++) {
                out_features[framesProcessed * 7 + j] = shapeOutput(j);
            }
            framesProcessed++;
        }

        return framesProcessed;
    } catch (...) {
        return -1;
    }
}

int flucoma_nmf(
    const float* audio, int num_frames,
    double* out_activations, int rank,
    int iterations, int fft_size, int hop_size, int window_size
) {
    try {
        using namespace fluid;

        if (hop_size <= 0) hop_size = fft_size / 2;
        if (window_size <= 0) window_size = fft_size;

        Allocator& alloc = FluidDefaultAllocator();

        algorithm::STFT stft(window_size, fft_size, hop_size, 0, alloc);

        fluid::index nBins = fft_size / 2 + 1;

        // Convert to double
        FluidTensor<double, 1> audioTensor(num_frames);
        for (int i = 0; i < num_frames; i++) {
            audioTensor(i) = static_cast<double>(audio[i]);
        }

        // Use the bulk STFT process
        fluid::index nWindows = static_cast<fluid::index>(
            std::floor((num_frames + hop_size) / hop_size));
        FluidTensor<std::complex<double>, 2> spectrum(nWindows, nBins);
        stft.process(audioTensor, spectrum);

        FluidTensor<double, 2> magnitude(nWindows, nBins);
        algorithm::STFT::magnitude(spectrum, magnitude);

        FluidTensor<double, 2> bases(rank, nBins);
        FluidTensor<double, 2> activations(nWindows, rank);
        FluidTensor<double, 2> reconstructed(nWindows, nBins);

        algorithm::NMF nmf;
        nmf.process(magnitude, bases, activations, reconstructed,
                    rank, iterations, true, true, -1);

        // Output activations: [rank * nWindows]
        for (int r = 0; r < rank; r++) {
            for (fluid::index w = 0; w < nWindows; w++) {
                out_activations[r * nWindows + w] = activations(w, r);
            }
        }

        return static_cast<int>(nWindows);
    } catch (...) {
        return -1;
    }
}

int flucoma_normalize(
    const double* data, int num_rows, int num_cols,
    double* out, int mode
) {
    try {
        using namespace fluid;

        // Build a 2D tensor from input
        FluidTensor<double, 2> input(num_rows, num_cols);
        for (int i = 0; i < num_rows; i++) {
            for (int j = 0; j < num_cols; j++) {
                input(i, j) = data[i * num_cols + j];
            }
        }

        algorithm::Normalization norm;
        // mode 0=minmax [0,1], mode 1=standardize [-1,1], mode 2=robust [0,1]
        // The FluCoMa Normalization::init takes (min, max, data)
        double outMin = (mode == 1) ? -1.0 : 0.0;
        double outMax = 1.0;
        norm.init(outMin, outMax, input);

        FluidTensor<double, 2> output(num_rows, num_cols);
        norm.process(input, output);

        for (int i = 0; i < num_rows; i++) {
            for (int j = 0; j < num_cols; j++) {
                out[i * num_cols + j] = output(i, j);
            }
        }

        return 0;
    } catch (...) {
        return -1;
    }
}

int flucoma_kdtree_query(
    const double* data, int num_points, int num_dims,
    const double* query,
    int* out_indices, double* out_distances, int k
) {
    try {
        using namespace fluid;

        if (num_points == 0 || num_dims == 0 || k == 0) return 0;

        // Build a FluidDataSet from the flat data
        FluidDataSet<std::string, double, 1> dataset(num_dims);

        for (int i = 0; i < num_points; i++) {
            FluidTensor<double, 1> pt(num_dims);
            for (int j = 0; j < num_dims; j++) {
                pt(j) = data[i * num_dims + j];
            }
            RealVectorView ptView = pt;
            dataset.add(std::to_string(i), ptView);
        }

        // Build tree
        algorithm::KDTree tree(dataset);

        // Query
        FluidTensor<double, 1> queryPt(num_dims);
        for (int j = 0; j < num_dims; j++) {
            queryPt(j) = query[j];
        }

        int actualK = std::min(k, num_points);

        auto result = tree.kNearest(queryPt, actualK);

        // result is pair<vector<double>, vector<const string*>>
        // first = distances, second = id pointers
        int count = static_cast<int>(result.first.size());
        if (count > actualK) count = actualK;

        for (int i = 0; i < count; i++) {
            out_distances[i] = result.first[i];
            out_indices[i] = std::stoi(*result.second[i]);
        }

        return count;
    } catch (...) {
        return -1;
    }
}

} // extern "C"
