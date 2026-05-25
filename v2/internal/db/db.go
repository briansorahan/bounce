// Package db provides the persistence layer for Bounce v2.
// It defines types and interfaces for storing sample metadata
// and analysis results in a SQLite database.
package db

// Sample represents an imported audio file's metadata.
type Sample struct {
	Hash            string
	FilePath        string
	DurationSeconds float64
	SampleRate      int
	Channels        int
	Frames          int
	CreatedAt       string
}

// AnalysisResult represents the output of running a FluCoMa algorithm.
type AnalysisResult struct {
	ID         int
	SampleHash string
	Algorithm  string
	Parameters string // JSON
	Result     string // JSON
	CreatedAt  string
}

// Store defines the persistence interface for Bounce.
type Store interface {
	// CreateSample inserts a new sample record.
	CreateSample(s Sample) error
	// GetSample retrieves a sample by its content hash.
	// Returns nil, nil when no sample exists with the given hash.
	GetSample(hash string) (*Sample, error)
	// ListSamples returns all samples ordered by created_at desc.
	ListSamples() ([]Sample, error)
	// DeleteSample removes a sample and its analysis results.
	DeleteSample(hash string) error

	// CreateAnalysisResult stores an analysis result for a sample.
	CreateAnalysisResult(r AnalysisResult) error
	// GetAnalysisResults returns all results for a sample, optionally filtered by
	// algorithm. When algorithm is empty all results for the sample are returned.
	GetAnalysisResults(sampleHash string, algorithm string) ([]AnalysisResult, error)

	// Close closes the database connection.
	Close() error
}

// Open opens (or creates) a SQLite database at the given path and runs migrations.
// Pass ":memory:" for an in-process, in-memory database (useful in tests).
func Open(path string) (Store, error) {
	return openSQLite(path)
}
