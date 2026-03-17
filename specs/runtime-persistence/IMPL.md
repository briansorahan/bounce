# Implementation: Persist REPL Runtime Environment

**Spec:** specs/runtime-persistence  
**Created:** 2026-03-17  
**Status:** In Progress

## Context

See PLAN.md. Key summary:
- Add `repl_env` table (migration 006), two IPC channels, serialization/restore methods on
  `ReplEvaluator`, and a restore hook in `app.ts` / `bounce-api.ts`.
- JSON-serializable values and function source code are persisted per project.
- Bounce API objects are silently skipped.

## Implementation Log

### 2026-03-17 - Implementation Complete

All steps from PLAN.md implemented in a single session.

**Files changed:**
- `src/electron/database.ts` — `ReplEnvRecord` interface, migration 006 (`repl_env` table), `saveReplEnv()`, `getReplEnv()`
- `src/electron/main.ts` — imported `ReplEnvRecord`; added `save-repl-env` and `get-repl-env` IPC handlers
- `src/electron/preload.ts` — added `saveReplEnv` and `getReplEnv` to contextBridge
- `src/electron/types.d.ts` — added `saveReplEnv` and `getReplEnv` to `ElectronAPI` interface
- `src/renderer/types.d.ts` — added `saveReplEnv` and `getReplEnv` to renderer `window.electron` type
- `src/renderer/repl-evaluator.ts` — added `functionSources` map, `serializeScope()`, `restoreScope()`, `clearScope()`; populated `functionSources` in `evaluate()`
- `src/renderer/bounce-api.ts` — extended `BounceApiDeps.runtime` with `serializeScope`; updated `proj.load()` to save outgoing scope before switching
- `src/renderer/app.ts` — added `serializeScope` to runtime deps; updated `bounce:project-changed` handler to use `refreshForProject()`; added `beforeunload` save; added `loadScopeFromStorage()` and `refreshForProject()` methods; called `loadScopeFromStorage()` on startup
- `src/repl-evaluator.test.ts` — added `testReplEnvPersistence()` with 8 assertions covering all serialize/restore/clear cases
- `tests/runtime-persistence.spec.ts` — new Playwright spec with 4 E2E tests

## Decisions Made

- Renderer `window.electron` types live in `src/renderer/types.d.ts`, not `src/electron/types.d.ts` — the electron-side file is a partial declaration. Both were updated.
- `refreshHistoryForProject()` was renamed to `refreshForProject()` since it now handles both history and scope.
- For the `kind` type annotation in `loadScopeFromStorage`, values returned from the DB are typed as `"json" | "function"` matching the CHECK constraint in SQLite.

## Deviations from Plan

- None significant. The `BounceApiDeps.runtime` extension approach was used rather than passing evaluator directly, consistent with the existing pattern.

## Flaws Discovered in Previous Phases

- Plan referenced `src/electron/types.d.ts` for the renderer window type, but the authoritative renderer type is in `src/renderer/types.d.ts`. Both files needed updating.

## Issues & TODOs

- Bounce API objects (Sample, Feature, Vis) are not restored — skipped gracefully. Future: reconstruct from DB hash.

## Testing Results

- `npx tsx src/repl-evaluator.test.ts` — all 8 new assertions pass, all existing tests pass
- `npm run lint` — clean
- `npm run build:electron` — clean

## Status Updates

### Last Status: 2026-03-17

**What's Done:**
- All implementation steps complete

**What's Left:**
- E2E validation via `./build.sh` (Dockerized Playwright)

**Next Steps:**
- Run `./build.sh` to execute Playwright suite including `runtime-persistence.spec.ts`

**Blockers/Notes:**
- None

---

## Final Status

**Completion Date:** _pending_

**Summary:** _pending_

**Verification:**
- [ ] Linting passed
- [ ] TypeScript builds
- [ ] Tests pass
- [ ] Manual testing complete
- [ ] REPL help() coverage verified — N/A
- [ ] REPL returned-object terminal summaries verified — N/A
- [ ] Cross-platform tested (if applicable)

**Known Limitations:**
- Bounce API objects (`Sample`, `OnsetFeature`, etc.) are not restored — users must re-run the
  commands that created them. Future work: reconstruct from DB hash or replay command history.

**Future Improvements:**
- Reconstruct `Sample` objects from DB hash on restore
- Replay command history selectively for un-restored variables
- Add `env.save()` / `env.restore()` for explicit manual persistence
