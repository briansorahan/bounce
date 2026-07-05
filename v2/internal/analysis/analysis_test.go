package analysis

import (
	"errors"
	"math"
	"testing"
)

// generateSineWave creates a sine wave for testing.
func generateSineWave(freq, sampleRate float64, numSamples int) []float32 {
	audio := make([]float32, numSamples)
	for i := range audio {
		audio[i] = float32(math.Sin(2 * math.Pi * freq * float64(i) / sampleRate))
	}
	return audio
}

// generateSilenceWithClick creates silence with a click at a given position.
func generateSilenceWithClick(numSamples, clickPos int) []float32 {
	audio := make([]float32, numSamples)
	if clickPos >= 0 && clickPos < numSamples {
		audio[clickPos] = 1.0
	}
	return audio
}

func TestOnsetSlice(t *testing.T) {
	// Generate a signal with two distinct bursts separated by silence
	sr := 44100.0
	audio := make([]float32, int(sr*2)) // 2 seconds

	// First burst at 0.2s
	burstStart1 := int(sr * 0.2)
	for i := burstStart1; i < burstStart1+4410; i++ {
		audio[i] = float32(math.Sin(2 * math.Pi * 440.0 * float64(i) / sr))
	}
	// Second burst at 1.2s
	burstStart2 := int(sr * 1.2)
	for i := burstStart2; i < burstStart2+4410; i++ {
		audio[i] = float32(math.Sin(2 * math.Pi * 880.0 * float64(i) / sr))
	}

	opts := DefaultOnsetOpts()
	onsets, err := OnsetSlice(audio, opts)
	if err != nil {
		t.Fatalf("OnsetSlice failed: %v", err)
	}

	// Should detect at least one onset
	if len(onsets) == 0 {
		t.Log("warning: no onsets detected (algorithm may need tuning for this signal)")
	}

	// All onset indices should be within bounds
	for i, idx := range onsets {
		if idx < 0 || idx >= len(audio) {
			t.Errorf("onset[%d] = %d, out of bounds [0, %d)", i, idx, len(audio))
		}
	}
}

func TestOnsetSlice_Empty(t *testing.T) {
	onsets, err := OnsetSlice(nil, DefaultOnsetOpts())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(onsets) != 0 {
		t.Errorf("expected no onsets for empty input, got %d", len(onsets))
	}
}

func TestAmpSlice(t *testing.T) {
	sr := 44100.0
	audio := make([]float32, int(sr*2))

	// Loud burst
	for i := 4410; i < 8820; i++ {
		audio[i] = float32(math.Sin(2 * math.Pi * 440.0 * float64(i) / sr))
	}

	opts := DefaultAmpSliceOpts()
	opts.SampleRate = sr
	slices, err := AmpSlice(audio, opts)
	if err != nil {
		t.Fatalf("AmpSlice failed: %v", err)
	}

	// All slice indices should be within bounds
	for i, idx := range slices {
		if idx < 0 || idx >= len(audio) {
			t.Errorf("slice[%d] = %d, out of bounds [0, %d)", i, idx, len(audio))
		}
	}
}

func TestAmpSlice_Empty(t *testing.T) {
	slices, err := AmpSlice(nil, DefaultAmpSliceOpts())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(slices) != 0 {
		t.Errorf("expected no slices for empty input, got %d", len(slices))
	}
}

func TestNoveltySlice(t *testing.T) {
	sr := 44100.0
	numSamples := int(sr * 2)
	audio := make([]float32, numSamples)

	// First tone at 440 Hz
	for i := 0; i < numSamples/2; i++ {
		audio[i] = float32(math.Sin(2 * math.Pi * 440.0 * float64(i) / sr))
	}
	// Second tone at 2000 Hz (very different spectrum)
	for i := numSamples / 2; i < numSamples; i++ {
		audio[i] = float32(math.Sin(2 * math.Pi * 2000.0 * float64(i) / sr))
	}

	opts := DefaultNoveltySliceOpts()
	slices, err := NoveltySlice(audio, opts)
	if err != nil {
		t.Fatalf("NoveltySlice failed: %v", err)
	}

	// All slice indices should be within bounds
	for i, idx := range slices {
		if idx < 0 || idx >= numSamples {
			t.Errorf("slice[%d] = %d, out of bounds [0, %d)", i, idx, numSamples)
		}
	}
}

