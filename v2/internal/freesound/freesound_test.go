package freesound

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// audioBytes is a tiny stand-in for real audio data used across test cases.
var audioBytes = []byte("RIFF\x00\x00\x00\x00WAVEfmt ")

// ---- helpers ----------------------------------------------------------------

// newTestClient returns a Client wired to the given test server URL.
func newTestClient(token, serverURL string) *Client {
	return &Client{
		token:   token,
		baseURL: serverURL,
		http:    &http.Client{},
	}
}

// soundHandler returns an http.HandlerFunc that serves a single sound endpoint
// at the Freesound path pattern "/apiv2/sounds/{id}/download/".
// statusCode is the HTTP status to return; body is written only for 2xx replies.
func soundHandler(statusCode int, body []byte) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(statusCode)
		if statusCode == http.StatusOK {
			_, _ = w.Write(body)
		}
	}
}

// ---- tests ------------------------------------------------------------------

func TestDownload(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string

		// server setup
		serverStatus int
		serverBody   []byte

		// client / call config
		token   string
		soundID int

		// expectations
		wantErr     bool
		wantErrSubs []string // substrings that must appear in the error message
		wantContent []byte   // expected file content on success
	}{
		{
			name:         "successful download",
			serverStatus: http.StatusOK,
			serverBody:   audioBytes,
			token:        "valid-token",
			soundID:      12345,
			wantErr:      false,
			wantContent:  audioBytes,
		},
		{
			name:        "empty token returns error",
			token:       "",
			soundID:     12345,
			wantErr:     true,
			wantErrSubs: []string{"token", "empty"},
		},
		{
			name:         "404 returns descriptive error",
			serverStatus: http.StatusNotFound,
			token:        "valid-token",
			soundID:      99999,
			wantErr:      true,
			wantErrSubs:  []string{"99999", "404", "Not Found"},
		},
		{
			name:         "401 returns descriptive error",
			serverStatus: http.StatusUnauthorized,
			token:        "bad-token",
			soundID:      12345,
			wantErr:      true,
			wantErrSubs:  []string{"12345", "401", "Unauthorized"},
		},
		{
			name:         "creates parent directories",
			serverStatus: http.StatusOK,
			serverBody:   audioBytes,
			token:        "valid-token",
			soundID:      42,
			wantErr:      false,
			wantContent:  audioBytes,
			// destPath will be set to a nested subdir inside t.TempDir() below
		},
	}

	for _, tc := range tests {
		tc := tc // capture for parallel sub-test
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			// Build the mock server (skip when testing empty-token — no request
			// will ever be made, so no server is needed).
			var client *Client
			if tc.token == "" {
				client = NewClient("")
			} else {
				srv := httptest.NewServer(soundHandler(tc.serverStatus, tc.serverBody))
				t.Cleanup(srv.Close)
				client = newTestClient(tc.token, srv.URL)
			}

			// Determine destPath.
			base := t.TempDir()
			var destPath string
			if tc.name == "creates parent directories" {
				destPath = filepath.Join(base, "a", "b", "c", "sound.wav")
			} else {
				destPath = filepath.Join(base, "sound.wav")
			}

			err := client.Download(context.Background(), tc.soundID, destPath)

			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected an error but got nil")
				}
				for _, sub := range tc.wantErrSubs {
					if !strings.Contains(err.Error(), sub) {
						t.Errorf("error %q does not contain %q", err.Error(), sub)
					}
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			got, readErr := os.ReadFile(destPath)
			if readErr != nil {
				t.Fatalf("reading downloaded file: %v", readErr)
			}
			if string(got) != string(tc.wantContent) {
				t.Errorf("file content = %q, want %q", got, tc.wantContent)
			}
		})
	}
}

func TestDownload_NetworkError(t *testing.T) {
	t.Parallel()

	// Point the client at a server that has already been closed so every
	// request gets a connection-refused error.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	srv.Close() // close immediately

	client := newTestClient("valid-token", srv.URL)
	destPath := filepath.Join(t.TempDir(), "sound.wav")

	err := client.Download(context.Background(), 1, destPath)
	if err == nil {
		t.Fatal("expected a network error but got nil")
	}

	wantSubs := []string{"1", "downloading"}
	for _, sub := range wantSubs {
		if !strings.Contains(err.Error(), sub) {
			t.Errorf("error %q does not contain %q", err.Error(), sub)
		}
	}
}

func TestDownload_ContextCancelled(t *testing.T) {
	t.Parallel()

	// Server that blocks until the test completes, forcing context cancellation
	// to be the determining factor.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Block until the request context is cancelled.
		<-r.Context().Done()
	}))
	t.Cleanup(srv.Close)

	client := newTestClient("valid-token", srv.URL)
	destPath := filepath.Join(t.TempDir(), "sound.wav")

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	err := client.Download(ctx, 7, destPath)
	if err == nil {
		t.Fatal("expected a context-cancelled error but got nil")
	}

	wantSub := fmt.Sprintf("%d", 7)
	if !strings.Contains(err.Error(), wantSub) {
		t.Errorf("error %q does not contain sound ID %q", err.Error(), wantSub)
	}
}
