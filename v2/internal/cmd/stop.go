package cmd

import (
	"fmt"
	"io"
	"net/http"

	"github.com/spf13/cobra"
)

var stopServer string

var stopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop playback",
	Long:  `Send a stop request to the Bounce server to halt current playback.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		resp, err := http.Post(stopServer+"/stop", "application/json", nil)
		if err != nil {
			return fmt.Errorf("failed to connect to server: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			msg, _ := io.ReadAll(resp.Body)
			return fmt.Errorf("stop failed: %s", msg)
		}

		fmt.Fprintln(cmd.OutOrStdout(), "stopped")
		return nil
	},
}

func init() {
	stopCmd.Flags().StringVarP(&stopServer, "server", "s", "http://localhost:7700", "address of the Bounce server")
}
