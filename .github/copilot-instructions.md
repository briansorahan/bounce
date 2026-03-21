# Copilot Instructions for Bounce

## Project Overview

Bounce is an experimental audio editor for exploring audio corpus analysis and resynthesis. Built with Electron and FluCoMa (Fluid Corpus Manipulation), it provides a cross-platform terminal UI for immediate visualization of audio data and analysis features.

**Target Audience:** Sound designers, music producers, live music performers, and researchers.

## Architecture

- **Electron app** with three processes: main, renderer, and audio engine utility process
- **Native C++ addons** via node-gyp for FluCoMa analysis and miniaudio playback
- **Terminal UI** as primary interface (xterm.js-based)
- **TypeScript** for all application code
- **SQLite** (better-sqlite3) for persistent sample, feature, and project storage
- **No server component** - pure desktop application (utility process is local to Electron)

For detailed architecture documentation (process responsibilities, IPC protocol, data flows, database schema), see [ARCHITECTURE.md](../ARCHITECTURE.md).

## Technology Stack

- **Runtime:** Electron, Node.js v24+
- **Language:** TypeScript (strict mode)
- **Native:** C++17 with FluCoMa and miniaudio, built via node-gyp
- **UI:** Terminal-based with @xterm/xterm, Canvas overlays for visualization
- **Testing:** Custom unit tests (run via tsx), Playwright for e2e
- **Audio:** FluCoMa for analysis, miniaudio for playback, audio-decode/wav-decoder for I/O
- **Storage:** SQLite via better-sqlite3 for persistent sample/feature/project caching

## Core Principles

### Cross-Platform First
- All code must work on macOS, Linux, and Windows
- Avoid platform-specific APIs unless absolutely necessary
- Test build process on multiple platforms

### Native Code Conservatism
- Be very careful with C++ binding changes - they're harder to debug and rebuild
- Prefer TypeScript solutions when possible
- When native changes are needed, ensure clear error handling and memory management
- Always run `npm run rebuild` after C++ changes

### Terminal UI Priority
- The terminal UI is the primary interface
- When adding features, consider terminal visualization requirements
- Audio analysis results should be displayable in the terminal

### REPL Interface Consistency
- Treat all REPL-exposed namespaces, functions, and returned types as user-facing interfaces
- Every REPL-exposed object or namespace should provide a `help()` method with a short explanation and usage examples
- Every custom object returned from an evaluated REPL expression should print a useful terminal summary when displayed
- Returned summaries should emphasize the highest-value properties for that type (for example duration, channels, sample rate, feature dimensions, counts, or workflow-relevant next steps)
- When planning or implementing REPL-facing features, include automated coverage for both `help()` output and returned-object display behavior using unit tests and/or Playwright tests

### Minimal Dependencies
- Be conservative about adding new npm packages
- FluCoMa is the primary audio analysis library
- Only add dependencies that solve problems well with minimal overhead

## Code Style

### TypeScript
- Minimal comments - only when clarifying complex logic
- Prefer `interface` for public APIs, `type` for unions/utilities
- Use async/await for asynchronous operations
- Handle errors with try/catch and meaningful error messages

### File Organization
- `src/electron/` - Electron main process (lifecycle, IPC handlers, database)
- `src/renderer/` - Electron renderer process (REPL, visualization, namespaces)
- `src/shared/` - Shared types, IPC contracts, and protocols between processes
- `src/utility/` - Audio engine utility process (playback, instruments)
- `src/` - Core library code, native bindings, and unit tests
- `tests/` - Playwright e2e test files
- `native/` - C++ source code for flucoma_native and audio_engine_native addons

### Naming Conventions
- Files: kebab-case (e.g., `onset-feature.ts`)
- Classes: PascalCase
- Functions/variables: camelCase
- Types/Interfaces: PascalCase

## Development Workflow

### Spec-Driven Development
For any work beyond simple fixes (more than a couple lines), use the spec workflow documented in `.github/skills/create-new-spec/SKILL.md`. Additional skills are available in `.github/skills/` for common tasks like adding database migrations, wrapping FluCoMa algorithms, adding terminal commands, and managing the database.

For REPL-facing work, specs should explicitly document the REPL interface contract: what gets a `help()` method, what each returned object prints to the terminal, and which unit and/or Playwright tests will verify those behaviors.

**Simple changes that don't need specs:**
- Typos and formatting fixes
- Small bug fixes (1-2 line changes)
- Dependency version updates
- Documentation corrections

### Build & Test
- Run `npm run lint` before commits
- Run relevant tests for changed code
- When Playwright or end-to-end coverage is needed, always run `./build.sh` so the suite executes inside the Dockerized test environment; do not run direct Playwright commands from Copilot
- Run `npm run rebuild` after any C++ changes
- Full Dockerized workflow test: `./build.sh`

## Performance Considerations

- Audio processing should not block the main/renderer thread
- Consider memory usage for large audio corpora
- Optimize for batch processing (not necessarily real-time)
- Be mindful of buffer sizes and memory allocation in native code

## Common Pitfalls

- Forgetting to rebuild native modules after C++ changes
- Not testing cross-platform compatibility
- Blocking Electron UI thread with heavy processing
- Memory leaks in native addon lifecycle

## Questions to Ask

When implementing features, consider:
- How will this be visualized in the terminal UI?
- Does this work cross-platform?
- Can this be done in TypeScript, or does it need native code?
- What are the performance implications for large audio files?
- How will this integrate with existing FluCoMa algorithms?
