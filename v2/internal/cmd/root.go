package cmd

import (
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "bounce",
	Short: "Bounce — audio analysis and playback CLI",
	Long: `Bounce is a CLI tool for audio analysis and playback.

It can serve audio files over HTTP, play them back, slice them by
onsets or other features, and extract spectral descriptors.`,
}

// Execute runs the root command. Call this from main.
func Execute() error {
	return rootCmd.Execute()
}

func init() {
	rootCmd.AddCommand(serveCmd)
	rootCmd.AddCommand(playCmd)
	rootCmd.AddCommand(stopCmd)
	rootCmd.AddCommand(analyzeCmd)
	rootCmd.AddCommand(normalizeCmd)
	rootCmd.AddCommand(versionCmd)
}
