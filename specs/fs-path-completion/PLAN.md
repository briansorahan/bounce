# Plan: FS Path Completion in Strings

**Spec:** `specs/fs-path-completion`  
**Created:** 2026-03-15  
**Status:** Complete

## Context

RESEARCH.md shows that quoted path completion is feasible if it is restricted to the first string argument of directory-oriented `fs` helpers. The main architectural challenge is bridging async filesystem lookup into the renderer's synchronous-feeling prompt redraw flow without stale completions overwriting newer input.

## Approach Summary

Introduce a focused async path-completion path for `fs.ls`, `fs.la`, `fs.cd`, and `fs.walk`. The renderer will detect when the cursor is at the end of an unterminated quoted first argument for one of those methods, request candidate directory names from the main process, and render them through the existing ghost text / tab acceptance UX.

## Architecture Changes

- Add `fs-complete-path` IPC in the Electron main process.
- Extend the preload bridge and renderer typings for the new completion API.
- Convert tab-completion refresh to async-safe updates with request/version guards.
- Add a string-path completion context alongside existing top-level and dot-method completion contexts.

## Changes Required

### Native C++ Changes

None.

### TypeScript Changes

- `src/electron/main.ts`
  - Add path-completion IPC handler and reusable path formatting helpers.
- `src/electron/preload.ts`
  - Expose `fsCompletePath(...)` to the renderer.
- `src/renderer/types.d.ts`
  - Add the preload typing for path completion results.
- `src/renderer/tab-completion.ts`
  - Detect scoped `fs.*("...` contexts.
  - Support async updates and path-specific accept/ghost behavior.
  - Prevent stale async updates from mutating current completion state.
- `src/renderer/app.ts`
  - Make redraw/update flow async-safe and ensure Tab waits for the latest completion state when needed.
- `src/tab-completion.test.ts`
  - Add regression coverage for path parsing, matching, and accept behavior.

### Terminal UI Changes

- Quoted path fragments in supported `fs` methods should display ghost completions and multi-match lists like existing completions.
- Accepted directory completions should append `/` and keep the cursor inside the string.

### Configuration/Build Changes

None.

## Testing Strategy

### Unit Tests

- Add tests for parsing `fs.ls("prefix`-style inputs.
- Add tests for single-match acceptance and multi-match scoping for path completions.
- Add tests proving non-path contexts still use existing completions.

### E2E Tests

- None required for the first pass if unit coverage plus manual smoke testing is sufficient.

### Manual Testing

- In the Electron REPL, type `fs.ls("...`, `fs.la("...`, `fs.cd("...`, and `fs.walk("...` with partial directory names.
- Verify hidden directory behavior differs between `fs.ls` and `fs.la`.
- Verify fast typing does not leave stale ghost text behind.

## Success Criteria

- `fs.ls("partial` and peers offer directory completions instead of top-level symbol completions.
- Accepted completions insert the remainder of the path text without breaking the surrounding string.
- Existing top-level and dot-method completion behavior remains intact.
- Lint, renderer build, and test suite pass.

## Risks & Mitigation

- **Async race conditions:** Guard completion updates and redraws with monotonically increasing request IDs.
- **Over-broad string matching:** Restrict parsing to explicit `fs.ls/la/cd/walk` first-argument contexts.
- **Cross-platform path quirks:** Insert slash-normalized completion text and rely on existing path resolution in the main process.

## Implementation Order

1. Add the main-process path-completion helper and preload bridge.
2. Extend `TabCompletion` with a path-completion context and async update flow.
3. Make `BounceApp` redraw / Tab handling awaitable and race-safe.
4. Add focused completion tests.
5. Run lint, build, and tests.

## Estimated Scope

Medium

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements
- [x] All sections agree on the data model / schema approach
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
