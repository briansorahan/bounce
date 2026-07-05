// Package analysis provides Go bindings to FluCoMa audio analysis algorithms.
//
// This package uses cgo to call the extern "C" wrappers in native/analysis/.
// Build the native library first: cd v2/native/analysis && make
package analysis

/*
#cgo CFLAGS: -I${SRCDIR}/../../native/analysis
#cgo LDFLAGS: -L${SRCDIR}/../../native/analysis -lflucoma -L${SRCDIR}/../../../third_party/memory/install/lib -lfoonathan_memory-0.7.4 -lstdc++ -lm
#cgo darwin LDFLAGS: -framework Accelerate
#include "flucoma.h"
#include <stdlib.h>
*/
import "C"
import (
	"errors"
	"fmt"
	"unsafe"
)

// ErrAnalysisFailed is returned when a FluCoMa algorithm encounters an error.
var (
	ErrAnalysisFailed = errors.New("analysis failed")
	ErrInvalidOptions = errors.New("invalid analysis options")
	ErrInvalidInput   = errors.New("invalid analysis input")
)

func invalidOptionsf(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalidOptions, fmt.Sprintf(format, args...))
}

func invalidInputf(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalidInput, fmt.Sprintf(format, args...))
}

func requirePositiveInt(name string, value int) error {
	if value <= 0 {
		return invalidOptionsf("%s must be > 0 (got %d)", name, value)
	}
	return nil
}

func requireNonNegativeInt(name string, value int) error {
	if value < 0 {
		return invalidOptionsf("%s must be >= 0 (got %d)", name, value)
	}
	return nil
}

func requirePositiveFloat(name string, value float64) error {
	if value <= 0 {
		return invalidOptionsf("%s must be > 0 (got %f)", name, value)
	}
	return nil
}

// OnsetOpts configures onset slice detection.
type OnsetOpts struct {
	Function       int     // Detection function (0=energy, 1=HFC, 2=spectral flux, etc.)
	Threshold      float64 // Detection threshold
	MinSliceLength int     // Minimum slice length in samples
	FilterSize     int     // Smoothing filter size
	FrameDelta     int     // Frame comparison delta
	WindowSize     int     // Analysis window size
	FFTSize        int     // FFT size
	HopSize        int     // Hop size
}

// DefaultOnsetOpts returns sensible defaults for onset detection.
func DefaultOnsetOpts() OnsetOpts {
	return OnsetOpts{
		Function:       0,
		Threshold:      0.5,
		MinSliceLength: 2,
		FilterSize:     5,
		FrameDelta:     0,
		WindowSize:     1024,
		FFTSize:        1024,
		HopSize:        512,
	}
}

// OnsetSlice detects onset positions in audio data.
// Returns sample indices where onsets are detected.
func OnsetSlice(audio []float32, opts OnsetOpts) ([]int, error) {
	if len(audio) == 0 {
		return nil, nil
	}
	if err := requireNonNegativeInt("Function", opts.Function); err != nil {
		return nil, err
	}
	if err := requireNonNegativeInt("MinSliceLength", opts.MinSliceLength); err != nil {
		return nil, err
	}
	if err := requireNonNegativeInt("FilterSize", opts.FilterSize); err != nil {
		return nil, err
	}
	if err := requireNonNegativeInt("FrameDelta", opts.FrameDelta); err != nil {
		return nil, err
	}
	if err := requirePositiveInt("WindowSize", opts.WindowSize); err != nil {
		return nil, err
	}
	if err := requirePositiveInt("FFTSize", opts.FFTSize); err != nil {
		return nil, err
	}
	if err := requirePositiveInt("HopSize", opts.HopSize); err != nil {
		return nil, err
	}

	maxOnsets := len(audio) / (opts.HopSize + 1)
	if maxOnsets < 64 {
		maxOnsets = 64
	}
	out := make([]C.int, maxOnsets)

	n := C.flucoma_onset_slice(
		(*C.float)(unsafe.Pointer(&audio[0])),
		C.int(len(audio)),
		&out[0], C.int(maxOnsets),
		C.int(opts.Function), C.double(opts.Threshold),
		C.int(opts.MinSliceLength), C.int(opts.FilterSize), C.int(opts.FrameDelta),
		C.int(opts.WindowSize), C.int(opts.FFTSize), C.int(opts.HopSize),
	)

	if n < 0 {
		return nil, ErrAnalysisFailed
	}

	result := make([]int, int(n))
	for i := 0; i < int(n); i++ {
		result[i] = int(out[i])
	}
	return result, nil
}