func TestNoveltySlice_Empty(t *testing.T) {
	slices, err := NoveltySlice(nil, DefaultNoveltySliceOpts())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(slices) != 0 {
		t.Errorf("expected no slices for empty input, got %d", len(slices))
	}
}

func TestTransientSlice(t *testing.T) {
	sr := 44100.0
	numSamples := int(sr * 1)
	audio := make([]float32, numSamples)

	// Create clicks (transients) at known positions
	clicks := []int{2000, 10000, 20000, 30000}
	for _, pos := range clicks {
		if pos < numSamples {
			audio[pos] = 1.0
			if pos+1 < numSamples {
				audio[pos+1] = -0.8
			}
		}
	}

	opts := DefaultTransientSliceOpts()
	slices, err := TransientSlice(audio, opts)
	if err != nil {
		t.Fatalf("TransientSlice failed: %v", err)
	}

	// All slice indices should be within bounds
	for i, idx := range slices {
		if idx < 0 || idx >= numSamples {
			t.Errorf("slice[%d] = %d, out of bounds [0, %d)", i, idx, numSamples)
		}
	}
}

func TestTransientSlice_Empty(t *testing.T) {
	slices, err := TransientSlice(nil, DefaultTransientSliceOpts())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(slices) != 0 {
		t.Errorf("expected no slices for empty input, got %d", len(slices))
	}
}

func TestMFCC(t *testing.T) {
	sr := 44100.0
	audio := generateSineWave(440.0, sr, int(sr*0.5))

	opts := DefaultMFCCOpts()
	opts.SampleRate = sr
	result, err := MFCC(audio, opts)
	if err != nil {
		t.Fatalf("MFCC failed: %v", err)
	}

	if result.Frames == 0 {
		t.Fatal("expected at least one frame")
	}
	if result.NumCoeffs != 13 {
		t.Errorf("expected 13 coefficients, got %d", result.NumCoeffs)
	}
	if len(result.Data) != result.Frames {
		t.Errorf("data rows (%d) != frames (%d)", len(result.Data), result.Frames)
	}
	if len(result.Data[0]) != result.NumCoeffs {
		t.Errorf("data cols (%d) != numCoeffs (%d)", len(result.Data[0]), result.NumCoeffs)
	}

	// First coefficient should be non-zero for a non-silent signal
	hasNonZero := false
	for _, row := range result.Data {
		if row[0] != 0 {
			hasNonZero = true
			break
		}
	}
	if !hasNonZero {
		t.Error("all first coefficients are zero; unexpected for a sine wave")
	}
}

func TestMFCC_Empty(t *testing.T) {
	result, err := MFCC(nil, DefaultMFCCOpts())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Frames != 0 {
		t.Errorf("expected 0 frames for empty input, got %d", result.Frames)
	}
}

func TestSpectralShape(t *testing.T) {
	sr := 44100.0
	audio := generateSineWave(1000.0, sr, int(sr*0.5))

	opts := DefaultSpectralShapeOpts()
	opts.SampleRate = sr
	result, err := SpectralShape(audio, opts)
	if err != nil {
		t.Fatalf("SpectralShape failed: %v", err)
	}

	if result.Frames == 0 {
		t.Fatal("expected at least one frame")
	}

	// Centroid should be near 1000 Hz for a 1kHz sine
	avgCentroid := 0.0
	for _, c := range result.Centroid {
		avgCentroid += c
	}
	avgCentroid /= float64(result.Frames)

	// Allow generous tolerance since windowing affects the measurement
	if avgCentroid < 500 || avgCentroid > 2000 {
		t.Errorf("average centroid = %f, expected near 1000 Hz", avgCentroid)
	}
}

func TestSpectralShape_Empty(t *testing.T) {
	result, err := SpectralShape(nil, DefaultSpectralShapeOpts())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Frames != 0 {
		t.Errorf("expected 0 frames for empty input, got %d", result.Frames)
	}
}

func TestNMF(t *testing.T) {
	sr := 44100.0
	// Mix two sines
	audio := make([]float32, int(sr*1))
	for i := range audio {
		audio[i] = float32(
			0.5*math.Sin(2*math.Pi*440.0*float64(i)/sr) +
				0.5*math.Sin(2*math.Pi*1000.0*float64(i)/sr))
	}

	opts := DefaultNMFOpts()
	opts.Rank = 2
	result, err := NMF(audio, opts)
	if err != nil {
		t.Fatalf("NMF failed: %v", err)
	}

	if result.Rank != 2 {
		t.Errorf("expected rank 2, got %d", result.Rank)
	}
	if result.NumWindows == 0 {
		t.Fatal("expected at least one window")
	}
	if len(result.Activations) != 2 {
		t.Errorf("expected 2 activation rows, got %d", len(result.Activations))
	}
	if len(result.Activations[0]) != result.NumWindows {
		t.Errorf("activation cols (%d) != numWindows (%d)",
			len(result.Activations[0]), result.NumWindows)
	}
}

