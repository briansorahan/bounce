# Bounce v2

Go CLI for audio corpus analysis and playback, powered by FluCoMa and miniaudio.

See [../REWRITE.md](../REWRITE.md) for the full design rationale and [DOMAIN.md](DOMAIN.md) for
the domain model.

## Prerequisites

- Go 1.24+
- C++17 compiler (clang or gcc)
- CMake (for FluCoMa dependencies)
- `FREESOUND_API_KEY` environment variable (for tests that download fixtures)

## Build

The project has two native C++ libraries that must be built before the Go binary.
`make build` handles everything:

```bash
cd v2
make build
```

This runs `make` in `native/analysis/` and `native/engine/`, then compiles the Go
binary with cgo.

### Rebuilding after C++ changes

Go's cgo build cache does **not** track changes to external `.a` files linked via
`-L`/`-l` flags. If you modify C++ source in `native/`, you must force a cgo
relink:

```bash
make rebuild
```

This passes `-a` to `go build`, which forces all packages (including cgo) to
recompile and relink against the updated `.a` files. A plain `make build` may
silently use the stale cached object.

## Test

```bash
cd v2
make test
```

Tests run identically on a developer laptop and in CI. No Docker, no special setup.
The `FREESOUND_API_KEY` env var must be set for tests that download audio fixtures.

## Run

Start the audio server:

```bash
./bounce serve
```

In another terminal, use CLI commands:

```bash
./bounce play kick.wav
./bounce stop
./bounce analyze onset kick.wav
./bounce analyze mfcc kick.wav
```

## Lint

```bash
cd v2
make lint
```

## Project Structure

```
v2/
├── cmd/bounce/          # CLI entry point
├── internal/
│   ├── analysis/        # FluCoMa analysis (Go + cgo)
│   ├── audio/           # Audio engine bindings (Go + cgo)
│   ├── cmd/             # Cobra CLI command definitions
│   ├── db/              # SQLite metadata storage
│   ├── freesound/       # Freesound API client
│   └── server/          # HTTP server for audio playback
├── native/
│   ├── analysis/        # FluCoMa C++ extern "C" wrappers → libflucoma.a
│   └── engine/          # miniaudio C++ audio engine → libengine.a
├── testdata/.cache/     # Downloaded test fixtures (gitignored)
├── DOMAIN.md            # Domain model and ubiquitous language
├── go.mod
└── Makefile
```