// AmpSliceOpts configures amplitude-based slice detection.
type AmpSliceOpts struct {
	FastRampUp     int
	FastRampDown   int
	SlowRampUp     int
	SlowRampDown   int
	OnThreshold    float64
	OffThreshold   float64
	Floor          float64
	MinSliceLength int
	HighPassFreq   float64
	SampleRate     float64
}

// DefaultAmpSliceOpts returns sensible defaults for amplitude slicing.
func DefaultAmpSliceOpts() AmpSliceOpts {
	return AmpSliceOpts{
		FastRampUp:     1,
		FastRampDown:   1,
		SlowRampUp:     100,
		SlowRampDown:   100,
		OnThreshold:    -12.0,
		OffThreshold:   -16.0,
		Floor:          -40.0,
		MinSliceLength: 2,
		HighPassFreq:   85.0,
		SampleRate:     44100.0,
	}
}

// AmpSlice detects slices using envelope following.
// Returns sample indices where amplitude slices occur.
func AmpSlice(audio []float32, opts AmpSliceOpts) ([]int, error) {
	if len(audio) == 0 {
		return nil, nil
	}
	if err := requireNonNegativeInt("FastRampUp", opts.FastRampUp); err != nil {
		return nil, err
	}
	if err := requireNonNegativeInt("FastRampDown", opts.FastRampDown); err != nil {
		return nil, err
	}
	if err := requireNonNegativeInt("SlowRampUp", opts.SlowRampUp); err != nil {
		return nil, err
	}
	if err := requireNonNegativeInt("SlowRampDown", opts.SlowRampDown); err != nil {
		return nil, err
	}
	if err := requireNonNegativeInt("MinSliceLength", opts.MinSliceLength); err != nil {
		return nil, err
	}
	if err := requirePositiveFloat("SampleRate", opts.SampleRate); err != nil {
		return nil, err
	}

	maxSlices := len(audio) / 64
	if maxSlices < 64 {
		maxSlices = 64
	}
	out := make([]C.int, maxSlices)

	n := C.flucoma_amp_slice(
		(*C.float)(unsafe.Pointer(&audio[0])),
		C.int(len(audio)),
		&out[0], C.int(maxSlices),
		C.int(opts.FastRampUp), C.int(opts.FastRampDown),
		C.int(opts.SlowRampUp), C.int(opts.SlowRampDown),
		C.double(opts.OnThreshold), C.double(opts.OffThreshold), C.double(opts.Floor),
		C.int(opts.MinSliceLength), C.double(opts.HighPassFreq), C.double(opts.SampleRate),
	)

	if n < 0 {
		return nil, ErrAnalysisFailed
	}

	result := make([]int, int(n))
	for i := 0; i < int(n); i++ {
		result[i] = int(out[i])
	}
	return result, nil
}

// NoveltySliceOpts configures spectral novelty slicing.
type NoveltySliceOpts struct {
	KernelSize     int
	Threshold      float64
	FilterSize     int
	MinSliceLength int
	WindowSize     int
	FFTSize        int
	HopSize        int
}

// DefaultNoveltySliceOpts returns sensible defaults for novelty slicing.
func DefaultNoveltySliceOpts() NoveltySliceOpts {
	return NoveltySliceOpts{
		KernelSize:     3,
		Threshold:      0.5,
		FilterSize:     1,
		MinSliceLength: 2,
		WindowSize:     1024,
		FFTSize:        1024,
		HopSize:        512,
	}
}

// NoveltySlice detects slices using spectral novelty.
// Returns sample indices where novelty slices occur.
func NoveltySlice(audio []float32, opts NoveltySliceOpts) ([]int, error) {
	if len(audio) == 0 {
		return nil, nil
	}
	if err := requirePositiveInt("KernelSize", opts.KernelSize); err != nil {
		return nil, err
	}
	if err := requireNonNegativeInt("FilterSize", opts.FilterSize); err != nil {
		return nil, err
	}
	if err := requireNonNegativeInt("MinSliceLength", opts.MinSliceLength); err != nil {
		return nil, err
	}
	if err := requirePositiveInt("WindowSize", opts.WindowSize); err != nil {
		return nil, err
	}
	if err := requirePositiveInt("FFTSize", opts.FFTSize); err != nil {
		return nil, err
	}
	if err := requirePositiveInt("HopSize", opts.HopSize); err != nil {
		return nil, err
	}

	maxSlices := len(audio) / (opts.HopSize + 1)
	if maxSlices < 64 {
		maxSlices = 64
	}
	out := make([]C.int, maxSlices)

	n := C.flucoma_novelty_slice(
		(*C.float)(unsafe.Pointer(&audio[0])),
		C.int(len(audio)),
		&out[0], C.int(maxSlices),
		C.int(opts.KernelSize), C.double(opts.Threshold), C.int(opts.FilterSize),
		C.int(opts.MinSliceLength), C.int(opts.WindowSize), C.int(opts.FFTSize), C.int(opts.HopSize),
	)

	if n < 0 {
		return nil, ErrAnalysisFailed
	}

	result := make([]int, int(n))
	for i := 0; i < int(n); i++ {
		result[i] = int(out[i])
	}
	return result, nil
}

