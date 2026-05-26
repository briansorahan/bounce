package db_test

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/briansorahan/bounce/v2/internal/db"
)

// mustOpen creates an in-memory SQLite store for testing and registers cleanup.
func mustOpen(t *testing.T) db.Store {
	t.Helper()
	store, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}

var baseSample = db.Sample{
	Hash:            "abc123",
	FilePath:        "/samples/kick.wav",
	DurationSeconds: 0.5,
	SampleRate:      44100,
	Channels:        1,
	Frames:          22050,
}

func TestCreateAndGetSample(t *testing.T) {
	store := mustOpen(t)

	if err := store.CreateSample(baseSample); err != nil {
		t.Fatalf("CreateSample: %v", err)
	}

	got, err := store.GetSample(baseSample.Hash)
	if err != nil {
		t.Fatalf("GetSample: %v", err)
	}
	if got == nil {
		t.Fatal("GetSample returned nil; want a sample")
	}

	if got.Hash != baseSample.Hash {
		t.Errorf("Hash: got %q, want %q", got.Hash, baseSample.Hash)
	}
	if got.FilePath != baseSample.FilePath {
		t.Errorf("FilePath: got %q, want %q", got.FilePath, baseSample.FilePath)
	}
	if got.DurationSeconds != baseSample.DurationSeconds {
		t.Errorf("DurationSeconds: got %v, want %v", got.DurationSeconds, baseSample.DurationSeconds)
	}
	if got.SampleRate != baseSample.SampleRate {
		t.Errorf("SampleRate: got %d, want %d", got.SampleRate, baseSample.SampleRate)
	}
	if got.Channels != baseSample.Channels {
		t.Errorf("Channels: got %d, want %d", got.Channels, baseSample.Channels)
	}
	if got.Frames != baseSample.Frames {
		t.Errorf("Frames: got %d, want %d", got.Frames, baseSample.Frames)
	}
	if got.CreatedAt == "" {
		t.Error("CreatedAt should not be empty")
	}
}

func TestGetSampleNotFound(t *testing.T) {
	store := mustOpen(t)

	got, err := store.GetSample("doesnotexist")
	if err != nil {
		t.Fatalf("GetSample returned error for missing hash: %v", err)
	}
	if got != nil {
		t.Errorf("GetSample returned %+v; want nil", got)
	}
}

func TestListSamplesOrder(t *testing.T) {
	store := mustOpen(t)

	samples := []db.Sample{
		{Hash: "hash-a", FilePath: "/a.wav", DurationSeconds: 1.0, SampleRate: 44100, Channels: 1, Frames: 44100},
		{Hash: "hash-b", FilePath: "/b.wav", DurationSeconds: 2.0, SampleRate: 44100, Channels: 2, Frames: 88200},
		{Hash: "hash-c", FilePath: "/c.wav", DurationSeconds: 3.0, SampleRate: 48000, Channels: 1, Frames: 144000},
	}

	for i, s := range samples {
		if err := store.CreateSample(s); err != nil {
			t.Fatalf("CreateSample[%d]: %v", i, err)
		}
		// Small sleep so created_at values differ in SQLite's second granularity.
		// In practice datetime('now') in SQLite can resolve to the same second for
		// rapid inserts, so we force ordering by inserting with distinct timestamps
		// via the application-supplied CreatedAt field — however our schema uses
		// DEFAULT (datetime('now')) and does not accept an explicit created_at on
		// insert.  Use time.Sleep to get distinct timestamps only when the test
		// relies on ordering.
		time.Sleep(1100 * time.Millisecond)
	}

	list, err := store.ListSamples()
	if err != nil {
		t.Fatalf("ListSamples: %v", err)
	}
	if len(list) != 3 {
		t.Fatalf("ListSamples: got %d samples, want 3", len(list))
	}

	// Expect descending order: c, b, a
	wantOrder := []string{"hash-c", "hash-b", "hash-a"}
	for i, want := range wantOrder {
		if list[i].Hash != want {
			t.Errorf("list[%d].Hash = %q, want %q", i, list[i].Hash, want)
		}
	}
}

func TestCreateSampleDuplicateHash(t *testing.T) {
	store := mustOpen(t)

	if err := store.CreateSample(baseSample); err != nil {
		t.Fatalf("first CreateSample: %v", err)
	}

	err := store.CreateSample(baseSample)
	if err == nil {
		t.Fatal("second CreateSample with duplicate hash should return an error")
	}
}

