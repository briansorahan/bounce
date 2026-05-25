# Bounce v2 Rewrite

## Why Rewrite

Bounce v1 is an Electron desktop app written in TypeScript with C++ native addons. After sustained
development, three pain points have made the project difficult to maintain:

1. **The maintainer is not a GUI or TypeScript developer.** Electron, xterm.js, and the renderer
   process add complexity that doesn't match the maintainer's strengths. The maintainer is most
   productive with CLI tools and systems programming.

2. **The codebase does not set AI coding agents up for success.** The TypeScript/Electron
   architecture — three-process model, dual IPC layers (legacy handlers + new service/RPC layer),
   native addon rebuilds, and complex build pipeline — causes AI agents to frequently break the
   build and struggle to recover. Test infrastructure is insufficient to catch regressions before
   they reach the user.

3. **Scope creep.** The roadmap has grown to include tutorials, live-coding, Ableton Link,
   Freesound integration, scripts, 3D corpus maps, and more. The core product — audio analysis,
   playback, and corpus tools — needs to be executed extremely well before expanding scope.

## Domain-Driven Design

Bounce v2 uses domain-driven design (DDD) to maintain clarity about what concepts exist, where
code belongs, and how different parts of the system relate. This is not the full Eric Evans
treatment — it is a lightweight application of DDD's most valuable ideas.

### Why DDD

1. **Bounded contexts map to Go packages.** `internal/analysis/`, `internal/audio/`,
   `internal/corpus/` are bounded contexts with explicit interfaces. The package structure IS the
   context map.

2. **Ubiquitous language becomes the CLI vocabulary.** The same terms appear in the CLI commands,
   Go types, database schema, and documentation. AI agents and humans share one vocabulary. No
   ambiguity about whether something is a "sample", "sound", "file", or "clip."

3. **Answers "where does this go?"** When a new feature arrives, the domain model provides a
   principled answer about which package owns it. This prevents the scope creep and architectural
   erosion that plagued v1.

### Living Documentation

A single file — `v2/DOMAIN.md` — defines:

- **Bounded contexts** — what they are, what they own, their interfaces to other contexts
- **Ubiquitous language** — a glossary of domain terms with precise definitions
- **Aggregate roots** — the primary entities in each context and their invariants

This file is kept up to date as part of feature development. When a bean introduces a new domain
concept, updating `DOMAIN.md` is part of the acceptance criteria. The document should always fit
on a couple of screens and be directly useful to any agent asking "what is X?" or "where does Y
belong?"

### Constraints

- If it's not a Go package, it's not a bounded context
- No separate "strategic design" or "context mapping" documents — the package structure is the map
- No DDD jargon in the codebase itself — the code uses the ubiquitous language, not DDD
  meta-terminology (no `AggregateRoot` base classes, no `DomainEvent` interfaces)

## What Changes

### Language and Runtime

**Go** replaces TypeScript and Electron. Go was chosen because:

- The maintainer has deep experience with Go
- Go produces single-binary CLI tools with trivial cross-compilation
- Go's simplicity and strong idioms make it highly AI-agent-friendly
- Go's built-in testing, benchmarking, and profiling require zero additional tooling
- `go test ./...` always works — no Electron, no Docker, no special setup

### Interface

**Pure CLI with subcommands** replaces the xterm.js REPL. The interaction model is closer to
`ffmpeg` or `sox` than to a terminal emulator:

```
bounce serve                          # start the audio server
bounce play kick.wav                  # play a file
bounce stop                           # stop playback
bounce analyze onset kick.wav         # run onset detection
bounce analyze mfcc kick.wav          # extract MFCC features
bounce import ./samples/              # import audio files into project
bounce list                           # list imported samples
```

### Architecture

**Single binary, two modes.** `bounce` is both the CLI client and the audio server. The user
runs `bounce serve` in one terminal to start the server, then uses `bounce <command>` in other
terminals to interact with it.