// TransientSliceOpts configures transient detection.
type TransientSliceOpts struct {
	Order          int
	BlockSize      int
	PadSize        int
	Skew           float64
	ThreshFwd      float64
	ThreshBack     float64
	WindowSize     int
	ClumpLength    int
	MinSliceLength int
}

// DefaultTransientSliceOpts returns sensible defaults for transient slicing.
func DefaultTransientSliceOpts() TransientSliceOpts {
	return TransientSliceOpts{
		Order:          20,
		BlockSize:      256,
		PadSize:        128,
		Skew:           0.0,
		ThreshFwd:      2.0,
		ThreshBack:     1.1,
		WindowSize:     14,
		ClumpLength:    25,
		MinSliceLength: 1000,
	}
}

// TransientSlice detects transient boundaries.
// Returns sample indices where transients are detected.
func TransientSlice(audio []float32, opts TransientSliceOpts) ([]int, error) {
	if len(audio) == 0 {
		return nil, nil
	}
	if err := requirePositiveInt("Order", opts.Order); err != nil {
		return nil, err
	}
	if err := requirePositiveInt("BlockSize", opts.BlockSize); err != nil {
		return nil, err
	}
	if err := requireNonNegativeInt("PadSize", opts.PadSize); err != nil {
		return nil, err
	}
	if err := requirePositiveInt("WindowSize", opts.WindowSize); err != nil {
		return nil, err
	}
	if err := requireNonNegativeInt("ClumpLength", opts.ClumpLength); err != nil {
		return nil, err
	}
	if err := requireNonNegativeInt("MinSliceLength", opts.MinSliceLength); err != nil {
		return nil, err
	}

	maxSlices := len(audio) / (opts.BlockSize + 1)
	if maxSlices < 64 {
		maxSlices = 64
	}
	out := make([]C.int, maxSlices)

	n := C.flucoma_transient_slice(
		(*C.float)(unsafe.Pointer(&audio[0])),
		C.int(len(audio)),
		&out[0], C.int(maxSlices),
		C.int(opts.Order), C.int(opts.BlockSize), C.int(opts.PadSize),
		C.double(opts.Skew), C.double(opts.ThreshFwd), C.double(opts.ThreshBack),
		C.int(opts.WindowSize), C.int(opts.ClumpLength), C.int(opts.MinSliceLength),
	)

	if n < 0 {
		return nil, ErrAnalysisFailed
	}

	result := make([]int, int(n))
	for i := 0; i < int(n); i++ {
		result[i] = int(out[i])
	}
	return result, nil
}

// MFCCOpts configures MFCC extraction.
type MFCCOpts struct {
	NumCoeffs  int
	NumBands   int
	MinFreq    float64
	MaxFreq    float64
	WindowSize int
	FFTSize    int
	HopSize    int
	SampleRate float64
}

// DefaultMFCCOpts returns sensible defaults for MFCC extraction.
func DefaultMFCCOpts() MFCCOpts {
	return MFCCOpts{
		NumCoeffs:  13,
		NumBands:   40,
		MinFreq:    20.0,
		MaxFreq:    20000.0,
		WindowSize: 1024,
		FFTSize:    1024,
		HopSize:    512,
		SampleRate: 44100.0,
	}
}

// MFCCResult holds per-frame MFCC coefficients.
type MFCCResult struct {
	Frames    int         // Number of frames processed
	NumCoeffs int         // Number of coefficients per frame
	Data      [][]float64 // [frames][numCoeffs]
}

