package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"

	"github.com/spf13/cobra"
)

var playServer string

var playCmd = &cobra.Command{
	Use:   "play <file>",
	Short: "Play an audio file",
	Long:  `Send a play request to the Bounce server for the given audio file.`,
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		absPath, err := filepath.Abs(args[0])
		if err != nil {
			return fmt.Errorf("failed to resolve path: %w", err)
		}

		// Load the file
		body, _ := json.Marshal(map[string]string{"path": absPath})
		resp, err := http.Post(playServer+"/load", "application/json", bytes.NewReader(body))
		if err != nil {
			return fmt.Errorf("failed to connect to server: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			msg, _ := io.ReadAll(resp.Body)
			return fmt.Errorf("load failed: %s", msg)
		}

		// Start playback
		resp, err = http.Post(playServer+"/play", "application/json", nil)
		if err != nil {
			return fmt.Errorf("failed to start playback: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			msg, _ := io.ReadAll(resp.Body)
			return fmt.Errorf("play failed: %s", msg)
		}

		fmt.Fprintf(cmd.OutOrStdout(), "playing %s\n", absPath)
		return nil
	},
}

func init() {
	playCmd.Flags().StringVarP(&playServer, "server", "s", "http://localhost:7700", "address of the Bounce server")
}
