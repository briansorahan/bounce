# Implementation: Utility-Process Playback Engine

**Spec:** specs/utility-process-playback  
**Created:** 2026-03-16  
**Status:** Complete

## Implementation Log

Implementation completed 2026-03-18.

### Files Created

| File | Purpose |
|---|---|
| `native/include/audio-processor.h` | Abstract `AudioProcessor` base class |
| `native/include/sample-playback-engine.h` | `SamplePlaybackEngine` header |
| `native/src/sample-playback-engine.cpp` | Mono looping/one-shot playback engine |
| `native/include/audio-engine.h` | `AudioEngine` header (miniaudio device + processor pool) |
| `native/src/audio-engine.cpp` | `AudioEngine` impl with lock-free ring buffer telemetry |
| `native/src/audio-engine-binding.cpp` | N-API bindings: play/stop/stopAll/onPosition/onEnded |
| `third_party/miniaudio/miniaudio.h` | Vendored miniaudio single-header library |
| `src/utility/audio-engine-process.ts` | Utility process entry point bridging MessagePort ↔ native |

### Files Modified

| File | Change |
|---|---|
| `binding.gyp` | Added `audio_engine_native` target with miniaudio include |
| `src/electron/main.ts` | Utility process lifecycle, IPC broker for play/stop/telemetry |
| `src/electron/preload.ts` | playSample, stopSample, onPlaybackPosition, onPlaybackEnded |
| `src/renderer/audio-context.ts` | Native IPC path; telemetry-driven cursor; Web Audio fallback |
| `src/renderer/app.ts` | playback-position / playback-ended IPC listeners |
| `src/renderer/types.d.ts` | ElectronAPI: 4 new method signatures |
| `tsconfig.electron.json` | Include src/utility/**/* |

## Decisions Made

- **Web Audio fallback kept**: Corpus-resynthesize calls `playAudio()` without a hash. The Web Audio path is preserved for this case rather than requiring a SQLite-backed hash.
- **nativePlaybacks kept alive on ended**: When `playback-ended` arrives, the entry is marked `ended: true` but not deleted. This keeps the cursor at the final position until `stopAudio()` is called explicitly. Matches expected test behaviour and is better UX.
- **Graceful utility process degradation**: If `AudioEngine()` constructor fails (e.g., no audio device in headless Docker), the utility process stays alive but idle. `SIGTERM` handler ensures clean exit.
- **PCM structured-cloned across MessagePort**: Electron's `MessagePortMain` TypeScript types only accept `MessagePortMain[]` in the transfer list, so the PCM ArrayBuffer is copied via structured clone rather than zero-copy transfer.

## Deviations from Plan

- Zero-copy PCM transfer not implemented (Electron type constraint). PCM is structured-cloned across the MessagePort boundary. Performance impact is acceptable for file-sized audio data.
- C++ unit tests for `SamplePlaybackEngine` and `AudioEngine` not written (MVP scope — validated via Playwright suite instead).

## Testing Results

All 70 Playwright tests pass (1 pre-existing skip). 0 failures.

## Final Status

**Completion Date:** 2026-03-18

**Verification:**
- [x] Linting passed
- [x] TypeScript builds
- [x] Tests pass (70/70 Playwright)
- [x] REPL help() coverage verified — no new REPL surface introduced
- [x] REPL returned-object terminal summaries — no new return types


## Implementation Log

No implementation work has been recorded yet.

## Decisions Made

None yet.

## Deviations from Plan

None yet.

## Flaws Discovered in Previous Phases

None yet.

## Issues & TODOs

- Complete the PLAN phase before implementation begins.

## Testing Results

Not applicable yet.

## Status Updates

### Last Status: 2026-03-16

**What's Done:**
- Created the spec skeleton
- Completed the research phase document

**What's Left:**
- Write the implementation plan
- Implement and validate the chosen architecture

**Next Steps:**
- Review `RESEARCH.md`
- Start the PLAN phase once the architecture direction is approved

**Blockers/Notes:**
- This spec currently documents research only

---

## Final Status

Implementation not started.

**Completion Date:** 2026-03-16

**Summary:**

The spec has been created and the research phase is complete. Planning and implementation remain outstanding.

**Verification:**
- [ ] Linting passed
- [ ] TypeScript builds
- [ ] Tests pass
- [ ] Manual testing complete
- [ ] REPL help() coverage verified by unit and/or Playwright tests (if applicable)
- [ ] REPL returned-object terminal summaries verified by unit and/or Playwright tests (if applicable)
- [ ] Cross-platform tested (if applicable)

**Known Limitations:**

- No implementation work has been done yet.

**Future Improvements:**

- Fill out `PLAN.md`
- Record implementation progress in this file once coding begins
