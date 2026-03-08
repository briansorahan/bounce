# Plan: Help System Improvements

**Spec:** specs/help-system-improvements  
**Created:** 2026-03-08  
**Status:** In Progress

## Context

See RESEARCH.md for full background. In summary:

- `help()` is a flat list of 21 commands with no organization or per-command detail
- `corpus` is undocumented entirely
- Agreed design: three-section `help()` (Analysis / Resynthesis / Utilities), per-command `.help()` method on every function object, composability workflow examples, and a footer in `help()` pointing users to `.help()`

## Approach Summary

1. Rewrite `help()` in `bounce-api.ts` to emit three labeled sections plus a composability/footer block
2. Attach a `.help` property (returning `BounceResult`) to every function exposed by the bounce API
3. Add `corpus.help()` as a method on the existing corpus object
4. Update TypeScript declarations in `bounce-globals.d.ts` so the type checker accepts `fn.help()`

No new files are needed. All changes are in the renderer TypeScript layer.

## Architecture Changes

No architectural changes. The existing `BounceResult` type is used for all help output. Functions-as-objects is an existing JS pattern — no new abstractions required.

## Changes Required

### Native C++ Changes

None.

### TypeScript Changes

#### `src/renderer/bounce-api.ts`

- **`help()` function (line 675):** Rewrite to emit three sections:
  - `\x1b[1;36m── Analysis ──\x1b[0m` header, then `analyze`, `analyzeNmf`, `analyzeMFCC`
  - `\x1b[1;36m── Resynthesis ──\x1b[0m` header, then `slice`, `sep`, `nx`, `play`, `stop`, `playSlice`, `playComponent`, `granularize`, `corpus`
  - `\x1b[1;36m── Utilities ──\x1b[0m` header, then `display`, `list`, `visualizeNmf`, `visualizeNx`, `onsetSlice`, `nmf`, `debug`, `clearDebug`, `help`, `clear`
  - Footer block with composability examples and `.help()` pointer (see Terminal UI Changes below)

- **Each exposed function:** Attach a `.help` property immediately after definition. Example:
  ```typescript
  analyze.help = (): BounceResult => new BounceResult([
    "\x1b[1;36manalyze(source?, options?)\x1b[0m",
    "",
    "  Runs onset-slice analysis on an audio file or AudioResult.",
    "  ...",
    "",
    "  \x1b[33mExample:\x1b[0m  const f = await analyze()",
    "           slice(f) → playSlice(0)",
  ].join("\n"));
  ```

- **`corpus` object:** Add `help()` method alongside `build`, `query`, `resynthesize`:
  ```typescript
  const corpus = {
    help(): BounceResult { ... },
    async build(...) { ... },
    ...
  };
  ```

Functions that need `.help` attached (and their section):

| Function | Section |
|---|---|
| `analyze` | Analysis |
| `analyzeNmf` | Analysis |
| `analyzeMFCC` | Analysis |
| `slice` | Resynthesis |
| `sep` | Resynthesis |
| `nx` | Resynthesis |
| `play` | Resynthesis |
| `stop` | Resynthesis |
| `playSlice` | Resynthesis |
| `playComponent` | Resynthesis |
| `granularize` | Resynthesis |
| `corpus` | Resynthesis (object, not function — add as method) |
| `display` | Utilities |
| `list` | Utilities |
| `visualizeNmf` | Utilities |
| `visualizeNx` | Utilities |
| `onsetSlice` | Utilities |
| `nmf` | Utilities |
| `debug` | Utilities |
| `clearDebug` | Utilities |
| `help` | Utilities |
| `clear` | Utilities |

#### `src/renderer/bounce-globals.d.ts`

Each function type declaration needs a `help` property added. Two patterns apply:

**Async functions** (most commands):
```typescript
// Before
declare function analyze(source?: ..., options?: ...): Promise<FeatureResult>;

// After
declare const analyze: {
  (source?: ..., options?: ...): Promise<FeatureResult>;
  help(): BounceResult;
};
```

**Synchronous functions** (`stop`, `help`, `clear`):
```typescript
declare const stop: {
  (): BounceResult;
  help(): BounceResult;
};
```

**`corpus` object:** Add `help(): BounceResult` alongside existing method declarations.

### Terminal UI Changes

#### `help()` footer block (three items):

```
  \x1b[90mCompose commands:\x1b[0m
    slice(analyze()) → playSlice(0)                   # onset slicing
    sep(play("path")) → playComponent(0)              # NMF separation
    corpus.build(slice(analyze())) → corpus.query(0, 5)  # corpus

  \x1b[90mFor detailed usage: \x1b[33mfn.help()\x1b[0m\x1b[90m  e.g. analyze.help(), corpus.help()\x1b[0m
```

#### Per-command `.help()` content should include:

1. Full signature (highlighted in cyan)
2. One-paragraph description
3. Options table (if applicable)
4. One realistic usage example

### Configuration/Build Changes

None.

## Testing Strategy

### Unit Tests

No existing unit tests cover `help()` output. No new unit tests are required for this change — the output is display-only and checked via manual/E2E testing.

### E2E Tests

Check whether any existing Playwright tests assert on `help()` output. If so, update them to match the new three-section format.

Search: `tests/` for any test calling `help()` or asserting on its output.

### Manual Testing

- Launch `npm run dev:electron`
- Run `help()` → verify three sections render correctly with correct ANSI colors
- Run `analyze.help()` → verify detailed output for each command
- Run `corpus.help()` → verify corpus method documentation
- Run `help()` → verify footer mentions `.help()` and composability examples
- Verify tab completion is not broken (`.help` on a function shouldn't interfere)

## Success Criteria

- `help()` with no argument shows three labeled sections (Analysis, Resynthesis, Utilities)
- `help()` footer shows composability workflow examples
- `help()` footer mentions `fn.help()` with an example
- Every top-level function and `corpus` responds to `.help()` with a `BounceResult`
- Per-command `.help()` output includes: signature, description, options (where applicable), example
- TypeScript builds without errors (`npm run build:electron`)
- Linter passes (`npm run lint`)
- No existing E2E tests broken

## Risks & Mitigation

| Risk | Mitigation |
|---|---|
| TypeScript declaration changes break REPL type inference | Test `npm run build:electron` after each declaration change; revert if needed |
| E2E tests assert on exact `help()` output | Search tests before implementing; update assertions in same commit |
| Verbose `.help()` content bloats `bounce-api.ts` | This is expected and acceptable; consider a `help-content.ts` helper file if the file grows unwieldy |

## Implementation Order

1. **Search E2E tests** for existing `help()` assertions so we know what needs updating
2. **Rewrite `help()`** in `bounce-api.ts` — three sections + footer (no `.help` properties yet)
3. **Add `.help` methods** to all functions in `bounce-api.ts` (write content for each)
4. **Add `corpus.help()`** to the corpus object
5. **Update `bounce-globals.d.ts`** — convert `declare function` to `declare const` with callable + `.help` signature
6. **Run `npm run lint` and `npm run build:electron`** — fix any type errors
7. **Update any E2E tests** that assert on `help()` output
8. **Manual smoke test** in Electron

## Estimated Scope

Medium — all TypeScript, no native changes. The main work is writing good documentation content for each command's `.help()`.

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements (none broken — `help()` with no arg still works)
- [x] All sections agree on the data model / schema approach (BounceResult throughout)
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