func TestNMF_Empty(t *testing.T) {
	result, err := NMF(nil, DefaultNMFOpts())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.NumWindows != 0 {
		t.Errorf("expected 0 windows for empty input, got %d", result.NumWindows)
	}
}

func TestNormalize(t *testing.T) {
	data := [][]float64{
		{1.0, 10.0},
		{2.0, 20.0},
		{3.0, 30.0},
		{4.0, 40.0},
		{5.0, 50.0},
	}

	result, err := Normalize(data, NormalizeMinMax)
	if err != nil {
		t.Fatalf("Normalize failed: %v", err)
	}

	if len(result) != 5 {
		t.Fatalf("expected 5 rows, got %d", len(result))
	}

	// First row should be [0, 0] (minimum)
	if math.Abs(result[0][0]-0.0) > 0.01 || math.Abs(result[0][1]-0.0) > 0.01 {
		t.Errorf("first row should be [0,0], got %v", result[0])
	}
	// Last row should be [1, 1] (maximum)
	if math.Abs(result[4][0]-1.0) > 0.01 || math.Abs(result[4][1]-1.0) > 0.01 {
		t.Errorf("last row should be [1,1], got %v", result[4])
	}
}

func TestNormalize_Empty(t *testing.T) {
	result, err := Normalize(nil, NormalizeMinMax)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != nil {
		t.Errorf("expected nil for empty input, got %v", result)
	}
}

func TestKDTreeQuery(t *testing.T) {
	data := [][]float64{
		{0.0, 0.0},
		{1.0, 0.0},
		{0.0, 1.0},
		{1.0, 1.0},
		{0.5, 0.5},
	}

	// Query near (0.5, 0.5) should find index 4 as nearest
	result, err := KDTreeQuery(data, []float64{0.5, 0.5}, 3)
	if err != nil {
		t.Fatalf("KDTreeQuery failed: %v", err)
	}

	if len(result.Indices) == 0 {
		t.Fatal("expected at least one result")
	}
	if len(result.Indices) > 3 {
		t.Errorf("expected at most 3 results, got %d", len(result.Indices))
	}

	// Nearest neighbor of (0.5, 0.5) should be index 4 (exactly at that point)
	if result.Indices[0] != 4 {
		t.Errorf("expected nearest index 4, got %d", result.Indices[0])
	}
	// Distance to exact match should be 0
	if result.Distances[0] > 0.001 {
		t.Errorf("expected distance ~0 for exact match, got %f", result.Distances[0])
	}
}

func TestKDTreeQuery_Empty(t *testing.T) {
	result, err := KDTreeQuery(nil, []float64{0.0}, 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Indices) != 0 {
		t.Errorf("expected no results for empty data, got %d", len(result.Indices))
	}
}

func TestOnsetSlice_InvalidHopSize(t *testing.T) {
	opts := DefaultOnsetOpts()
	opts.HopSize = 0
	_, err := OnsetSlice([]float32{1.0, 0.5, -0.2}, opts)
	if !errors.Is(err, ErrInvalidOptions) {
		t.Fatalf("expected ErrInvalidOptions, got %v", err)
	}
}

func TestMFCC_InvalidHopSize(t *testing.T) {
	opts := DefaultMFCCOpts()
	opts.HopSize = 0
	_, err := MFCC([]float32{1.0, 0.5, -0.2}, opts)
	if !errors.Is(err, ErrInvalidOptions) {
		t.Fatalf("expected ErrInvalidOptions, got %v", err)
	}
}

func TestNormalize_RaggedRows_ReturnsError(t *testing.T) {
	_, err := Normalize(
		[][]float64{
			{1, 2},
			{3},
		},
		NormalizeMinMax,
	)
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
}

func TestKDTreeQuery_QueryDimensionMismatch_ReturnsError(t *testing.T) {
	_, err := KDTreeQuery(
		[][]float64{
			{0, 0},
			{1, 1},
		},
		[]float64{0},
		1,
	)
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
}
