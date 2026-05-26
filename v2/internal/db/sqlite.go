package db

import (
	"database/sql"
	"fmt"

	_ "github.com/mattn/go-sqlite3"
)

const schema = `
CREATE TABLE IF NOT EXISTS samples (
    hash             TEXT    PRIMARY KEY,
    file_path        TEXT    NOT NULL,
    duration_seconds REAL    NOT NULL,
    sample_rate      INTEGER NOT NULL,
    channels         INTEGER NOT NULL,
    frames           INTEGER NOT NULL,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analysis_results (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_hash TEXT    NOT NULL REFERENCES samples(hash),
    algorithm   TEXT    NOT NULL,
    parameters  TEXT    NOT NULL,
    result      TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analysis_sample    ON analysis_results(sample_hash);
CREATE INDEX IF NOT EXISTS idx_analysis_algorithm ON analysis_results(algorithm);
`

type sqliteStore struct {
	db *sql.DB
}

func openSQLite(path string) (*sqliteStore, error) {
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		return nil, fmt.Errorf("db: open %q: %w", path, err)
	}

	// Enable WAL mode and foreign-key enforcement.
	if _, err := db.Exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;`); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("db: set pragmas: %w", err)
	}

	if _, err := db.Exec(schema); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("db: migrate: %w", err)
	}

	return &sqliteStore{db: db}, nil
}

// Close closes the underlying database connection.
func (s *sqliteStore) Close() error {
	return s.db.Close()
}

// CreateSample inserts a new sample record.
func (s *sqliteStore) CreateSample(sample Sample) error {
	const q = `
INSERT INTO samples (hash, file_path, duration_seconds, sample_rate, channels, frames)
VALUES (?, ?, ?, ?, ?, ?)`
	_, err := s.db.Exec(q,
		sample.Hash,
		sample.FilePath,
		sample.DurationSeconds,
		sample.SampleRate,
		sample.Channels,
		sample.Frames,
	)
	if err != nil {
		return fmt.Errorf("db: CreateSample %q: %w", sample.Hash, err)
	}
	return nil
}

// GetSample retrieves a sample by hash. Returns nil, nil when not found.
func (s *sqliteStore) GetSample(hash string) (*Sample, error) {
	const q = `
SELECT hash, file_path, duration_seconds, sample_rate, channels, frames, created_at
FROM samples
WHERE hash = ?`

	row := s.db.QueryRow(q, hash)
	var sample Sample
	err := row.Scan(
		&sample.Hash,
		&sample.FilePath,
		&sample.DurationSeconds,
		&sample.SampleRate,
		&sample.Channels,
		&sample.Frames,
		&sample.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("db: GetSample %q: %w", hash, err)
	}
	return &sample, nil
}

// ListSamples returns all samples ordered by created_at desc.
func (s *sqliteStore) ListSamples() ([]Sample, error) {
	const q = `
SELECT hash, file_path, duration_seconds, sample_rate, channels, frames, created_at
FROM samples
ORDER BY created_at DESC`

	rows, err := s.db.Query(q)
	if err != nil {
		return nil, fmt.Errorf("db: ListSamples: %w", err)
	}
	defer rows.Close()

	var samples []Sample
	for rows.Next() {
		var sample Sample
		if err := rows.Scan(
			&sample.Hash,
			&sample.FilePath,
			&sample.DurationSeconds,
			&sample.SampleRate,
			&sample.Channels,
			&sample.Frames,
			&sample.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("db: ListSamples scan: %w", err)
		}
		samples = append(samples, sample)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("db: ListSamples rows: %w", err)
	}
	return samples, nil
}

// DeleteSample removes a sample and all its analysis results (cascade via DELETE).
func (s *sqliteStore) DeleteSample(hash string) error {
	// Foreign keys are ON so we delete analysis_results first, then the sample.
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("db: DeleteSample begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.Exec(`DELETE FROM analysis_results WHERE sample_hash = ?`, hash); err != nil {
		return fmt.Errorf("db: DeleteSample analysis_results: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM samples WHERE hash = ?`, hash); err != nil {
		return fmt.Errorf("db: DeleteSample samples: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("db: DeleteSample commit: %w", err)
	}
	return nil
}

// CreateAnalysisResult stores an analysis result for a sample.
func (s *sqliteStore) CreateAnalysisResult(r AnalysisResult) error {
	const q = `
INSERT INTO analysis_results (sample_hash, algorithm, parameters, result)
VALUES (?, ?, ?, ?)`
	_, err := s.db.Exec(q, r.SampleHash, r.Algorithm, r.Parameters, r.Result)
	if err != nil {
		return fmt.Errorf("db: CreateAnalysisResult sample=%q alg=%q: %w", r.SampleHash, r.Algorithm, err)
	}
	return nil
}

// GetAnalysisResults returns analysis results for a sample.
// When algorithm is empty all results for the sample are returned.
func (s *sqliteStore) GetAnalysisResults(sampleHash string, algorithm string) ([]AnalysisResult, error) {
	var (
		rows *sql.Rows
		err  error
	)
	if algorithm == "" {
		const q = `
SELECT id, sample_hash, algorithm, parameters, result, created_at
FROM analysis_results
WHERE sample_hash = ?
ORDER BY id`
		rows, err = s.db.Query(q, sampleHash)
	} else {
		const q = `
SELECT id, sample_hash, algorithm, parameters, result, created_at
FROM analysis_results
WHERE sample_hash = ? AND algorithm = ?
ORDER BY id`
		rows, err = s.db.Query(q, sampleHash, algorithm)
	}
	if err != nil {
		return nil, fmt.Errorf("db: GetAnalysisResults sample=%q alg=%q: %w", sampleHash, algorithm, err)
	}
	defer rows.Close()

	var results []AnalysisResult
	for rows.Next() {
		var r AnalysisResult
		if err := rows.Scan(&r.ID, &r.SampleHash, &r.Algorithm, &r.Parameters, &r.Result, &r.CreatedAt); err != nil {
			return nil, fmt.Errorf("db: GetAnalysisResults scan: %w", err)
		}
		results = append(results, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("db: GetAnalysisResults rows: %w", err)
	}
	return results, nil
}
