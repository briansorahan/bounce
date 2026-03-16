# Implementation: Play-after-component flakiness

**Spec:** `specs/play-after-component-flakiness`  
**Created:** 2026-03-16  
**Status:** Complete

## Context

The plan is to remove `tests/play-after-component.spec.ts` because it is stale and redundant with `tests/play-component-then-play-full.spec.ts`, which already verifies the intended playback transition through the real REPL path.

## Implementation Log

### 2026-03-16 - Started Implementation

- Investigated the failing GitHub Actions job and compared the stale test with the newer playback coverage.
- Confirmed the failing test never calls `playComponent()` and only inspects persisted sample records instead of active playback state.
- Removed `tests/play-after-component.spec.ts` because it was redundant with `tests/play-component-then-play-full.spec.ts`, which exercises the same workflow through the real REPL path.

## Decisions Made

- Prefer deleting the stale spec over rewriting it because the existing replacement test already covers the real user workflow with better fidelity.

## Deviations from Plan

None.

## Flaws Discovered in Previous Phases

None yet.

## Issues & TODOs

- Run repository validation after removing the stale test.
- `./build.sh` still reports an unrelated timeout in `tests/filesystem.spec.ts:52` (`fs.pwd() returns an absolute path via REPL`).

## Testing Results

- `npm run lint` passed.
- `npm run build:electron` passed.
- `npm run test` passed.
- `./build.sh` reran the Dockerized workflow. The relevant playback regression coverage passed, including `tests/play-component-then-play-full.spec.ts`, but the overall workflow still failed due to an unrelated timeout in `tests/filesystem.spec.ts:52`.

## Status Updates

### Last Status: 2026-03-16

**What's Done:**
- Root cause investigation completed.
- Spec files created for the flaky test audit.
- Stale failing test removed.
- Validation run completed and the remaining failure was identified as unrelated.

**What's Left:**
- No work remains for this flaky playback test audit.

**Next Steps:**
- Investigate the unrelated `tests/filesystem.spec.ts:52` timeout separately if full workflow green status is required.

**Blockers/Notes:**
- `./build.sh` may take longer because it rebuilds native dependencies and runs the Dockerized Playwright workflow.

---

## Final Status

**Completion Date:** 2026-03-16

**Summary:**
Removed the stale `tests/play-after-component.spec.ts` Playwright spec after confirming it did not execute real component playback and only asserted persisted sample metadata. The intended regression remains covered by `tests/play-component-then-play-full.spec.ts`, which passed in the Dockerized workflow run.

**Verification:**
- [x] Linting passed
- [x] TypeScript builds
- [ ] Tests pass
- [ ] Manual testing complete
- [x] REPL help() coverage verified by unit and/or Playwright tests (if applicable)
- [x] REPL returned-object terminal summaries verified by unit and/or Playwright tests (if applicable)
- [x] Cross-platform tested (if applicable)

**Known Limitations:**

- The full Dockerized workflow is still red because of an unrelated timeout in `tests/filesystem.spec.ts:52`.

**Future Improvements:**

- If future playback regressions require more targeted coverage, add a new spec that asserts active playback state directly instead of stored sample metadata.
