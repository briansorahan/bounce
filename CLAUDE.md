# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Bounce?

Bounce is an Electron desktop audio editor built with FluCoMa (Fluid Corpus Manipulation) and miniaudio. It provides a terminal-based REPL UI (xterm.js) for audio corpus analysis, visualization, and resynthesis. Target users: sound designers, music producers, and audio researchers.

## Build & Development Commands

```bash
# Initial setup (clone with --recursive for submodules)
npm run build:deps      # Build C++ third_party/memory (CMake)
npm install
npm run rebuild         # Rebuild native modules for Electron

# Build the Electron app
npm run build:electron  # Compiles TS + copies renderer assets

# Run the app
npm run dev:electron    # Build + launch in development mode

# Lint
npm run lint            # ESLint on src/**/*.ts

# Unit tests (run individually via tsx)
npm test                # Runs all unit test files
tsx src/test.ts         # Run a single test file

# E2E tests (Dockerized — do NOT run Playwright directly)
./build.sh              # Docker build + xvfb-run playwright test

# After C++ changes
npm run rebuild         # Always required after native code changes
```

## Architecture (Three-Process Model)

See `ARCHITECTURE.md` for full details. The three processes:

1. **Main Process** (`src/electron/main.ts`) — App lifecycle, IPC router, SQLite database (better-sqlite3), FluCoMa analysis via `flucoma_native` addon, audio file decoding, spawns audio engine utility process
2. **Renderer Process** (`src/renderer/main.ts`) — xterm.js REPL, canvas visualizations, namespace objects that translate user commands to IPC calls. Never touches filesystem/database/native audio directly.
3. **Audio Engine Utility Process** (`src/utility/audio-engine-process.ts`) — Real-time playback via `audio_engine_native` addon (miniaudio), instrument voice management. Communicates with main via MessagePort.

## Key Source Layout

- `src/electron/` — Main process: lifecycle, database, settings, IPC handlers
- `src/electron/ipc/` — IPC handler modules organized by domain (audio, project, feature, midi, etc.)
- `src/renderer/` — Renderer process: REPL, visualizations, namespace objects
- `src/renderer/namespaces/` — REPL namespace objects (`sn`, `vis`, `proj`, `env`, `fs`, `midi`, `mixer`, `pat`, `transport`)
- `src/renderer/results/` — Result display formatters for REPL output
- `src/shared/` — Shared types and IPC contracts between processes
- `src/utility/` — Audio engine utility process
- `src/` (root) — Core library code (native bindings wrappers), unit test files
- `native/` — C++ source for `flucoma_native` and `audio_engine_native` addons
- `tests/` — Playwright e2e test specs
- `third_party/` — FluCoMa, Eigen, miniaudio, rtmidi, HISSTools, foonathan/memory
- `.github/skills/` — Copilot skills for common workflows (specs, migrations, terminal commands, etc.)

## IPC Contract

All IPC channels are typed in `src/shared/ipc-contract.ts` with three patterns:
- **Handle** (request-response): `ipcMain.handle` / `ipcRenderer.invoke`
- **Send** (one-way renderer→main): fire-and-forget for playback, instruments, mixer, transport
- **Push** (one-way main→renderer): telemetry events (playback position, mixer levels, MIDI)

The renderer accesses IPC through `window.electron` (exposed via `src/electron/preload.ts` + contextBridge).

## Native Addons (C++17)

Two native addons defined in `binding.gyp`:
- **flucoma_native** — FluCoMa analysis: onset/amp/novelty/transient slicing, BufNMF, MFCC, spectral shape, normalization, KD-tree
- **audio_engine_native** — miniaudio playback, sampler/granular instruments, MIDI input (rtmidi), MIDI file parsing

TypeScript wrappers in `src/index.ts`. Type declarations in `src/native.d.ts`.

## Development Conventions

- **Spec-driven development**: For non-trivial changes, use the spec workflow in `.github/skills/create-new-spec/SKILL.md`
- **REPL interface contract**: Every REPL-exposed namespace/function needs a `help()` method; every returned object needs a useful terminal summary
- **TypeScript strict mode** with three tsconfig files: `tsconfig.json` (library), `tsconfig.electron.json` (main process), `tsconfig.renderer.json` (renderer)
- **File naming**: kebab-case for files, PascalCase for classes/types, camelCase for functions/variables
- **Pre-commit hook**: `scripts/check-no-debug-logging.sh` — prevents committing debug logging
- **Cross-platform**: All code must work on macOS, Linux, and Windows
