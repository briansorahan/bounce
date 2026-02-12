#pragma once

#include "HISSTools_FFT/HISSTools_FFT.h"

namespace htl {

template<typename T>
using setup_type = typename std::conditional<
    std::is_same<T, double>::value,
    FFT_SETUP_D,
    FFT_SETUP_F
>::type;

template<typename T>
using split_type = typename std::conditional<
    std::is_same<T, double>::value,
    FFT_SPLIT_COMPLEX_D,
    FFT_SPLIT_COMPLEX_F
>::type;

inline void create_fft_setup(FFT_SETUP_D* setup, uintptr_t max_fft_log_2) {
    hisstools_create_setup(setup, max_fft_log_2);
}

inline void create_fft_setup(FFT_SETUP_F* setup, uintptr_t max_fft_log_2) {
    hisstools_create_setup(setup, max_fft_log_2);
}

inline void destroy_fft_setup(FFT_SETUP_D setup) {
    hisstools_destroy_setup(setup);
}

inline void destroy_fft_setup(FFT_SETUP_F setup) {
    hisstools_destroy_setup(setup);
}

inline void rfft(FFT_SETUP_D setup, const double* input, FFT_SPLIT_COMPLEX_D* output,
                 uintptr_t in_length, uintptr_t log2n) {
    hisstools_rfft(setup, input, output, in_length, log2n);
}

inline void rfft(FFT_SETUP_F setup, const float* input, FFT_SPLIT_COMPLEX_F* output,
                 uintptr_t in_length, uintptr_t log2n) {
    hisstools_rfft(setup, input, output, in_length, log2n);
}

inline void rifft(FFT_SETUP_D setup, FFT_SPLIT_COMPLEX_D* input, double* output,
                  uintptr_t log2n) {
    hisstools_rifft(setup, input, output, log2n);
}

inline void rifft(FFT_SETUP_F setup, FFT_SPLIT_COMPLEX_F* input, float* output,
                  uintptr_t log2n) {
    hisstools_rifft(setup, input, output, log2n);
}

}

