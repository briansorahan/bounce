// Package server implements the bounce HTTP server for audio playback.
package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"sync"

	"github.com/briansorahan/bounce/v2/internal/audio"
)

// Server is the bounce audio server.
type Server struct {
	engine *audio.Engine
	mux    *http.ServeMux
	srv    *http.Server
	mu     sync.Mutex
}

// StatusResponse is returned by the /status endpoint.
type StatusResponse struct {
	Playing    bool  `json:"playing"`
	Position   int64 `json:"position"`
	TotalFrames int64 `json:"total_frames"`
	SampleRate int   `json:"sample_rate"`
	Channels   int   `json:"channels"`
}

// ErrorResponse is returned on error.
type ErrorResponse struct {
	Error string `json:"error"`
}

// New creates a new server with the given audio engine.
func New(engine *audio.Engine) *Server {
	s := &Server{engine: engine}
	s.mux = http.NewServeMux()
	s.mux.HandleFunc("POST /play", s.handlePlay)
	s.mux.HandleFunc("POST /stop", s.handleStop)
	s.mux.HandleFunc("POST /load", s.handleLoad)
	s.mux.HandleFunc("GET /status", s.handleStatus)
	s.mux.HandleFunc("GET /health", s.handleHealth)
	return s
}

// ListenAndServe starts the server on the given address.
func (s *Server) ListenAndServe(addr string) error {
	s.srv = &http.Server{
		Addr:    addr,
		Handler: s.mux,
	}
	return s.srv.ListenAndServe()
}

// Serve starts the server on the given listener.
func (s *Server) Serve(ln net.Listener) error {
	s.srv = &http.Server{Handler: s.mux}
	return s.srv.Serve(ln)
}

// Shutdown gracefully shuts down the server.
func (s *Server) Shutdown(ctx context.Context) error {
	if s.srv != nil {
		return s.srv.Shutdown(ctx)
	}
	return nil
}

// Handler returns the HTTP handler (useful for testing).
func (s *Server) Handler() http.Handler {
	return s.mux
}

func (s *Server) handlePlay(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.engine.Play(); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "playing"})
}

func (s *Server) handleStop(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.engine.Stop(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "stopped"})
}

type loadRequest struct {
	Path string `json:"path"`
}

func (s *Server) handleLoad(w http.ResponseWriter, r *http.Request) {
	var req loadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Path == "" {
		writeError(w, http.StatusBadRequest, "path is required")
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.engine.Load(req.Path); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("failed to load: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":       "loaded",
		"total_frames": s.engine.TotalFrames(),
		"sample_rate":  s.engine.SampleRate(),
		"channels":     s.engine.Channels(),
	})
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	resp := StatusResponse{
		Playing:     s.engine.IsPlaying(),
		Position:    s.engine.Position(),
		TotalFrames: s.engine.TotalFrames(),
		SampleRate:  s.engine.SampleRate(),
		Channels:    s.engine.Channels(),
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, ErrorResponse{Error: msg})
}
