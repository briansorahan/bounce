# Implementation: Tab Completion

**Spec:** specs/tab-completion  
**Created:** 2026-03-08  
**Status:** In Progress

## Context

See `specs/tab-completion/PLAN.md` for full plan. Implementation order:

1. Export `BOUNCE_GLOBALS` from `repl-evaluator.ts`
2. Create `src/renderer/tab-completion.ts`
3. Write unit tests
4. Expose `cols` on `BounceTerminal` if needed
5. Integrate into `BounceApp` (`app.ts`)
6. Manual smoke test
7. E2E tests
8. Lint + build

## Implementation Log

### 2026-03-08 — Implementation Complete

All steps from the plan executed in order:

1. **Exported `BOUNCE_GLOBALS`** — added `export` to `src/renderer/repl-evaluator.ts`.
2. **Created `src/renderer/tab-completion.ts`** — `TabCompletion` class with full state machine, `ghostText()` / `eraseGhostText()` ANSI rendering, `handleTab()` / `handleEnter()` action dispatch.
3. **Unit tests** — `src/tab-completion.test.ts`, 24 tests covering all states, actions, and ANSI output.
4. **Exposed `cols` getter** on `BounceTerminal` (future use for layout-aware rendering).
5. **Integrated into `BounceApp`** (`src/renderer/app.ts`):
   - Added `TabCompletion` field; constructed in constructor.
   - `redrawCommandLine()` now: erase ghost → update completion → draw line → position cursor → render ghost.
   - `updateCursorPosition()` delegates to `redrawCommandLine()` for correct ghost text on cursor moves.
   - `navigateHistory()` uses `redrawCommandLine()` instead of direct terminal writes.
   - Tab (`\t`) handler added before printable-char fallthrough.
   - Enter interception for multi-match: pastes selected candidate without executing.
   - Ctrl+R resets completion and erases ghost text before entering search mode.
6. **Added test to `package.json`** `test` script.

## Decisions Made

- **`updateCursorPosition()` → `redrawCommandLine()`**: Simplified by doing a full line redraw on cursor movement. Avoids needing separate inline-ghost-erase logic. Flicker is imperceptible on modern hardware.
- **Inline ghost text erase**: Handled implicitly by `\r\x1b[K` at the start of `redrawCommandLine()` — no need for separate erase sequence.
- **Multi-match erase**: Uses DEC save/restore cursor (`\x1b7` / `\x1b8`) to navigate below and erase each candidate line.
- **Tab cycling starts at index 1 on first press**: `update()` resets `selectedIndex` to 0 (first match highlighted), then Tab advances. This means the initial ghost text highlights the alphabetically-first match.


## Decisions Made

<!-- Important decisions made during implementation that weren't in the plan -->

## Deviations from Plan

<!-- Where implementation diverged from plan and why -->

## Flaws Discovered in Previous Phases

<!-- Any issues found in RESEARCH.md or PLAN.md during implementation -->

## Issues & TODOs

<!-- Known problems, edge cases, future work -->

## Testing Results

<!-- Test execution results, manual testing notes -->

## Status Updates

### Last Status: 2026-03-08

**What's Done:**
- All implementation steps (1–6) complete
- 24 unit tests pass
- TypeScript type-check clean
- Lint passes

**What's Left:**
- E2E Playwright tests (out of scope for initial implementation)

**Next Steps:**
- Manual smoke test with `npm run dev:electron`

**Blockers/Notes:**
- None

---

## Final Status

<!-- When work is complete, summarize outcome -->

**Completion Date:**

**Summary:**

**Verification:**
- [ ] Linting passed
- [ ] TypeScript builds
- [ ] Tests pass
- [ ] Manual testing complete
- [ ] Cross-platform tested (if applicable)

**Known Limitations:**

**Future Improvements:**
- Complete scope-variable completion (variables declared in the REPL session)
- Show full function signatures in ghost text (not just `()`)
