package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var normalizeCmd = &cobra.Command{
	Use:   "normalize <file>",
	Short: "Normalize an audio file",
	Long:  `Normalize the amplitude of an audio file to a standard level.`,
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return fmt.Errorf("not implemented")
	},
}
