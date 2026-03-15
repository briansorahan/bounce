# Plan: Sample Looping

**Spec:** specs/sample-looping  
**Created:** 2026-03-15  
**Status:** In Progress

## Context

`RESEARCH.md` showed that sample playback already flows through a shared `AudioManager`, making `sample.loop()` a small, behaviorally consistent addition to the existing `Sample` API. The main implementation concern is keeping playback-position updates sensible while looping.

## Approach Summary

Extend `AudioManager.playAudio()` with an optional loop flag, then add `sample.loop()` as a `Sample` method that follows the same loading/display path as `sample.play()` while enabling looping on the transport. Update help text, typings, and tests so the method is discoverable and covered.

## Architecture Changes

- `AudioManager`
  - accept an optional loop flag when starting playback
  - track whether current playback is looping
  - wrap playback cursor updates while looping
- `Sample` bindings / `buildBounceApi()`
  - add `loop()` alongside `play()`
- REPL typings and help
  - include `loop()` in the `Sample` interface and help summaries

## Changes Required

### Native C++ Changes

None.

### TypeScript Changes

- `src/renderer/audio-context.ts`
  - add loop-enabled playback support and loop-aware playback-position updates
- `src/renderer/bounce-result.ts`
  - add `loop()` to `SampleMethodBindings` and `Sample`
- `src/renderer/bounce-api.ts`
  - add `sample.loop()` binding and loop-specific return text/help text
- `src/renderer/bounce-globals.d.ts`
  - declare `Sample.loop()`
- `src/bounce-api.test.ts`
  - add focused assertions for `sample.loop()`, help text, and transport wiring

### Terminal UI Changes

- `Sample.help()` should list `sample.loop()`.
- Evaluating the return value of `sample.loop()` should show a looping-specific summary.

### REPL Interface Contract

- `Sample` exposes `help()`, `play()`, `loop()`, `stop()`, `display()`, and the existing analysis/resynthesis methods.
- `sample.loop()` returns a `Sample` object summary that clearly indicates looping playback is active.
- No new namespace or feature objects are introduced.

#### REPL Contract Checklist

- [x] Every exposed object/namespace/function has a `help()` entry point or an explicit reason why not
- [x] Every returned custom REPL type defines a useful terminal summary
- [x] The summary highlights workflow-relevant properties, not raw internal structure
- [x] Unit tests and/or Playwright tests are identified for `help()` output
- [x] Unit tests and/or Playwright tests are identified for returned-object display behavior

### Configuration/Build Changes

None.

## Testing Strategy

### Unit Tests

- Update `src/bounce-api.test.ts` to assert:
  - `sample.help()` mentions `sample.loop()`
  - `sample.loop()` returns a `Sample`
  - the returned summary indicates looping
  - the audio manager receives a loop-enabled playback request
- Run `npx tsx src/bounce-api.test.ts`

### E2E Tests

None initially.

### Manual Testing

- Load a sample in the REPL
- Run `const samp = sn.read("loop.wav")`
- Run `samp.loop()`
- Confirm audible looping and that `samp.stop()` stops playback

## Success Criteria

- `Sample` exposes `loop()` in help text, typings, and runtime behavior.
- `sample.loop()` continuously loops playback until `sample.stop()` is called.
- Playback-position updates remain stable while looping.
- Focused tests, lint, and build pass.

## Risks & Mitigation

- **Risk:** Looping playback could leave the waveform cursor running past the sample length.  
  **Mitigation:** wrap playback position modulo buffer length while looping.

- **Risk:** Changing `playAudio()` could affect non-loop playback.  
  **Mitigation:** make the loop flag optional with a default of `false` and re-run focused tests/build.

## Implementation Order

1. Extend `AudioManager.playAudio()` with loop support.
2. Add `loop()` to `Sample` bindings and `buildBounceApi()`.
3. Update help text and typings.
4. Add focused tests.
5. Run validation commands.

## Estimated Scope

Small

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements
- [x] All sections agree on the data model / schema approach
- [x] REPL-facing changes define help() coverage and returned-object terminal summaries
- [x] Testing strategy names unit and/or Playwright coverage for REPL help/display behavior where applicable
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
