package cmd

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/briansorahan/bounce/v2/internal/audio"
	"github.com/briansorahan/bounce/v2/internal/server"
	"github.com/spf13/cobra"
)

var servePort int

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the HTTP audio server",
	Long:  `Start the Bounce HTTP audio server that accepts playback and control requests.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		eng, err := audio.NewEngine(false)
		if err != nil {
			return fmt.Errorf("failed to initialize audio engine: %w", err)
		}
		defer eng.Shutdown()

		srv := server.New(eng)

		addr := fmt.Sprintf(":%d", servePort)
		ln, err := net.Listen("tcp", addr)
		if err != nil {
			return fmt.Errorf("failed to listen on %s: %w", addr, err)
		}

		fmt.Fprintf(cmd.OutOrStdout(), "bounce server listening on %s\n", ln.Addr().String())

		// Graceful shutdown on SIGINT/SIGTERM
		ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer stop()

		errCh := make(chan error, 1)
		go func() {
			errCh <- srv.Serve(ln)
		}()

		select {
		case <-ctx.Done():
			fmt.Fprintln(cmd.OutOrStdout(), "\nshutting down...")
			return srv.Shutdown(context.Background())
		case err := <-errCh:
			return err
		}
	},
}

func init() {
	serveCmd.Flags().IntVarP(&servePort, "port", "p", 7700, "port to listen on")
}
