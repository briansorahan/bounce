# Plan: JSDoc-Driven CommandHelp Generator

**Spec:** specs/help-system-codegen  
**Created:** 2026-03-28  
**Status:** Complete

## Context

The help system (from `help-system-checks` spec) uses hand-authored `CommandHelp[]` arrays that drift from actual function signatures. Research proved the TS compiler API can extract JSDoc + function signatures, and a prototype validator already caught 4 real drift issues. Two of 12 namespaces use a class-based pattern that differs from the other 10.

**Decisions from research:**
- Unify all namespaces to the `withHelp()` + plain object pattern
- Generate `CommandHelp[]` arrays from JSDoc annotations on command functions
- Output to separate `*-commands.generated.ts` files per namespace
- Use `@namespace` JSDoc tag on builder functions for namespace name discovery
- Integrate generator into `npm run build:electron`

## Approach Summary

Three-phase approach:

1. **Unify namespace patterns** — Eliminate `SampleNamespace` and `ProjectNamespace` classes. Convert to plain objects with `withHelp()`, `toString()`, and inline Promise wrapping. All 12 namespaces + globals use one construction pattern.

2. **Build the generator + validator** — A TypeScript script (`scripts/generate-help.ts`) that:
   - Finds builder functions tagged with `@namespace`
   - Extracts JSDoc (summary, description, `@param`, `@example`) from command functions
   - Extracts function signatures (param names, types, optionality)
   - Writes `*-commands.generated.ts` files
   - A validator test cross-checks generated output against actual signatures

3. **Migrate all namespaces** — Add JSDoc to command functions, run generator, replace hand-authored arrays with generated imports.

## Architecture Changes

**New files:**
- `scripts/generate-help.ts` — Build-time generator script (runs via tsx)
- `src/renderer/namespaces/*-commands.generated.ts` — 12 generated CommandHelp arrays (one per namespace + globals)
- `src/help-codegen.test.ts` — Validator test

**Modified files:**
- All 12 namespace files + globals — JSDoc annotations on functions, import from generated files, remove hand-authored arrays
- `src/renderer/results/sample.ts` — Remove `SampleNamespace` class (keep `SamplePromise`, `CurrentSamplePromise`)
- `src/renderer/results/project.ts` — Remove `ProjectNamespace` class
- `package.json` — Add `generate:help` script, integrate into `build:electron`

**Removed code:**
- `SampleNamespace` class and `SampleNamespaceBindings` interface
- `ProjectNamespace` class and `ProjectNamespaceBindings` interface
- Hand-authored `CommandHelp[]` arrays from all namespace files (replaced by generated imports)
- `src/help-system.test.ts` structural coverage test (replaced by validator)

## Changes Required

### Native C++ Changes

None.

### TypeScript Changes

#### Phase 1: Unify Namespace Patterns

**sample-namespace.ts:**
- Convert from `new SampleNamespace(display, bindings)` to plain object with `withHelp()` per command
- Move `SamplePromise` wrapping into function bodies (e.g. `read()` returns `new SamplePromise(...)` directly)
- Add `toString()` method returning `renderNamespaceHelp(...)` for REPL display
- Add `help()` method returning `renderNamespaceHelp(...)`

**project-namespace.ts:**
- Same refactoring as sample — plain object with `withHelp()` per command
- Add `toString()` and `help()` methods

**sample.ts (results):**
- Remove `SampleNamespace` class and `SampleNamespaceBindings` interface
- Keep `SamplePromise`, `CurrentSamplePromise`, and all other result classes unchanged

**project.ts (results):**
- Remove `ProjectNamespace` class and `ProjectNamespaceBindings` interface
- Keep `ProjectResult`, `ProjectListResult` unchanged

#### Phase 2: Generator + Validator

**scripts/generate-help.ts:**
- Uses `typescript` compiler API (`ts.createSourceFile`, AST walking)
- Discovers namespace files by scanning `src/renderer/namespaces/*.ts`
- For each file, finds the builder function with `@namespace` JSDoc tag
- Walks the builder body to find named function expressions/declarations with JSDoc
- Extracts: first line → `summary`, full block → `description`, `@param` → `params` (description from JSDoc, name/type/optional from signature), `@example` → `examples`
- Generates `signature` from namespace name + function name + param list
- Writes `src/renderer/namespaces/<name>-commands.generated.ts` with the `CommandHelp[]` export
- Special handling for globals: `@namespace globals` produces signatures without a prefix (e.g. `help()` not `globals.help()`)

**src/help-codegen.test.ts:**
- Reads each generated `*-commands.generated.ts` file
- Parses the corresponding namespace source file with the TS compiler API
- Cross-checks: param count, param names, param optionality, non-empty summary
- Replaces the current `src/help-system.test.ts` structural coverage test

#### Phase 3: Migrate All Namespaces

For each of the 12 namespace files + globals:
1. Add JSDoc comments to every command function (summary, description, `@param`, `@example`)
2. Add `@namespace <name>` tag to the builder function
3. Run generator → produces `*-commands.generated.ts`
4. Replace `export const xxxCommands: CommandHelp[] = [...]` with `import { xxxCommands } from "./<name>-commands.generated.js"`
5. Update `withHelp(fn, xxxCommands[N])` references to use the imported array

