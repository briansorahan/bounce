# Bounce

[![BUMP](https://img.shields.io/badge/bump-bump%20v2-blue?logo=electron)](https://bumps.dev/) |
[![LICENSE](https://img.shields.io/github/license/briansorahan/bounce)](https://github.com/briansorahan/bounce)

**Bounce** is a terminal-based audio editor and corpus analysis tool built with Electron, FluCoMa (Fluid Corpus Manipulation), and miniaudio. It provides a powerful REPL (Read-Eval-Print Loop) interface powered by xterm.js for audio corpus analysis, visualization, and resynthesis.

![REPL Screenshot](docs/images/repl-screenshot.png)

> *Target users: sound designers, music producers, audio researchers, and corpus engineers.*

---

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Building](#building)
- [Running](#running)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Development Workflow](#development-workflow)
- [REPL Guide](#repl-guide)
- [Contributing](#contributing)
- [License](#license)

---

## Quick Start

```bash
# Clone with submodules
git clone --recursive https://github.com/briansorahan/bounce.git
cd bounce

# Build C++ dependencies first
npm run build:deps

# Install dependencies and build native addon
npm install

# Rebuild native modules for Electron
npm run rebuild

# Build TypeScript and Electron
npm run build:electron

# Run the Electron app
npm run dev:electron
```

---

## Prerequisites

This project requires the following to be installed system-wide:

| Platform | Required Items |
|----------|----------------|
| **macOS** | Xcode Command Line Tools, Node.js v24+, npm v11+, Python 3.x, CMake 3.10+ |
| **Linux** | build-essential (gcc/g++, make), Node.js, npm, Python 3.x, CMake 3.10+, BLAS, LAPACK |
| **Windows** | Node.js, npm, Python 3.x, CMake, Visual Studio Build Tools |

### Build Requirements (Cross-Platform)
- C++ compiler with C++17 support
- Python 3.x (required by node-gyp)
- CMake 3.10+
- Node.js v24+
- npm v11+

> **Note:** The Dockerized build includes all dependencies and can be used for consistent cross-platform testing.

---

## Installation

```bash
# Clone repository (requires git-submodules)
git clone --recursive https://github.com/briansorahan/bounce.git
cd bounce

# Build C++ third-party dependencies (CMake-based)
npm run build:deps

# Install Node.js dependencies and native additive
npm install

# If native modules were previously built, rebuild for Electron
npm run rebuild
```

### Docker Build (Recommended for Clean Install)

```bash
# Build locally with all dependencies
./build.sh
```

> Dockerized tests run in a clean environment with all system dependencies pre-installed. Do not run Playwright e2e tests directly; use the Docker build wrapper instead.

---

## Building

### Initial Build

```bash
# Full build (C++ deps + TypeScript + Electron)
npm run build

# Build only native addons
npm run build:native
```

### Incremental Rebuild (After C++ Changes)

```bash
# After modifying native/ directory code
npm run rebuild
npm run build:electron
```

### Build Targets

- `npm run build:deps` — Build C++ third_party/memory (CMake)
- `npm run build:native` — Build fluent_native and audio_engine_native addons
- `npm run build:electron` — Build TypeScript and copy renderer assets
- `npm run build` — Full build (all targets)

---

## Running

### Development Mode

```bash
npm run dev:electron
```

This builds the project and launches the Electron app in development mode.

### Production Build

```bash
npm run build:electron
```

Then launch Electron binary with the built app (platform-specific path).

### Testing

```bash
# Run unit tests via tsx
npm test
tsx src/test.ts  # Run a single test file
```

### Dockerized Test Environment

```bash
./run_dockerized_test.sh  # Wrapper for Playwright tests in Docker
npm run test:e2e
```

---

## Project Structure

```
bounce/
├── docs/
│   ├── images/      # Screenshots, diagrams
│   ├── examples/    # Usage examples
│   └── specs/       # Test specifications
├── native/          # C++ addons (flucoma_native, audio_engine_native)
├── scripts/         # Build automation scripts
├── src/
│   ├── electron/    # Main process: IPC, settings, lifecycle
│   │   ├── ipc/     # IPC handlers by domain
│   │   └── preload.ts
│   ├── native/      # Native bindings wrappers
│   ├── renderer/
│   │   ├── ipc/     # IPC sender modules
│   │   ├── namespaces/  # REPL namespace objects
│   │   ├── results/ # Output formatters
│   │   └── repl.ts
│   ├── shared/      # IPC contracts, types
│   └── utility/     # Audio engine utility process
├── third_party/     # C++ external dependencies
├── src/
│   └── lib/         # Core library code
├── src/             # Node.js source
│   └── index.ts
├── binding.gyp      # C++ native bindings config
├── package.json
├── Makefile
└── tsconfig*        # TypeScript configs
```

---

## Architecture

### Three-Process Electron Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Electron Main                          │
│           IPC Handlers, Settings, Database, Lifecycle          │
│         (electron/) → (ipc/) → Handlers / Routes             │
└─────────────────────────────────────────────────────────────┘
                              ↔ IPC ↔
┌─────────────────────────────────────────────────────────────┐
│                        Renderer                               │
│      REPL (xterm.js), Visualizations, Namespace Objects        │
│    (renderer/) → (namespaces/) → Commands / Results           │
└─────────────────────────────────────────────────────────────┘
                              ↔ IPC ↔
┌─────────────────────────────────────────────────────────────┐
│           Audio Engine Utility Process                        │
│   Real-time playback, Instrument voices, voice mgmt           │
│         (utility/) → audio_engine_native (miniaudio)          │
└─────────────────────────────────────────────────────────────┘
                              ↔ IPC ↔
┌─────────────────────────────────────────────────────────────┐
│                   Native Addons (C++17)                       │
│   flucoma_native:      analysis, KD-tree, normalization        │
│   audio_engine_native: playback, MIDI input, instrument voices │
└─────────────────────────────────────────────────────────────┘
```

### IPC Contract Patterns

| Pattern | Direction | Use Case |
|---------|-----------|----------|
| **Handle** | Renderer → Main | `ipcMain.handle` / `ipcRenderer.invoke` |
| **Send**  | Renderer → Main | Fire-and-forget (playback, instruments) |
| **Push**  | Main → Renderer | Telemetry (position, levels, MIDI events) |

Contracts typed in: `src/shared/ipc-contract.ts`

### Native Addons

#### flucoma_native

```cpp
// Built with CMake/BLAS/LAPACK
- Onset detection
- BufNMF
- MFCC feature extraction
- Spectral shape analysis
- KD-tree for corpus querying
- Normalization utilities
```

#### audio_engine_native

```cpp
// miniaudio for playback
- Real-time playback
- Sampler/granular instruments
- Granular synthesis
- MIDI input (rtmidi)
- MIDI file parsing
- Instrument voice mgmt
```

### Renderer Interface

```typescript
// Preload exposes window.electron to renderer
window.electron = {
  invoke: (channel: string, ...args: any[]) => Promise<void> | any,
  send: (channel: string, payload: any) => void,
  on: (channel: string, listener: (data: any) => void) => void,
}
```

---

## Development Workflow

### Recommended Sequence (Non-Trivial Changes)

1. **Create spec** → Copy `.github/skills/create-spec/skill.md`
2. **Write tests** → Follow `.github/skills/unit-testing/skill.md`
3. **Implement** → Code with `@ts-expect-error` for incomplete types
4. **Build** → `npm run build` then `npm run build:electron`
5. **Lint** → `npm run lint` (fix with `npm run lint:fix`)

See `.github/skills/` for documentation on:
- Unit testing conventions
- Creating specs
- Terminal commands
- Cross-platform migration

### Unit Testing Guidelines

- Use private `#x` fields for internal-only API
- Coverage rules enforced via build
- Follow `.github/skills/unit-testing/skill.md`

### Build Scripts

```bash
# Full build
npm run build

# Build native
npm run build:native

# Build Electron
npm run build:electron

# Rebuild native (after code changes)
npm run rebuild

# Clean build
npm run clean && npm run build

# Lint
npm run lint
npm run lint:fix  # Auto-fix
```

### Pre-commit Hook

The `scripts/check-no-debug-logging.sh` commit hook prevents committing debug logging.

---

## REPL Guide

### REPL Namespace Objects

Each namespace in `src/renderer/namespaces/` provides a domain-specific REPL object:

| Namespace | Domain | Key Modules |
|-----------|--------|-------------|
| `sn` | Corpus | Corpus, CorpusFile, BufNMF, KDTree |
| `vis` | Visualization | Waveform, Spectrogram, Wave |
| `proj` | Project | Project, Track, Sample, Marker |
| `env` | Environment | Transport, Timecode, Tempo |
| `fs` | Filesystem | File, Directory, Path |
| `midi` | MIDI | MIDIFile, Sysex, Device, CC, Note |
| `mixer` | Audio Mixer | Channel, Bus, Pan, Volume |
| `pat` | Pattern | Pattern, Event, Sequence |
| `transport` | Transport | Play, Stop, Seek |

### REPL Help Method

```javascript
// Every namespace object must have a help() method
window.electron.repl.sn.help()
// Returns:
// Usage: sn.file("path/to/file")
// Usage: sn.bu(nmf())
// Usage: sn.load("file.json")
```

### REPL Input/Result Object

```javascript
// The main window REPL is an input object for commands
window.electron.repl.input = {
  invoke: (channel, args) => ...,
  on: (channel, listener) => ...,
}
```

Each result object from IPC invokes needs a `summary()` method:

```typescript
interface ResultObject {
  summary(): Promise<string> | string
  toString(): string
}
```

This enables clean REPL output via results formatter in `src/renderer/results/`.

---

## Contributing

### Bug Reports

See [Issues](https://github.com/briansorahan/bounce/issues)

### Pull Requests

1. Create feature branch
2. Ensure all tests pass
3. Follow code conventions
4. Update relevant documentation
5. Sign [CONTRIBUTING.md](CONTRIBUTING.md)

### Code Style

- TypeScript strict mode enabled
- File naming: kebab-case (classes/types: PascalCase)
- No debug logging in production
- Private fields: `#x` prefix
- Linting enforced by pre-commit hook

### Testing

- Unit tests: tsx test runner
- E2E tests: Playwright + Docker
- Coverage enforced by build rules

See `.github/skills/` for workflow documentation.

---

## License

This project is licensed under the terms in [LICENSE](LICENSE).

---

[back to top](#readme)
