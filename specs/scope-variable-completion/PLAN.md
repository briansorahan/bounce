# Plan: Scope Variable Completion

**Spec:** specs/scope-variable-completion  
**Created:** 2026-03-15  
**Status:** In Progress

## Context

`RESEARCH.md` showed that Sample workflows now depend on instance-method discoverability, but completion still only understands built-in API objects. The missing piece is access to evaluator scope plus identifier parsing that accepts underscores and other common JavaScript identifier characters.

## Approach Summary

Expose REPL scope bindings from `ReplEvaluator`, then teach `TabCompletion` to resolve identifiers from a merged completion context consisting of built-in API bindings plus persisted scope variables. Keep the existing ghost-text UX and `fs` path-completion behavior intact. Add focused tests proving that variables created from `sn.read()`-style workflows can predict methods like `.play()`.

## Architecture Changes

- `ReplEvaluator` will expose a read-only view of current scope bindings for completion.
- `BounceApp` will provide `TabCompletion` with a completion context function backed by the evaluator.
- `TabCompletion` will:
  - look up top-level candidates from both built-in globals and scope variables
  - resolve dot completion against merged bindings
  - recognize identifiers containing `_` and `$`

## Changes Required

### Native C++ Changes

None.

### TypeScript Changes

- `src/renderer/repl-evaluator.ts`
  - add a completion-oriented scope snapshot or binding lookup API
- `src/renderer/tab-completion.ts`
  - merge built-in and scope completion sources
  - broaden identifier parsing
  - preserve existing ghost text, cycling, and `fs` path completion behavior
- `src/renderer/app.ts`
  - wire `TabCompletion` to the evaluator's scope-aware completion source
- `src/tab-completion.test.ts`
  - add tests for scope variable completion and underscore-containing identifiers

### Terminal UI Changes

- Ghost text should appear for user-defined variables holding `Sample`-like objects.
- Tab/arrow/Enter behavior should stay identical to current completion UX.

### REPL Interface Contract

This fix does not add new REPL objects or methods.

- Existing `help()` coverage remains unchanged.
- Existing returned-object terminal summaries remain unchanged.
- The REPL contract improvement is discoverability: methods on returned `Sample`-like objects must now be reachable through command prediction even after assignment to user variables.

#### REPL Contract Checklist

- [x] Every exposed object/namespace/function has a `help()` entry point or an explicit reason why not
- [x] Every returned custom REPL type defines a useful terminal summary
- [x] The summary highlights workflow-relevant properties, not raw internal structure
- [x] Unit tests and/or Playwright tests are identified for `help()` output
- [x] Unit tests and/or Playwright tests are identified for returned-object display behavior

### Configuration/Build Changes

None.

## Testing Strategy

### Unit Tests

- Extend `src/tab-completion.test.ts` with:
  - a scope variable name completion test
  - a scope variable dot-method completion test
  - an underscore-containing variable member prediction test mirroring the reported failure
- Run `npx tsx src/tab-completion.test.ts`
- Re-run `npx tsx src/repl-evaluator.test.ts` to ensure evaluator changes do not break scope persistence

### E2E Tests

None initially. The bug is isolated enough for focused unit coverage.

### Manual Testing

- In the REPL, assign `const contact_mic_on_plate = sn.read("...wav")`
- Type `contact_mic_on_plate.pl` and verify ghost text suggests `ay()`
- Confirm `sn.` and `fs.` completion still behave as before

## Success Criteria

- Variables declared in the REPL session participate in command prediction.
- `contact_mic_on_plate.pl` produces ghost text for `play()`.
- Built-in dot completion still works for `sn.` and similar objects.
- `fs` path completion still works.
- Focused unit tests pass.

## Risks & Mitigation

- **Risk:** Scope lookup could accidentally override built-in globals in confusing ways.  
  **Mitigation:** Use scope-first lookup only for completion resolution of actual persisted variables; keep the built-in global candidate set intact and merge names deterministically.

- **Risk:** Regex changes could broaden completion into invalid contexts.  
  **Mitigation:** Keep the existing "identifier followed by dot at end-of-buffer" rule and only widen valid identifier characters.

- **Risk:** Async redraw behavior could regress.  
  **Mitigation:** Avoid changing request/version handling in `TabCompletion.update()`.

## Implementation Order

1. Expose evaluator scope bindings for completion.
2. Wire `BounceApp` to give completion access to merged REPL bindings.
3. Update `TabCompletion` identifier parsing and scope-aware resolution.
4. Add focused completion tests for scope variables and underscore names.
5. Run focused validation commands.

## Estimated Scope

Small

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements
- [x] All sections agree on the data model / schema approach
- [x] REPL-facing changes define help() coverage and returned-object terminal summaries
- [x] Testing strategy names unit and/or Playwright coverage for REPL help/display behavior where applicable
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
