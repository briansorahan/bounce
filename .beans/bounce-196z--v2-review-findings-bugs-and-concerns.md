---
# bounce-196z
title: 'V2 review findings: bugs and concerns'
status: completed
type: task
priority: high
created_at: 2026-05-27T18:47:55Z
updated_at: 2026-05-29T21:07:09Z
---

Comprehensive findings from review of `v2/` branch changes.

## Scope Reviewed
- Branch diff in `v2/` vs `origin/main`
- Native C++ audio/analysis code
- Go command/server/database/analysis packages
- Existing tests and command behavior

## Findings

### 1) Critical: data race in native audio engine callback
**Files:**
- `v2/native/engine/engine.cpp:35-52`
- `v2/native/engine/engine.cpp:139-145`

**Problem:**
`data_callback` reads `g_engine.audioData`, `g_engine.channels`, and `g_engine.totalFrames` without synchronization while `engine_load` mutates those fields under `loadMutex`.

**Impact:**
Concurrent `/load` during playback can trigger undefined behavior (corruption/crash).

**Recommended fix direction:**
- Ensure callback reads from immutable snapshot state, or
- synchronize both read/write access consistently (lock-free double-buffering or shared lock strategy compatible with RT audio constraints).

---

### 2) High: user-facing CLI commands are documented but not implemented
**Files:**
- `v2/internal/cmd/analyze.go`
- `v2/internal/cmd/normalize.go`
- `v2/README.md` (examples imply these work)

**Problem:**
`analyze` subcommands and `normalize` currently return `not implemented`.

**Impact:**
Published CLI flows fail at runtime; user expectations don’t match behavior.

**Recommended fix direction:**
- Implement command handlers or
- clearly gate as TODO/experimental and remove runnable examples until implemented.

---

### 3) High: missing option validation in analysis wrappers can panic
**Files:**
- `v2/internal/analysis/analysis.go`

**Problem areas:**
- divisions based on `HopSize` / `BlockSize`
- assumptions about non-empty row dimensions and matching dimensions

**Impact:**
Invalid options or malformed input can panic process instead of returning structured errors.

**Recommended fix direction:**
- Validate all externally settable options (e.g., `HopSize > 0`, `FFTSize > 0`, `len(row)==numCols`, `len(query)==numDims`), return errors for invalid input.

---

### 4) High: server listens on all interfaces with unauthenticated control endpoints
**Files:**
- `v2/internal/cmd/serve.go:31` (binds `:%d`)
- `v2/internal/server/server.go` (`/load`, `/play`, `/stop` unauthenticated)

**Problem:**
Default bind exposes control API beyond localhost on many systems.

**Impact:**
Any reachable host on the network may control playback and request arbitrary local path loads.

**Recommended fix direction:**
- Default bind to `127.0.0.1`,
- optionally add explicit `--host` flag,
- consider auth/token model if remote control is intentional.

---

### 5) Medium: command tests do not exercise real command implementations
**Files:**
- `v2/internal/cmd/cmd_test.go`

**Problem:**
Tests build a synthetic Cobra tree (`newRoot`) instead of invoking package command objects.

**Impact:**
Regressions in real command wiring/flags/handlers can pass tests unnoticed.

**Recommended fix direction:**
- Add tests against actual command tree used by `cmd.Execute()` (or expose a factory returning the real root command).

---

### 6) Low: committed build artifact in repository
**File:**
- `v2/native/analysis/flucoma-b90ac632.o.tmp`

**Problem:**
Temporary object file artifact committed to source control.

**Impact:**
Repository noise and risk of stale build byproducts.

**Recommended fix direction:**
- Remove artifact and ensure ignore patterns cover this class of temp objects.

## Verification Notes
- `cd v2 && go test ./...` passed
- `cd v2 && go vet ./...` passed

## Follow-up Checklist
- [x] Fix/mitigate native audio callback race
- [x] Implement or gate `analyze`/`normalize` commands (deferred by product decision)
- [x] Add input validation in analysis APIs
- [x] Restrict server bind default to localhost (plus explicit host flag) (deferred by product decision)
- [x] Replace synthetic CLI tests with tests against real command tree (clarified risk, no change requested)
- [x] Remove committed temp build artifact (verified absent and untracked)

## Summary of Changes
- Implemented lock-free snapshot handoff in native engine callback path to remove load/playback race.
- Added analysis option/input validation that returns structured errors instead of panicking on malformed input.
- Added regression tests for invalid hop-size and dimensionality/ragged-input validation paths.
- Verified `v2/native/analysis/flucoma-b90ac632.o.tmp` is absent and not tracked.
- Left `analyze`/`normalize` implementation and server bind defaults unchanged per product decision.
- Clarified the synthetic CLI test risk without code changes per request.
