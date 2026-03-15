# Implementation: Scope Variable Completion

**Spec:** specs/scope-variable-completion  
**Created:** 2026-03-15  
**Status:** In Progress

## Context

Following `specs/scope-variable-completion/PLAN.md`, this implementation restores command prediction for `Sample` API workflows after assignment to REPL variables by connecting tab completion to evaluator scope and widening identifier support.

## Implementation Log

### 2026-03-15 - Started Implementation

- Confirmed the reported failure is caused by two gaps:
  - completion only checks the static built-in API object, not evaluator scope
  - the dot-completion regex rejects identifiers containing `_`
- Verified that `ReplEvaluator` already persists assigned variables in `scopeVars`, making the fix local to renderer completion plumbing.

### 2026-03-15 - Implemented Scope-Aware Dot Completion

- Added `ReplEvaluator.getCompletionBindings()` so renderer completion can inspect persisted REPL variables without mutating evaluator state.
- Updated `BounceApp` to provide `TabCompletion` with a scope-aware bindings provider.
- Extended `TabCompletion` dot-completion parsing to accept `_` and `$` in identifiers and to resolve object members from merged built-in + scope bindings.
- Kept the existing top-level ghost text and `fs` path-completion flow unchanged; the fix is intentionally scoped to object-member prediction.
- Added focused unit tests for underscore-containing variable names and scope-backed dot completion.

## Decisions Made

- Implement completion against merged built-in + scope bindings instead of special-casing `Sample`.
- Keep `help()` and returned-object display behavior unchanged because this is a discoverability fix, not a REPL surface redesign.
- Limit this rollout to dot completion for scope variables rather than top-level variable-name completion, so non-callable variables are not incorrectly suggested as `name()`.

## Deviations from Plan

- Top-level scope variable name completion was deferred even though it was considered during planning. The reported bug only required object-member prediction, and keeping the existing top-level completion behavior avoided accidental `variableName()` insertions for non-callable values.

## Flaws Discovered in Previous Phases

- Earlier completion work intentionally left scope-variable completion as future work; the sample-object API now depends on that capability more heavily than before.

## Issues & TODOs

- Consider a future completion context that can distinguish callable vs non-callable top-level scope variables before adding full variable-name completion.

## Testing Results

- `npx tsx src/tab-completion.test.ts` — passed
- `npx tsx src/repl-evaluator.test.ts` — passed
- `npx tsx src/bounce-api.test.ts` — passed
- `npm run lint` — passed
- `npm run build:electron` — passed

## Status Updates

### Last Status: 2026-03-15

**What's Done:**
- Root cause analysis completed.
- Research/plan written for the follow-up fix.
- Completion wiring and focused tests implemented.

**What's Left:**
- Manual verification in the Electron app if desired.

**Next Steps:**
- Try the reported `contact_mic_on_plate.pl` workflow in the app and confirm the ghost text feels right.

**Blockers/Notes:**
- None.

---

## Final Status

**Completion Date:** 2026-03-15

**Summary:**
Added scope-aware dot completion for REPL variables so `Sample` API objects assigned to user variables now participate in ghost-text prediction. The fix uses evaluator scope as an additional completion source, broadens identifier parsing to support underscores, and keeps existing top-level/global and `fs` path completion behavior intact.

**Verification:**
- [x] Linting passed
- [x] TypeScript builds
- [x] Tests pass
- [ ] Manual testing complete
- [x] REPL help() coverage verified by unit and/or Playwright tests (if applicable)
- [x] REPL returned-object terminal summaries verified by unit and/or Playwright tests (if applicable)
- [ ] Cross-platform tested (if applicable)

**Known Limitations:**
- Top-level variable-name completion is still not implemented; only scope-variable dot completion is added here.

**Future Improvements:**
- Add full top-level scope variable completion once completion contexts can distinguish callable and non-callable inserted suffixes cleanly.
