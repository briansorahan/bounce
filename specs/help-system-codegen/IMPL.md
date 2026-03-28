# Implementation: JSDoc-Driven CommandHelp Generator

**Spec:** specs/help-system-codegen  
**Created:** 2026-03-28  
**Status:** Complete

## Context

Replaced hand-authored `CommandHelp[]` arrays across all 12 namespace files with a JSDoc-driven generator. The TS compiler API extracts `@param`/`@example` tags and function signatures to produce `*-commands.generated.ts` files. A 5-test validator (187 checks) enforces completeness via a closed loop through `bounce-api.ts`.

## Implementation Log

### 2026-03-28 - Phase 1: Namespace Pattern Unification

- Refactored `sample-namespace.ts` from `SampleNamespace` class to plain object with `withHelp()` + `toString()`
- Refactored `project-namespace.ts` from `ProjectNamespace` class to plain object with `withHelp()` + `toString()`
- Removed `SampleNamespaceBindings` / `SampleNamespace` class from `sample.ts`
- Removed `ProjectNamespaceBindings` / `ProjectNamespace` class from `project.ts`
- Added `SampleNamespace` / `ProjectNamespace` type aliases for the plain object shapes

### 2026-03-28 - Phase 2: Generator + Validator

- Created `src/help-generator.ts` — TS compiler API core: `processFile()`, `generateFile()`, types
- Created `scripts/generate-help.ts` — file-walking entrypoint, imports from `src/help-generator.ts`
- Migrated `fs-namespace.ts` as reference: added JSDoc, wired generated import
- Created `src/help-codegen.test.ts` — 5-test validator (187 checks)

### 2026-03-28 - Phase 3: Full Migration

- Added JSDoc to all command functions in remaining 10 namespaces + globals
- Replaced hand-authored `CommandHelp[]` arrays with generated imports in all files
- Re-ran generator to produce all 12 `*-commands.generated.ts` files
- Wired `npm run generate:help` into `build:electron`
- Added `*-commands.generated.ts` to eslint ignore
- Removed `src/help-system.test.ts` (replaced by `src/help-codegen.test.ts`)
- Fixed rootDir TS error by extracting shared logic to `src/help-generator.ts`
- Added `scripts/` to Dockerfile COPY

## Decisions Made

- `src/help-generator.ts` holds the shared types + functions so both the generator script and the test can import from within `rootDir`
- Generated files are committed to the repo (not gitignored) — `build:electron` updates them but a fresh clone works without running the generator manually
- `errors.dismiss` / `errors.dismissAll` remain manually handled (Object.assign pattern not walked by generator)
- `vis-namespace.ts` inner functions renamed (`listScenes`→`list`, etc.) to align generated names with property keys

## Deviations from Plan

- Plan said "replace `help-system.test.ts`" — done, but also needed to add `export { fsCommands }` re-export to `fs-namespace.ts` since `help-system.test.ts` imported it there (pre-existing gap)
- `scripts/` needed to be added to the Dockerfile — not in plan

## Testing Results

- `npm run lint` — ✅ clean
- `npm run build:electron` — ✅ generator runs + TS compiles
- `npm test` — ✅ 187 checks passed
- `./build.sh` — ✅ 139 Playwright tests passed, 1 pre-existing flaky timeout (playback overlap test, also fails on `main`)

## Final Status

**Completion Date:** 2026-03-28

**Summary:** Eliminated all hand-authored `CommandHelp[]` arrays. Documentation now lives as JSDoc on command functions. The generator produces `*-commands.generated.ts` from JSDoc + signatures. A 5-test validator with closed-loop completeness checking ensures no namespace can be added to the REPL without coverage.

**Verification:**
- [x] Linting passed (`npm run lint`)
- [x] TypeScript builds (`npm run build:electron`)
- [x] `./build.sh` passes (139/140 Playwright tests; 1 pre-existing flaky failure also present on `main`)
- [x] Manual testing not required (no REPL behavior changes)
- [x] REPL help() coverage verified by existing Playwright tests (unchanged output)
- [x] REPL returned-object terminal summaries verified by existing Playwright tests (unchanged)

**Known Limitations:**
- `errors.dismiss` / `errors.dismissAll` JSDoc not generator-driven (Object.assign pattern)

**Future Improvements:**
- Support Object.assign sub-command pattern in the generator
