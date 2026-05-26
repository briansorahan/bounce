package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/briansorahan/bounce/v2/internal/audio"
)

func setupTestServer(t *testing.T) (*Server, func()) {
	t.Helper()
	eng, err := audio.NewEngine(true) // null backend
	if err != nil {
		t.Fatalf("failed to create engine: %v", err)
	}
	s := New(eng)
	return s, func() { eng.Shutdown() }
}

func TestHealth(t *testing.T) {
	s, cleanup := setupTestServer(t)
	defer cleanup()

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["status"] != "ok" {
		t.Errorf("expected status ok, got %s", resp["status"])
	}
}

func TestStatus_Initial(t *testing.T) {
	s, cleanup := setupTestServer(t)
	defer cleanup()

	req := httptest.NewRequest("GET", "/status", nil)
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var resp StatusResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Playing {
		t.Error("should not be playing initially")
	}
	if resp.TotalFrames != 0 {
		t.Errorf("expected 0 total frames, got %d", resp.TotalFrames)
	}
}

func TestPlay_WithoutLoad(t *testing.T) {
	s, cleanup := setupTestServer(t)
	defer cleanup()

	req := httptest.NewRequest("POST", "/play", nil)
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}

	var resp ErrorResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Error == "" {
		t.Error("expected error message")
	}
}

func TestStop_WithoutPlay(t *testing.T) {
	s, cleanup := setupTestServer(t)
	defer cleanup()

	req := httptest.NewRequest("POST", "/stop", nil)
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestLoad_EmptyPath(t *testing.T) {
	s, cleanup := setupTestServer(t)
	defer cleanup()

	body := `{"path": ""}`
	req := httptest.NewRequest("POST", "/load", strings.NewReader(body))
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestLoad_InvalidBody(t *testing.T) {
	s, cleanup := setupTestServer(t)
	defer cleanup()

	req := httptest.NewRequest("POST", "/load", strings.NewReader("not json"))
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestLoad_NonexistentFile(t *testing.T) {
	s, cleanup := setupTestServer(t)
	defer cleanup()

	body := `{"path": "/nonexistent/file.wav"}`
	req := httptest.NewRequest("POST", "/load", strings.NewReader(body))
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}