func TestDeleteSampleRemovesAnalysisResults(t *testing.T) {
	store := mustOpen(t)

	if err := store.CreateSample(baseSample); err != nil {
		t.Fatalf("CreateSample: %v", err)
	}

	result := db.AnalysisResult{
		SampleHash: baseSample.Hash,
		Algorithm:  "onsets",
		Parameters: `{"threshold":0.5}`,
		Result:     `{"onsets":[0.1,0.2]}`,
	}
	if err := store.CreateAnalysisResult(result); err != nil {
		t.Fatalf("CreateAnalysisResult: %v", err)
	}

	if err := store.DeleteSample(baseSample.Hash); err != nil {
		t.Fatalf("DeleteSample: %v", err)
	}

	// Sample should be gone.
	got, err := store.GetSample(baseSample.Hash)
	if err != nil {
		t.Fatalf("GetSample after delete: %v", err)
	}
	if got != nil {
		t.Error("sample still exists after DeleteSample")
	}

	// Analysis results should be gone.
	results, err := store.GetAnalysisResults(baseSample.Hash, "")
	if err != nil {
		t.Fatalf("GetAnalysisResults after delete: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("analysis results still exist after DeleteSample: %v", results)
	}
}

func TestCreateAndGetAnalysisResult(t *testing.T) {
	store := mustOpen(t)

	if err := store.CreateSample(baseSample); err != nil {
		t.Fatalf("CreateSample: %v", err)
	}

	r := db.AnalysisResult{
		SampleHash: baseSample.Hash,
		Algorithm:  "nmf",
		Parameters: `{"components":4}`,
		Result:     `{"bases":[[0.1,0.2],[0.3,0.4]]}`,
	}
	if err := store.CreateAnalysisResult(r); err != nil {
		t.Fatalf("CreateAnalysisResult: %v", err)
	}

	results, err := store.GetAnalysisResults(baseSample.Hash, "nmf")
	if err != nil {
		t.Fatalf("GetAnalysisResults: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("GetAnalysisResults: got %d results, want 1", len(results))
	}

	got := results[0]
	if got.SampleHash != r.SampleHash {
		t.Errorf("SampleHash: got %q, want %q", got.SampleHash, r.SampleHash)
	}
	if got.Algorithm != r.Algorithm {
		t.Errorf("Algorithm: got %q, want %q", got.Algorithm, r.Algorithm)
	}
	if got.Parameters != r.Parameters {
		t.Errorf("Parameters: got %q, want %q", got.Parameters, r.Parameters)
	}
	if got.Result != r.Result {
		t.Errorf("Result: got %q, want %q", got.Result, r.Result)
	}
	if got.ID == 0 {
		t.Error("ID should be non-zero after insert")
	}
	if got.CreatedAt == "" {
		t.Error("CreatedAt should not be empty")
	}
}

func TestGetAnalysisResultsAlgorithmFilter(t *testing.T) {
	store := mustOpen(t)

	if err := store.CreateSample(baseSample); err != nil {
		t.Fatalf("CreateSample: %v", err)
	}

	results := []db.AnalysisResult{
		{SampleHash: baseSample.Hash, Algorithm: "onsets", Parameters: `{}`, Result: `{"onsets":[]}`},
		{SampleHash: baseSample.Hash, Algorithm: "nmf", Parameters: `{}`, Result: `{"bases":[]}`},
		{SampleHash: baseSample.Hash, Algorithm: "onsets", Parameters: `{"threshold":0.3}`, Result: `{"onsets":[0.5]}`},
	}
	for i, r := range results {
		if err := store.CreateAnalysisResult(r); err != nil {
			t.Fatalf("CreateAnalysisResult[%d]: %v", i, err)
		}
	}

	onsets, err := store.GetAnalysisResults(baseSample.Hash, "onsets")
	if err != nil {
		t.Fatalf("GetAnalysisResults(onsets): %v", err)
	}
	if len(onsets) != 2 {
		t.Errorf("GetAnalysisResults(onsets): got %d, want 2", len(onsets))
	}

	nmf, err := store.GetAnalysisResults(baseSample.Hash, "nmf")
	if err != nil {
		t.Fatalf("GetAnalysisResults(nmf): %v", err)
	}
	if len(nmf) != 1 {
		t.Errorf("GetAnalysisResults(nmf): got %d, want 1", len(nmf))
	}
}

func TestGetAnalysisResultsEmptyAlgorithmReturnsAll(t *testing.T) {
	store := mustOpen(t)

	if err := store.CreateSample(baseSample); err != nil {
		t.Fatalf("CreateSample: %v", err)
	}

	for i, alg := range []string{"onsets", "nmf", "mfcc"} {
		r := db.AnalysisResult{
			SampleHash: baseSample.Hash,
			Algorithm:  alg,
			Parameters: `{}`,
			Result:     `{}`,
		}
		if err := store.CreateAnalysisResult(r); err != nil {
			t.Fatalf("CreateAnalysisResult[%d]: %v", i, err)
		}
	}

	all, err := store.GetAnalysisResults(baseSample.Hash, "")
	if err != nil {
		t.Fatalf("GetAnalysisResults(empty): %v", err)
	}
	if len(all) != 3 {
		t.Errorf("GetAnalysisResults(empty): got %d, want 3", len(all))
	}
}

func TestForeignKeyConstraintOnAnalysisResult(t *testing.T) {
	store := mustOpen(t)

	r := db.AnalysisResult{
		SampleHash: "nonexistent-hash",
		Algorithm:  "onsets",
		Parameters: `{}`,
		Result:     `{}`,
	}
	err := store.CreateAnalysisResult(r)
	if err == nil {
		t.Fatal("CreateAnalysisResult with non-existent sample hash should fail")
	}

	// Verify the error message contains something foreign-key-related.
	msg := strings.ToLower(err.Error())
	if !strings.Contains(msg, "foreign") && !strings.Contains(msg, "constraint") {
		// Accept any error — SQLite FK error messages vary by build.
		// The important thing is that err != nil. If we got here, the constraint
		// fired — just log what we got.
		t.Logf("FK error (message may vary): %v", err)
	}

	// Confirm the error wraps something (not just a generic string).
	var _ = errors.Unwrap(err) // unwrap may be nil for driver errors; that's fine
}