### Terminal UI Changes

None. The REPL output is identical — only the authoring and build workflow changes.

### REPL Interface Contract

No REPL surface area changes. All `help()` methods produce identical output. The `toString()` display for `sn` and `proj` is preserved via plain object `toString()` method.

#### REPL Contract Checklist

- [x] Every exposed object/namespace/function has a `help()` entry point — unchanged from help-system-checks
- [x] Every returned custom REPL type defines a useful terminal summary — unchanged
- [x] The summary highlights workflow-relevant properties — unchanged
- [x] Unit tests and/or Playwright tests are identified for `help()` output — existing Playwright tests unchanged
- [x] Unit tests and/or Playwright tests are identified for returned-object display behavior — existing tests unchanged

### Configuration/Build Changes

**package.json:**
- Add `"generate:help": "tsx scripts/generate-help.ts"` script
- Modify `build:electron` to run `npm run generate:help` before TypeScript compilation
- Update `test` script: remove `help-system.test.ts`, add `help-codegen.test.ts`

**eslint.config.mjs:**
- Add `*-commands.generated.ts` to ignore patterns (generated files shouldn't be linted for style)

**.gitignore:**
- Generated files should NOT be gitignored — they should be committed so that `npm run build:electron` works without running the generator first on a fresh clone. The generator updates them; the validator catches staleness.

## Testing Strategy

### Unit Tests

**src/help-codegen.test.ts (validator):**
- For each namespace, parse the source file with TS compiler API
- Extract function signatures from the builder function
- Load the generated CommandHelp array
- Assert: param count matches, param names match, param optionality matches
- Assert: every command with parameters has a non-empty `params` array
- Assert: every command has a non-empty `summary`
- Assert: generated file is not stale (re-run generator in memory, compare output)

**src/help.test.ts:**
- Existing tests for `renderNamespaceHelp`, `renderCommandHelp`, `withHelp` — unchanged

### E2E Tests

No new Playwright tests. Existing help-related Playwright tests verify the REPL output is correct. Since we're not changing the output format, they serve as regression tests.

The full Playwright suite (`./build.sh`) must pass to confirm no regressions from:
- Namespace pattern unification (sn, proj behavior unchanged)
- Generated CommandHelp arrays (identical content to hand-authored)

### Manual Testing

- `npm run dev:electron` → type `sn` → verify help text displays (toString)
- `sn.read.help()` → verify detailed help with params
- `proj.help()` → verify namespace summary
- `sn.read("kick.wav").play()` → verify chaining still works after class removal

## Success Criteria

1. All 12 namespaces + globals use the `withHelp()` + plain object pattern (no classes)
2. All command functions have JSDoc annotations
3. Generator produces correct `*-commands.generated.ts` files from JSDoc
4. Validator test passes — generated output matches actual function signatures
5. No hand-authored `CommandHelp[]` arrays remain in namespace files
6. `npm run build:electron` runs the generator automatically
7. `./build.sh` passes (full Playwright suite — no regressions)
8. REPL behavior is identical to before (help output, chaining, display)

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| JSDoc on inline function expressions not parsed by TS API | Generator can't extract docs | Test with prototype first; fall back to extracting functions to top level |
| `SamplePromise` chaining breaks after class removal | User-facing regression | Thorough Playwright coverage of chaining (existing tests cover this) |
| Generator output changes format on TS version upgrade | Spurious diffs | Pin generator output format, use snapshot-style comparison in validator |
| Globals special case (no namespace prefix) complicates generator | Edge case bugs | Handle globals as explicit special case in generator logic |

## Implementation Order

1. **Unify sample-namespace** — Refactor to plain object + `withHelp()`. Run `./build.sh` to verify.
2. **Unify project-namespace** — Same refactoring. Run `./build.sh` to verify.
3. **Build generator script** — `scripts/generate-help.ts`. Test on fs-namespace as reference.
4. **Migrate fs-namespace** — Add JSDoc, run generator, switch to import. Verify output matches current.
5. **Build validator test** — `src/help-codegen.test.ts`. Validate fs-namespace.
6. **Migrate remaining 10 namespaces + globals** — Batch migration with JSDoc annotations.
7. **Wire build integration** — Add generator to `build:electron`, update package.json scripts.
8. **Remove old artifacts** — Delete `src/help-system.test.ts`, remove hand-authored arrays.
9. **Final verification** — `npm run lint && npm test && ./build.sh`

## Estimated Scope

Large — touches all namespace files, adds a build-time codegen step, refactors 2 class hierarchies, creates a new generator script and validator test.

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements — REPL behavior unchanged
- [x] All sections agree on the data model / schema approach — CommandHelp interface unchanged, source moves to JSDoc
- [x] REPL-facing changes define help() coverage — no changes to REPL surface
- [x] Testing strategy names unit and/or Playwright coverage — validator test + existing Playwright suite
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