// MFCC computes Mel-frequency cepstral coefficients.
func MFCC(audio []float32, opts MFCCOpts) (*MFCCResult, error) {
	if len(audio) == 0 {
		return &MFCCResult{}, nil
	}
	if err := requirePositiveInt("NumCoeffs", opts.NumCoeffs); err != nil {
		return nil, err
	}
	if err := requirePositiveInt("NumBands", opts.NumBands); err != nil {
		return nil, err
	}
	if err := requirePositiveInt("WindowSize", opts.WindowSize); err != nil {
		return nil, err
	}
	if err := requirePositiveInt("FFTSize", opts.FFTSize); err != nil {
		return nil, err
	}
	if err := requirePositiveInt("HopSize", opts.HopSize); err != nil {
		return nil, err
	}
	if err := requirePositiveFloat("SampleRate", opts.SampleRate); err != nil {
		return nil, err
	}
	if opts.MinFreq < 0 {
		return nil, invalidOptionsf("MinFreq must be >= 0 (got %f)", opts.MinFreq)
	}
	if opts.MaxFreq <= opts.MinFreq {
		return nil, invalidOptionsf("MaxFreq must be greater than MinFreq (got %f <= %f)", opts.MaxFreq, opts.MinFreq)
	}

	maxFrames := (len(audio)-opts.WindowSize)/opts.HopSize + 1
	if maxFrames <= 0 {
		maxFrames = 1
	}

	out := make([]C.double, maxFrames*opts.NumCoeffs)

	n := C.flucoma_mfcc(
		(*C.float)(unsafe.Pointer(&audio[0])),
		C.int(len(audio)),
		&out[0], C.int(maxFrames),
		C.int(opts.NumCoeffs), C.int(opts.NumBands),
		C.double(opts.MinFreq), C.double(opts.MaxFreq),
		C.int(opts.WindowSize), C.int(opts.FFTSize), C.int(opts.HopSize),
		C.double(opts.SampleRate),
	)

	if n < 0 {
		return nil, ErrAnalysisFailed
	}

	frames := int(n)
	data := make([][]float64, frames)
	for i := 0; i < frames; i++ {
		row := make([]float64, opts.NumCoeffs)
		for j := 0; j < opts.NumCoeffs; j++ {
			row[j] = float64(out[i*opts.NumCoeffs+j])
		}
		data[i] = row
	}

	return &MFCCResult{
		Frames:    frames,
		NumCoeffs: opts.NumCoeffs,
		Data:      data,
	}, nil
}

// SpectralShapeOpts configures spectral shape analysis.
type SpectralShapeOpts struct {
	WindowSize    int
	FFTSize       int
	HopSize       int
	SampleRate    float64
	MinFreq       float64
	MaxFreq       float64 // -1 for Nyquist
	RolloffTarget float64 // Percentage (e.g. 95.0)
	LogFreq       bool
	UsePower      bool
}

// DefaultSpectralShapeOpts returns sensible defaults.
func DefaultSpectralShapeOpts() SpectralShapeOpts {
	return SpectralShapeOpts{
		WindowSize:    1024,
		FFTSize:       1024,
		HopSize:       512,
		SampleRate:    44100.0,
		MinFreq:       0.0,
		MaxFreq:       -1.0,
		RolloffTarget: 95.0,
		LogFreq:       false,
		UsePower:      false,
	}
}

// SpectralShapeResult holds per-frame spectral descriptors.
type SpectralShapeResult struct {
	Frames   int         // Number of frames processed
	Centroid []float64   // Spectral centroid per frame
	Spread   []float64   // Spectral spread per frame
	Skewness []float64   // Spectral skewness per frame
	Kurtosis []float64   // Spectral kurtosis per frame
	Rolloff  []float64   // Spectral rolloff per frame
	Flatness []float64   // Spectral flatness per frame
	Crest    []float64   // Spectral crest per frame
	Raw      [][]float64 // [frames][7] raw output
}

