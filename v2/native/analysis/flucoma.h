#ifndef FLUCOMA_H
#define FLUCOMA_H

#ifdef __cplusplus
extern "C" {
#endif

// Onset slicing - detects onset positions in audio.
// Returns number of onsets found, or negative on error.
int flucoma_onset_slice(
    const float* audio, int num_frames,
    int* out_onsets, int max_onsets,
    int function, double threshold,
    int min_slice_length, int filter_size, int frame_delta,
    int window_size, int fft_size, int hop_size
);

// Amplitude slicing - detects slices by envelope following.
// Returns number of slices found, or negative on error.
int flucoma_amp_slice(
    const float* audio, int num_frames,
    int* out_slices, int max_slices,
    int fast_ramp_up, int fast_ramp_down,
    int slow_ramp_up, int slow_ramp_down,
    double on_threshold, double off_threshold, double floor_val,
    int min_slice_length, double high_pass_freq, double sample_rate
);

// Novelty slicing - detects slices by spectral novelty.
// Returns number of slices found, or negative on error.
int flucoma_novelty_slice(
    const float* audio, int num_frames,
    int* out_slices, int max_slices,
    int kernel_size, double threshold, int filter_size,
    int min_slice_length, int window_size, int fft_size, int hop_size
);

// Transient slicing - detects transient boundaries.
// Returns number of slices found, or negative on error.
int flucoma_transient_slice(
    const float* audio, int num_frames,
    int* out_slices, int max_slices,
    int order, int block_size, int pad_size,
    double skew, double thresh_fwd, double thresh_back,
    int window_size, int clump_length, int min_slice_length
);

// MFCC extraction - computes MFCCs per frame.
// out_mfccs is flat: [returned_frames * num_coeffs]
// Returns number of frames processed, or negative on error.
int flucoma_mfcc(
    const float* audio, int num_frames,
    double* out_mfccs, int max_output_frames,
    int num_coeffs, int num_bands,
    double min_freq, double max_freq,
    int window_size, int fft_size, int hop_size,
    double sample_rate
);

// Spectral shape - computes 7 spectral descriptors per frame.
// out_features is flat: [returned_frames * 7]
// Descriptors: centroid, spread, skewness, kurtosis, rolloff, flatness, crest
// Returns number of frames processed, or negative on error.
int flucoma_spectral_shape(
    const float* audio, int num_frames,
    double* out_features, int max_output_frames,
    int window_size, int fft_size, int hop_size,
    double sample_rate,
    double min_freq, double max_freq,
    double rolloff_target, int log_freq, int use_power
);

// NMF decomposition.
// out_activations is flat: [rank * num_windows] where num_windows depends on FFT params.
// Returns number of windows (columns), or negative on error.
int flucoma_nmf(
    const float* audio, int num_frames,
    double* out_activations, int rank,
    int iterations, int fft_size, int hop_size, int window_size
);

// Normalization: fit + transform in one call.
// data is flat row-major: [num_rows * num_cols]
// out is flat row-major: [num_rows * num_cols]
// mode: 0=minmax, 1=standardize, 2=robust
// Returns 0 on success, negative on error.
int flucoma_normalize(
    const double* data, int num_rows, int num_cols,
    double* out, int mode
);

// KD-Tree: build from data and query nearest neighbors in one call.
// data is flat row-major: [num_points * num_dims]
// query is: [num_dims]
// out_indices: [k] indices of nearest neighbors
// out_distances: [k] squared distances
// Returns number of neighbors found (up to k), or negative on error.
int flucoma_kdtree_query(
    const double* data, int num_points, int num_dims,
    const double* query,
    int* out_indices, double* out_distances, int k
);

#ifdef __cplusplus
}
#endif

#endif // FLUCOMA_H
