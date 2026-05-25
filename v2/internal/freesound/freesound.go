// Package freesound provides a minimal client for downloading sounds from the
// Freesound API (https://freesound.org/docs/api/).
package freesound

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

const defaultBaseURL = "https://freesound.org/apiv2"

// Client downloads sounds from the Freesound API.
type Client struct {
	token   string
	baseURL string
	http    *http.Client
}

// NewClient creates a Client authenticated with the given OAuth2 Bearer token.
func NewClient(token string) *Client {
	return &Client{
		token:   token,
		baseURL: defaultBaseURL,
		http:    &http.Client{},
	}
}

// Download fetches the sound identified by soundID and writes the raw audio
// bytes to destPath. Parent directories are created if they do not exist.
//
// Errors are returned when:
//   - token is empty
//   - the Freesound API returns a non-200 status (e.g. 401, 404)
//   - a network or I/O failure occurs
func (c *Client) Download(ctx context.Context, soundID int, destPath string) error {
	if c.token == "" {
		return fmt.Errorf("freesound: API token must not be empty")
	}

	url := fmt.Sprintf("%s/sounds/%d/download/", c.baseURL, soundID)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("freesound: building request for sound %d: %w", soundID, err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("freesound: downloading sound %d: %w", soundID, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("freesound: downloading sound %d: unexpected status %d %s",
			soundID, resp.StatusCode, http.StatusText(resp.StatusCode))
	}

	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return fmt.Errorf("freesound: creating directories for %q: %w", destPath, err)
	}

	f, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("freesound: creating file %q: %w", destPath, err)
	}
	defer f.Close()

	if _, err := io.Copy(f, resp.Body); err != nil {
		return fmt.Errorf("freesound: writing sound %d to %q: %w", soundID, destPath, err)
	}

	return nil
}