// SpectralShape computes 7 spectral descriptors per frame.
func SpectralShape(audio []float32, opts SpectralShapeOpts) (*SpectralShapeResult, error) {
	if len(audio) == 0 {
		return &SpectralShapeResult{}, nil
	}
	if err := requirePositiveInt("WindowSize", opts.WindowSize); err != nil {
		return nil, err
	}
	if err := requirePositiveInt("FFTSize", opts.FFTSize); err != nil {
		return nil, err
	}
	if err := requirePositiveInt("HopSize", opts.HopSize); err != nil {
		return nil, err
	}
	if err := requirePositiveFloat("SampleRate", opts.SampleRate); err != nil {
		return nil, err
	}
	if opts.MinFreq < 0 {
		return nil, invalidOptionsf("MinFreq must be >= 0 (got %f)", opts.MinFreq)
	}
	if opts.MaxFreq != -1 && opts.MaxFreq <= opts.MinFreq {
		return nil, invalidOptionsf("MaxFreq must be -1 or greater than MinFreq (got %f <= %f)", opts.MaxFreq, opts.MinFreq)
	}
	if opts.RolloffTarget <= 0 || opts.RolloffTarget > 100 {
		return nil, invalidOptionsf("RolloffTarget must be within (0, 100] (got %f)", opts.RolloffTarget)
	}

	maxFrames := (len(audio)-opts.WindowSize)/opts.HopSize + 1
	if maxFrames <= 0 {
		maxFrames = 1
	}

	out := make([]C.double, maxFrames*7)

	logFreq := 0
	if opts.LogFreq {
		logFreq = 1
	}
	usePower := 0
	if opts.UsePower {
		usePower = 1
	}

	n := C.flucoma_spectral_shape(
		(*C.float)(unsafe.Pointer(&audio[0])),
		C.int(len(audio)),
		&out[0], C.int(maxFrames),
		C.int(opts.WindowSize), C.int(opts.FFTSize), C.int(opts.HopSize),
		C.double(opts.SampleRate),
		C.double(opts.MinFreq), C.double(opts.MaxFreq),
		C.double(opts.RolloffTarget), C.int(logFreq), C.int(usePower),
	)

	if n < 0 {
		return nil, ErrAnalysisFailed
	}

	frames := int(n)
	result := &SpectralShapeResult{
		Frames:   frames,
		Centroid: make([]float64, frames),
		Spread:   make([]float64, frames),
		Skewness: make([]float64, frames),
		Kurtosis: make([]float64, frames),
		Rolloff:  make([]float64, frames),
		Flatness: make([]float64, frames),
		Crest:    make([]float64, frames),
		Raw:      make([][]float64, frames),
	}

	for i := 0; i < frames; i++ {
		row := make([]float64, 7)
		for j := 0; j < 7; j++ {
			row[j] = float64(out[i*7+j])
		}
		result.Raw[i] = row
		result.Centroid[i] = row[0]
		result.Spread[i] = row[1]
		result.Skewness[i] = row[2]
		result.Kurtosis[i] = row[3]
		result.Rolloff[i] = row[4]
		result.Flatness[i] = row[5]
		result.Crest[i] = row[6]
	}

	return result, nil
}

// NMFOpts configures NMF decomposition.
type NMFOpts struct {
	Rank       int
	Iterations int
	FFTSize    int
	HopSize    int
	WindowSize int
}

// DefaultNMFOpts returns sensible defaults for NMF.
func DefaultNMFOpts() NMFOpts {
	return NMFOpts{
		Rank:       2,
		Iterations: 100,
		FFTSize:    1024,
		HopSize:    512,
		WindowSize: 1024,
	}
}

// NMFResult holds NMF decomposition activations.
type NMFResult struct {
	Rank        int         // Number of components
	NumWindows  int         // Number of time windows
	Activations [][]float64 // [rank][numWindows]
}

// NMF computes Non-negative Matrix Factorization.
func NMF(audio []float32, opts NMFOpts) (*NMFResult, error) {
	if len(audio) == 0 {
		return &NMFResult{}, nil
	}
	if err := requirePositiveInt("Rank", opts.Rank); err != nil {
		return nil, err
	}
	if err := requirePositiveInt("Iterations", opts.Iterations); err != nil {
		return nil, err
	}
	if err := requirePositiveInt("FFTSize", opts.FFTSize); err != nil {
		return nil, err
	}

	hopSize := opts.HopSize
	if hopSize <= 0 {
		hopSize = opts.FFTSize / 2
	}
	if err := requirePositiveInt("HopSize", hopSize); err != nil {
		return nil, err
	}
	windowSize := opts.WindowSize
	if windowSize <= 0 {
		windowSize = opts.FFTSize
	}
	if err := requirePositiveInt("WindowSize", windowSize); err != nil {
		return nil, err
	}

	estimatedWindows := (len(audio) + hopSize) / hopSize
	out := make([]C.double, opts.Rank*estimatedWindows)

	n := C.flucoma_nmf(
		(*C.float)(unsafe.Pointer(&audio[0])),
		C.int(len(audio)),
		&out[0], C.int(opts.Rank),
		C.int(opts.Iterations), C.int(opts.FFTSize), C.int(hopSize), C.int(windowSize),
	)

	if n < 0 {
		return nil, ErrAnalysisFailed
	}

	numWindows := int(n)
	activations := make([][]float64, opts.Rank)
	for r := 0; r < opts.Rank; r++ {
		row := make([]float64, numWindows)
		for w := 0; w < numWindows; w++ {
			row[w] = float64(out[r*numWindows+w])
		}
		activations[r] = row
	}

	return &NMFResult{
		Rank:        opts.Rank,
		NumWindows:  numWindows,
		Activations: activations,
	}, nil
}

