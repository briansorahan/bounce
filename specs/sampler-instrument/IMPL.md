# Implementation: Sampler Instrument

**Spec:** specs/sampler-instrument  
**Created:** 2026-03-21  
**Status:** In Progress

## Context

Implements the sampler instrument feature per PLAN.md. Introduces a C++ Instrument
base class, SamplerInstrument concrete implementation, AudioEngine refactoring to
support instruments alongside legacy processors, full IPC pipeline, database
persistence, and the `inst` REPL namespace.

## Implementation Log

### 2026-03-21 - Core Implementation

**C++ Native Layer:**
- Created `native/include/instrument.h` — pure virtual Instrument base class with
  process, noteOn/Off, loadSample, setParam, telemetry writers
- Created `native/include/sampler-instrument.h` + `native/src/sampler-instrument.cpp`
  — voice pool, sample cache (note→PCM), round-robin voice stealing, volume param
- Refactored `native/include/audio-engine.h` — added instruments_ vector, 9 new
  ControlMsg ops, instrument API methods, findInstrument/setupInstrumentTelemetry helpers
- Refactored `native/src/audio-engine.cpp` — processBlock iterates both legacy
  processors AND instruments, new control message handling, telemetry writers
  shared via ring buffer
- Extended `native/src/audio-engine-binding.cpp` — 9 new N-API instance methods
- Updated `binding.gyp` — added sampler-instrument.cpp to audio_engine_native sources

**TypeScript Protocol & IPC:**
- Extended `src/shared/audio-engine-protocol.ts` — 10 new command types
- Extended `src/utility/audio-engine-process.ts` — native interface + routing for
  all instrument messages
- Extended `src/electron/ipc/audio-handlers.ts` — 9 fire-and-forget handlers +
  6 invoke-based DB persistence handlers
- Extended `src/electron/preload.ts` — all instrument methods exposed
- Extended `src/shared/ipc-contract.ts` — full type coverage
- Extended `src/renderer/types.d.ts` — Window.electron instrument methods

**Database:**
- Migration #7 in `src/electron/database.ts` — `instruments` and
  `instrument_samples` tables with FK to projects
- CRUD methods: createInstrument, getInstrument, listInstruments, deleteInstrument,
  addInstrumentSample, getInstrumentSamples, removeInstrumentSample

**REPL Layer:**
- Created `src/renderer/results/instrument.ts` — InstrumentResult, InstrumentListResult
- Created `src/renderer/namespaces/instrument-namespace.ts` — `inst` namespace
  with sampler(), list(), get(), help(); instrument objects with loadSample(),
  noteOn(), noteOff(), stop(), free(), help()
- Registered in `src/renderer/bounce-api.ts`
- Added `inst` to BOUNCE_GLOBALS in repl-evaluator.ts
- DB persistence: instruments auto-save/restore on project load

## Decisions Made

1. **Kept both processors_ and instruments_ in AudioEngine** — the plan's risk
   mitigation suggested implementing alongside existing code first. Legacy
   play/stop/stopAll continues to work via processors_ untouched.
2. **DB persistence is best-effort** — namespace catches and ignores DB errors
   to avoid blocking audio operations.
3. **Instrument ID is auto-generated** — format: `inst_{name}_{timestamp}`,
   invisible to users. The user-visible identifier is the instrument name.

## Deviations from Plan

- Plan suggested replacing processors_ entirely with instruments. Implementation
  keeps both code paths running in parallel (lower risk, same functionality).
- Plan suggested a DefaultInstrument for backward compat. Implementation simply
  keeps the legacy processor path, which is simpler.

## Testing Results

- Native C++ build: ✅ Compiles clean
- TypeScript (electron): ✅ No errors
- TypeScript (renderer): ✅ No errors
- ESLint: ✅ Clean
- Unit tests (`npm run test`): ✅ All pass
- repl-evaluator.test.ts: Pre-existing failure on `nx` reserved name (unrelated)

## Status Updates

### Last Status: 2026-03-21

**What's Done:**
- Full C++ native layer (Instrument base, SamplerInstrument, AudioEngine refactor)
- N-API bindings (9 new methods)
- Complete IPC pipeline (protocol, utility routing, handlers, preload)
- Database migration + CRUD
- REPL namespace with persistence
- Backward compatibility verified

**What's Left:**
- E2E Playwright tests (requires Docker via ./build.sh)

**Next Steps:**
- Run ./build.sh for full E2E verification
- Create tests/instrument.spec.ts

**Blockers/Notes:**
- None

---

## Final Status

<!-- When work is complete, summarize outcome -->

**Completion Date:** TBD

**Summary:**

**Verification:**
- [ ] Linting passed
- [ ] TypeScript builds
- [ ] Tests pass
- [ ] Manual testing complete
- [ ] REPL help() coverage verified by unit and/or Playwright tests (if applicable)
- [ ] REPL returned-object terminal summaries verified by unit and/or Playwright tests (if applicable)
- [ ] Cross-platform tested (if applicable)

**Known Limitations:**

**Future Improvements:**
