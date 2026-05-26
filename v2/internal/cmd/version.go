package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

const Version = "v2.0.0-dev"

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print the Bounce version",
	Long:  `Print the current version of the Bounce CLI.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Println(Version)
		return nil
	},
}