// NormalizeMode determines the normalization method.
type NormalizeMode int

const (
	NormalizeMinMax      NormalizeMode = 0 // Scale to [0, 1]
	NormalizeStandardize NormalizeMode = 1 // Scale to [-1, 1]
	NormalizeRobust      NormalizeMode = 2 // Robust scaling to [0, 1]
)

// Normalize applies normalization to a 2D dataset (row-major).
func Normalize(data [][]float64, mode NormalizeMode) ([][]float64, error) {
	if len(data) == 0 {
		return nil, nil
	}

	numRows := len(data)
	numCols := len(data[0])
	for i := 0; i < numRows; i++ {
		if len(data[i]) != numCols {
			return nil, invalidInputf("row %d has %d columns, expected %d", i, len(data[i]), numCols)
		}
	}
	if numCols == 0 {
		return nil, nil
	}
	if mode < NormalizeMinMax || mode > NormalizeRobust {
		return nil, invalidOptionsf("mode must be one of %d, %d, %d (got %d)", NormalizeMinMax, NormalizeStandardize, NormalizeRobust, mode)
	}

	flat := make([]C.double, numRows*numCols)
	for i := 0; i < numRows; i++ {
		for j := 0; j < numCols; j++ {
			flat[i*numCols+j] = C.double(data[i][j])
		}
	}

	out := make([]C.double, numRows*numCols)

	rc := C.flucoma_normalize(
		&flat[0], C.int(numRows), C.int(numCols),
		&out[0], C.int(mode),
	)

	if rc < 0 {
		return nil, ErrAnalysisFailed
	}

	result := make([][]float64, numRows)
	for i := 0; i < numRows; i++ {
		row := make([]float64, numCols)
		for j := 0; j < numCols; j++ {
			row[j] = float64(out[i*numCols+j])
		}
		result[i] = row
	}
	return result, nil
}

// KNNResult holds k-nearest-neighbor query results.
type KNNResult struct {
	Indices   []int     // Indices of nearest neighbors
	Distances []float64 // Squared distances to nearest neighbors
}

// KDTreeQuery builds a KD-tree from data and queries for k nearest neighbors.
// data is row-major: [numPoints][numDims]. query is [numDims].
func KDTreeQuery(data [][]float64, query []float64, k int) (*KNNResult, error) {
	if len(data) == 0 || len(query) == 0 || k <= 0 {
		return &KNNResult{}, nil
	}

	numPoints := len(data)
	numDims := len(data[0])
	for i := 0; i < numPoints; i++ {
		if len(data[i]) != numDims {
			return nil, invalidInputf("row %d has %d dimensions, expected %d", i, len(data[i]), numDims)
		}
	}
	if numDims == 0 {
		return &KNNResult{}, nil
	}
	if len(query) != numDims {
		return nil, invalidInputf("query has %d dimensions, expected %d", len(query), numDims)
	}
	if k > numPoints {
		k = numPoints
	}

	flat := make([]C.double, numPoints*numDims)
	for i := 0; i < numPoints; i++ {
		for j := 0; j < numDims; j++ {
			flat[i*numDims+j] = C.double(data[i][j])
		}
	}

	queryC := make([]C.double, numDims)
	for j := 0; j < numDims; j++ {
		queryC[j] = C.double(query[j])
	}

	outIndices := make([]C.int, k)
	outDistances := make([]C.double, k)

	n := C.flucoma_kdtree_query(
		&flat[0], C.int(numPoints), C.int(numDims),
		&queryC[0],
		&outIndices[0], &outDistances[0], C.int(k),
	)

	if n < 0 {
		return nil, ErrAnalysisFailed
	}

	count := int(n)
	result := &KNNResult{
		Indices:   make([]int, count),
		Distances: make([]float64, count),
	}
	for i := 0; i < count; i++ {
		result.Indices[i] = int(outIndices[i])
		result.Distances[i] = float64(outDistances[i])
	}
	return result, nil
}
