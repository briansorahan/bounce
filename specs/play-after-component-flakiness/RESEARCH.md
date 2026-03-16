# Research: Play-after-component flakiness

**Spec:** `specs/play-after-component-flakiness`  
**Created:** 2026-03-16  
**Status:** Complete

## Problem Statement

`tests/play-after-component.spec.ts` is failing in GitHub Actions. The test needs an audit for flakiness and correctness so the suite verifies the intended playback behavior without depending on stale or indirect assertions.

## Background

Bounce playback now distinguishes between the currently loaded audio in renderer playback state and the persisted sample records available over Electron APIs. A test that only checks persisted sample metadata can miss bugs in the actual playback transition from component audio back to the full source sample.

## Related Work / Prior Art

- `tests/play-component-then-play-full.spec.ts` already covers the same user scenario through the REPL by running `sn.read(...)`, `samp.nmf(...)`, `feature.playComponent(1)`, and `samp.play()`.
- `tests/playback.spec.ts` uses `__bounceExecuteCommand` and renderer-exposed helpers to verify playback state changes, which is the current pattern for end-to-end playback assertions.

## FluCoMa Algorithm Details

This audit touches NMF-derived component playback only as test setup. No FluCoMa API changes are required.

## Technical Constraints

- Playwright coverage should validate renderer behavior through the exposed REPL/test hooks, not by assuming database ordering or internal sample list contents.
- Verification for Playwright work should use the repository’s Dockerized workflow via `./build.sh`.
- The fix should be minimal and avoid unnecessary playback architecture changes if existing coverage already proves the behavior.

## Audio Processing Considerations

- Component playback swaps current audio to derived component data.
- Full-sample playback must restore current audio to the original sample data before playback begins.
- Assertions should observe the active playback target, not just stored sample metadata.

## Terminal UI Considerations

No REPL surface changes are planned. The test should continue to drive behavior through the existing REPL command path and terminal output.

## Cross-Platform Considerations

The test should avoid timing assumptions and environment-dependent sample ordering so it remains stable across Linux CI and local macOS development.

## Open Questions

- Whether to rewrite the failing spec to match the newer coverage or delete it as redundant.

## Research Findings

- `tests/play-after-component.spec.ts` is stale and incorrect for current architecture:
  - It never actually calls `playComponent()`.
  - It assumes `window.electron.listSamples()[0]` is the target sample.
  - It contains placeholder state checks that never assert playback behavior.
  - Its final expectation only checks that `getSampleByHash()` returns the original sample record, which is not the behavior under test.
- `tests/play-component-then-play-full.spec.ts` already covers the intended scenario with the real REPL execution path and checks that `sn.current()` resolves back to the original sample after `samp.play()`.
- The lowest-risk fix is to remove the stale duplicate test and keep the newer behavioral spec as the source of truth.

## Next Steps

- Document the removal plan.
- Delete the stale spec.
- Validate lint/build/tests after the cleanup.