```
┌──────────────────────────────────────────────────────────┐
│                    bounce binary                         │
│                                                          │
│  ┌─────────────────────┐    ┌─────────────────────────┐  │
│  │   CLI Client Mode   │    │   Server Mode           │  │
│  │                     │    │   (bounce serve)        │  │
│  │  Subcommands        │    │                         │  │
│  │  FluCoMa analysis   │───▶│  HTTP API               │  │
│  │  File operations    │    │  Audio engine (C++)     │  │
│  │  SQLite queries     │◀───│  miniaudio playback     │  │
│  │                     │    │  Application state      │  │
│  └─────────────────────┘    └─────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Client-side operations** (no server needed):
- FluCoMa analysis (onset, amplitude, novelty, transient slicing; MFCC, spectral shape, NMF)
- File import and metadata management
- SQLite queries
- Visualization

**Server-side operations** (require `bounce serve`):
- Audio playback (play, stop, transport control)
- Any real-time audio processing

**Communication:** HTTP between CLI client and server. This keeps things simple to start. Low-latency
streaming protocols can be introduced later if needed.

### Audio and DSP

**Go handles orchestration. C++ handles real-time audio and DSP.**

Go is not realtime-safe. Anything that runs on the audio thread must be written in C++.
Go calls into C++ via cgo with `extern "C"` wrapper functions.

The C++ layer has two domains:

1. **Audio engine** — miniaudio device management, audio callback, sample playback. This
   code is real-time and runs on the audio thread. It is used by the server.

2. **FluCoMa analysis** — onset/amplitude/novelty/transient slicing, MFCC, spectral shape, NMF,
   normalization, KD-tree. This code is not real-time but is C++ because that is where FluCoMa
   lives. It is used by the client.

Both domains are exposed to Go through `extern "C"` function signatures that pass arrays and
primitives — no N-API, no V8 types, no garbage collector integration. This is simpler than the
current Node.js native addon pattern.

```c
// Example: extern "C" wrapper for FluCoMa onset slicing
int flucoma_onset_slice(
    const float* audio, int num_frames, int sample_rate,
    int* out_onsets, int max_onsets,
    int function, double threshold,
    int fft_size, int hop_size, int window_size,
    int filter_size, int min_slice_length
);
```

```go
// Example: Go wrapper
func OnsetSlice(audio []float32, sampleRate int, opts OnsetOpts) ([]int, error) {
    outOnsets := make([]int32, maxOnsets)
    n := C.flucoma_onset_slice(
        (*C.float)(&audio[0]), C.int(len(audio)), C.int(sampleRate),
        (*C.int)(&outOnsets[0]), C.int(len(outOnsets)),
        C.int(opts.Function), C.double(opts.Threshold),
        C.int(opts.FFTSize), C.int(opts.HopSize), C.int(opts.WindowSize),
        C.int(opts.FilterSize), C.int(opts.MinSliceLength),
    )
    return intSlice(outOnsets[:n]), nil
}
```

### Data Storage

**SQLite for metadata. Plain files for audio.**

Audio files are stored as plain WAV/FLAC/MP3 files on disk — not as blobs in the database. SQLite
stores metadata: sample hashes, durations, channel counts, sample rates, analysis results, project
associations, and lineage relationships.

This makes it easy to use standard tools (file managers, `sox`, `ffmpeg`) alongside Bounce, and
avoids the database bloat of storing large binary blobs.

### Codebase Organization

All v2 code lives in `v2/` at the repository root. It is completely independent of the existing
Electron codebase. The existing code on `main` continues to receive feature development. The v2
branch can be rebased onto `main` without conflicts.

```
v2/
├── cmd/bounce/          # CLI entry point (main.go)
├── internal/
│   ├── analysis/        # FluCoMa analysis wrappers (Go + cgo)
│   ├── audio/           # Audio engine client (talks to server)
│   ├── db/              # SQLite schema, migrations, queries
│   ├── freesound/       # Freesound API client
│   └── server/          # HTTP server, audio engine lifecycle
├── native/              # C++ source (extern "C" wrappers)
│   ├── analysis/        # FluCoMa algorithm wrappers
│   └── engine/          # miniaudio audio engine
├── testdata/            # Test fixtures (small WAVs, golden files)
├── go.mod
├── go.sum
└── Makefile
```

## Testing Strategy

Testing is the single most important investment in v2. The goal: **if the tests pass, it is very
unlikely that a user will discover issues at runtime.**

### Principles

1. **Dev/CI parity.** Tests must run identically on a developer's laptop and in CI. No
   environment-specific code paths, no "if CI" conditionals, no different file locations. If a
   test passes locally it passes in CI, and vice versa. This is enforced as a standing project
   principle — not just for test fixtures but for all test infrastructure.

2. **Table-driven tests everywhere.** Every function gets a test with a slice of
   `{name, input, expected}` structs. This is Go's idiomatic pattern. AI agents excel at reading
   and extending table-driven tests.

3. **`go test ./...` is the only test command.** No Docker, no Electron, no special setup.
   If the tests require cgo (FluCoMa, miniaudio), they use build tags. Pure Go tests run
   everywhere.

4. **Interface-based design for testability.** Every external dependency — FluCoMa bindings,
   audio server, SQLite, filesystem, Freesound API — gets a Go interface. Tests use in-memory
   fakes. No mocking libraries.

5. **Golden file tests for analysis.** Tests download a reference audio file from Freesound
   (sound ID 638775), cache it locally, run every analysis algorithm against it, and compare
   output against checked-in golden files. Any change in analysis output is a deliberate,
   reviewed change.

6. **CI enforces coverage threshold.** The GitHub Actions workflow runs `go test -cover ./...`
   and fails if coverage drops below the threshold.

### Test Fixture Workflow

Tests that need audio data use a shared fixture downloaded from Freesound. The fixture location
is **project-relative** — `v2/testdata/.cache/` — so tests run identically on a developer's
laptop and in CI. No environment-specific path logic. No "if CI" branching. This is a standing
principle: **the test suite must behave the same in every environment.**

1. Test resolves `v2/testdata/.cache/638775.wav` relative to the repository root
2. If missing, downloads via the `freesound` package using `FREESOUND_API_KEY` env var
3. File is cached for subsequent runs (directory is gitignored)
4. `FREESOUND_API_KEY` is stored as a GitHub Actions secret for CI and set locally by the developer

This ensures tests use a real-world audio file without shipping large binaries in the repo.

### Freesound Client Package

A minimal Go package (`internal/freesound/`) that supports downloading a single sound by ID.
This is the seed of a larger Freesound integration that may come later, but for now it exists
purely to support the test fixture workflow.

```go
client := freesound.NewClient(apiKey)
err := client.Download(ctx, 638775, "/path/to/output.wav")
```

## Phase 1 Scope

Phase 1 delivers the foundation: a working CLI, the complete analysis pipeline, and audio playback.

### CLI Commands

| Command | Mode | Description |
|---------|------|-------------|
| `bounce serve` | Server | Start the HTTP audio server |
| `bounce play <file>` | Client | Play an audio file |
| `bounce stop` | Client | Stop playback |
| `bounce analyze onset <file>` | Local | FluCoMa onset detection |
| `bounce analyze amplitude <file>` | Local | FluCoMa amplitude slicing |
| `bounce analyze novelty <file>` | Local | FluCoMa novelty slicing |
| `bounce analyze transient <file>` | Local | FluCoMa transient slicing |
| `bounce analyze mfcc <file>` | Local | MFCC feature extraction |
| `bounce analyze spectral <file>` | Local | Spectral shape features |
| `bounce analyze nmf <file>` | Local | Non-negative matrix factorization |
| `bounce normalize <file>` | Local | Min-max / standardize / robust normalization |

### Analysis Algorithms

All FluCoMa algorithms currently wrapped in the Electron app's C++ layer are included in Phase 1:

**Slicing:**
- Onset slice (`fluid::algorithm::OnsetSegmentation`)
- Amplitude slice (`fluid::algorithm::EnvelopeSegmentation`)
- Novelty slice (`fluid::algorithm::NoveltySegmentation`)
- Transient slice (`fluid::algorithm::TransientSegmentation`)

**Feature extraction:**
- MFCC (`fluid::algorithm::MFCC`)
- Spectral shape — centroid, spread, skewness, kurtosis, rolloff, flatness, crest
  (`fluid::algorithm::SpectralShape`)
- BufNMF (`fluid::algorithm::NMF`)

**Utilities:**
- Normalization (min-max, standardize, robust)
- KD-tree (nearest neighbor search)

### Server

The `bounce serve` command starts an HTTP server that:

- Initializes the miniaudio audio engine (C++)
- Exposes REST endpoints for playback control
- Holds application state
- Shuts down cleanly on SIGINT/SIGTERM

### Database Schema

Initial SQLite schema for Phase 1:

```sql
CREATE TABLE samples (
    hash TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    duration_seconds REAL NOT NULL,
    sample_rate INTEGER NOT NULL,
    channels INTEGER NOT NULL,
    frames INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE analysis_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_hash TEXT NOT NULL REFERENCES samples(hash),
    algorithm TEXT NOT NULL,
    parameters TEXT NOT NULL,  -- JSON
    result TEXT NOT NULL,      -- JSON
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_analysis_sample ON analysis_results(sample_hash);
CREATE INDEX idx_analysis_algorithm ON analysis_results(algorithm);
```

## Development Process

### Enabling AI Coding Agents

A primary goal of v2 is a codebase where AI coding agents consistently produce quality work with
minimal human involvement. The v1 spec-driven approach (SHAPE → SPEC → BUILD → TEST) was too
heavy — but without sufficient context, agents produced bad work. v2 takes a different approach:

**The bean is the spec.** No separate spec documents. A bean's body contains everything an agent
needs to execute:
- What the feature does (1-2 sentences)
- The interface (CLI flags, function signature, HTTP endpoint)
- Acceptance criteria as a checklist

**Tests are the contract.** Before writing implementation code, write the test cases. If the tests
pass, the work is done. No ambiguity about "done."

**Convention over specification.** Go's simplicity and strong codebase patterns mean most features
don't need detailed specs. "Add `bounce analyze spectral`" doesn't need a document — the agent
looks at how `bounce analyze onset` works and follows the pattern. The first few features are built
carefully to establish templates; everything after follows them.

**Small beans.** If a bean needs more than a screenful of context to explain, it's too big. Split it.

### Workflow

1. Create a bean with interface + acceptance criteria
2. Agent writes tests first, then implementation
3. `go test ./...` passes → mark the bean done

No phases. No separate spec files. The bean + the test suite + the codebase conventions are the
specification.

### Avoiding "Works on My Machine"

This is a standing principle enforced across the entire project:

- Tests run identically on a developer laptop and in CI
- No environment-specific code paths or conditionals
- No platform-specific test skips without explicit justification
- If a test passes locally it passes in CI, and vice versa
- The build requires only `go` and a C++ compiler — no framework-specific setup

## What Is Explicitly Deferred

The following features exist in v1 or on the v1 roadmap but are **not** in scope for v2 Phase 1:

- REPL / interactive mode
- Terminal visualizations (Kitty graphics protocol)
- GUI windows (Gio-based audio editor, live visuals)
- Instruments, sample mapping, MIDI
- Mixer, channels, master bus
- Patterns and percussion notation
- Projects (multi-project support)
- Corpus building and querying
- Tutorials
- Freesound browsing/searching (the client exists only for test fixture download)
- Ableton Link
- Scripts / user extensibility
- Live-coding

These may be built in future phases once the foundation is solid and well-tested.
