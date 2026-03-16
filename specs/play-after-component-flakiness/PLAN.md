# Plan: Play-after-component flakiness

**Spec:** `specs/play-after-component-flakiness`  
**Created:** 2026-03-16  
**Status:** Complete

## Context

Research showed that `tests/play-after-component.spec.ts` no longer exercises the real playback transition it claims to test. A newer spec, `tests/play-component-then-play-full.spec.ts`, already covers the intended behavior through the REPL and renderer playback state.

## Approach Summary

Remove the stale failing Playwright spec instead of patching it. Keep the more realistic `play-component-then-play-full.spec.ts` as the canonical coverage for “component playback followed by full-sample playback restores the original audio.”

## Architecture Changes

No production architecture changes are required. This is test-suite maintenance to align coverage with the current playback model.

## Changes Required

### Native C++ Changes

None.

### TypeScript Changes

- Delete `tests/play-after-component.spec.ts`.
- Update implementation notes in the spec files for traceability.

### Terminal UI Changes

None.

### REPL Interface Contract

None. This work does not change REPL surface area; it only preserves existing REPL-driven test coverage.

#### REPL Contract Checklist

- [x] Every exposed object/namespace/function has a `help()` entry point or an explicit reason why not
- [x] Every returned custom REPL type defines a useful terminal summary
- [x] The summary highlights workflow-relevant properties, not raw internal structure
- [x] Unit tests and/or Playwright tests are identified for `help()` output
- [x] Unit tests and/or Playwright tests are identified for returned-object display behavior

Reason: no REPL contract changes are part of this fix, so existing coverage remains the authority.

### Configuration/Build Changes

None.

## Testing Strategy

### Unit Tests

- Run `npm run lint`.
- Run `npm run build:electron`.
- Run `npm run test`.

### E2E Tests

- Run `./build.sh` to validate the full Dockerized workflow, including Playwright.
- Confirm the remaining playback test `tests/play-component-then-play-full.spec.ts` continues to provide the intended regression coverage.

### Manual Testing

Not required beyond automated validation for this test-only cleanup.

## Success Criteria

- The failing stale spec is removed from the suite.
- Equivalent behavior remains covered by `tests/play-component-then-play-full.spec.ts`.
- Validation commands pass without introducing new test regressions.

## Risks & Mitigation

- Risk: deleting the test could remove unique coverage.
  - Mitigation: confirm the remaining test covers the same end-user workflow through the actual REPL path.
- Risk: other Playwright tests may rely on the stale test’s setup assumptions.
  - Mitigation: restrict changes to the single redundant spec and rerun the repository validation commands.

## Implementation Order

1. Delete `tests/play-after-component.spec.ts`.
2. Update `specs/play-after-component-flakiness/IMPL.md` with findings and rationale.
3. Run lint/build/tests, including `./build.sh`.
4. Summarize the outcome and any residual limitations.

## Estimated Scope

Small.

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements
- [x] All sections agree on the data model / schema approach
- [x] REPL-facing changes define help() coverage and returned-object terminal summaries
- [x] Testing strategy names unit and/or Playwright coverage for REPL help/display behavior where applicable
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
