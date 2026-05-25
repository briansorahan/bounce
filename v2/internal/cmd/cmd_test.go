package cmd_test

import (
	"bytes"
	"strings"
	"testing"

	"github.com/briansorahan/bounce/v2/internal/cmd"
	"github.com/spf13/cobra"
)

// newRoot returns a fresh root command tree for each test, preventing flag
// re-registration errors that would occur if the package-level rootCmd were
// reused across tests.
func newRoot() *cobra.Command {
	root := &cobra.Command{
		Use:   "bounce",
		Short: "Bounce — audio analysis and playback CLI",
	}

	serve := &cobra.Command{
		Use:  "serve",
		RunE: func(c *cobra.Command, args []string) error { return nil },
	}
	serve.Flags().IntP("port", "p", 7700, "port to listen on")

	play := &cobra.Command{
		Use:  "play <file>",
		Args: cobra.ExactArgs(1),
		RunE: func(c *cobra.Command, args []string) error { return nil },
	}
	play.Flags().StringP("server", "s", "http://localhost:7700", "address of the Bounce server")

	stop := &cobra.Command{
		Use:  "stop",
		RunE: func(c *cobra.Command, args []string) error { return nil },
	}
	stop.Flags().StringP("server", "s", "http://localhost:7700", "address of the Bounce server")

	analyze := &cobra.Command{
		Use:   "analyze",
		Short: "Analyze audio files",
	}
	for _, sub := range []string{"onset", "amplitude", "novelty", "transient", "mfcc", "spectral", "nmf"} {
		name := sub
		sc := &cobra.Command{
			Use:  name + " <file>",
			Args: cobra.ExactArgs(1),
			RunE: func(c *cobra.Command, args []string) error { return nil },
		}
		analyze.AddCommand(sc)
	}

	normalize := &cobra.Command{
		Use:  "normalize <file>",
		Args: cobra.ExactArgs(1),
		RunE: func(c *cobra.Command, args []string) error { return nil },
	}

	version := &cobra.Command{
		Use: "version",
		RunE: func(c *cobra.Command, args []string) error {
			c.Print(cmd.Version)
			return nil
		},
	}

	root.AddCommand(serve, play, stop, analyze, normalize, version)
	return root
}

// execute runs args against a fresh cobra tree and returns stdout, stderr, and error.
func execute(args ...string) (string, string, error) {
	root := newRoot()
	var stdout, stderr bytes.Buffer
	root.SetOut(&stdout)
	root.SetErr(&stderr)
	root.SetArgs(args)
	err := root.Execute()
	return stdout.String(), stderr.String(), err
}

func TestRootNoArgs_PrintsUsage(t *testing.T) {
	stdout, _, err := execute()
	if err != nil {
		t.Fatalf("expected no error for bare bounce, got: %v", err)
	}
	if !strings.Contains(stdout, "Usage:") {
		t.Errorf("expected usage in stdout, got: %q", stdout)
	}
}

func TestVersion_PrintsVersionString(t *testing.T) {
	stdout, _, err := execute("version")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(stdout, cmd.Version) {
		t.Errorf("expected version %q in output, got: %q", cmd.Version, stdout)
	}
}

func TestAnalyzeNoSubcommand_PrintsHelp(t *testing.T) {
	stdout, _, err := execute("analyze")
	if err != nil {
		t.Fatalf("expected no error for 'bounce analyze' with no subcommand, got: %v", err)
	}
	if !strings.Contains(stdout, "Usage:") {
		t.Errorf("expected usage in stdout, got: %q", stdout)
	}
}

func TestAnalyzeOnset_NoFile_ReturnsError(t *testing.T) {
	_, _, err := execute("analyze", "onset")
	if err == nil {
		t.Fatal("expected error when no file arg is given to 'bounce analyze onset'")
	}
}

func TestPlay_NoFile_ReturnsError(t *testing.T) {
	_, _, err := execute("play")
	if err == nil {
		t.Fatal("expected error when no file arg is given to 'bounce play'")
	}
}

func TestUnknownCommand_ReturnsError(t *testing.T) {
	_, _, err := execute("frobnicator")
	if err == nil {
		t.Fatal("expected error for unknown command")
	}
}
