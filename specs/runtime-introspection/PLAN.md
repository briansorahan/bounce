# Plan: Runtime Introspection

**Spec:** specs/runtime-introspection  
**Created:** 2026-03-16  
**Status:** In Progress

## Context

Bounce already maintains the data needed for runtime introspection: user-defined bindings are tracked in `ReplEvaluator`, callable-member discovery exists in tab completion, and the REPL already has conventions for `help()` and printable result objects. The plan is to turn those existing internals into a coherent public inspection surface centered on a new `env` namespace.

## Approach Summary

Add a dedicated `env.*` namespace to the REPL for inspecting the current runtime environment. The first version should focus on discoverability and safe summaries rather than perfect static typing.

Recommended first-pass surface:

- `env.help()`
- `env.vars()` for user-defined bindings
- `env.globals()` for Bounce-provided globals
- `env.inspect(nameOrValue)` for focused inspection of one binding or object
- `env.functions(value)` for callable-member discovery

The implementation should reuse existing evaluator scope tracking and callable-member introspection where possible, while returning Bounce-style result objects that print useful terminal summaries.

## Architecture Changes

### ReplEvaluator exposure layer

Extend `ReplEvaluator` with explicit, supported accessors for runtime bindings instead of reaching into private state from the outside. Likely capabilities:

- list user-defined scope entries
- resolve a scope entry by name
- provide completion-friendly snapshots that can also power runtime inspection

The intent is to create a stable boundary between evaluation internals and the new public API.

### Shared introspection utilities

Extract or share callable-property discovery logic so both tab completion and `env.functions()` use the same rules. This avoids divergence between "what completes" and "what introspection says is callable."

### REPL-facing introspection results

Introduce new result/domain classes for introspection output. Likely candidates:

- `EnvScopeResult` for `env.vars()` / `env.globals()`
- `EnvInspectionResult` for `env.inspect()`
- `EnvFunctionListResult` for `env.functions()`

These should follow the existing `BounceResult` contract and expose concise summaries when printed directly.

## Changes Required

### Native C++ Changes

None.

### TypeScript Changes

- `src/renderer/bounce-api.ts`
  - add the `env` namespace
  - wire `env` methods to evaluator/runtime helpers
  - add `help()` text and examples

- `src/renderer/repl-evaluator.ts`
  - expose supported accessors for scope enumeration and named lookup
  - preserve reserved-global distinctions
  - ensure new APIs do not break existing evaluation behavior

- `src/renderer/bounce-result.ts`
  - add introspection-oriented result objects or extend existing patterns
  - define terminal summaries for scope lists and inspection results

- `src/renderer/tab-completion.ts`
  - expose `env` in completion
  - reuse or extract callable-member discovery logic for shared introspection rules

- `src/renderer/bounce-globals.d.ts`
  - declare the `env` namespace and any new result types
  - document runtime-oriented type labels appropriately

### Terminal UI Changes

- make `env` discoverable from root help/completion
- keep output compact and scan-friendly in the terminal
- clearly distinguish:
  - user-defined variables
  - Bounce globals
  - functions/methods
  - runtime category/type labels

### REPL Interface Contract

The new REPL surface is user-facing and should follow Bounce's existing product rules:

- `env` must expose `help()`
- user-facing `env` methods should expose method-level help where practical
- custom introspection result objects must print useful summaries when evaluated directly
- summaries should prioritize:
  - entry name
  - runtime category or Bounce object label
  - whether the value is callable
  - a short preview or key metadata

Example desired flows:

```ts
env.help()
env.vars()
env.globals()
env.inspect("sample")
env.functions(sn)
```

#### REPL Contract Checklist

- [ ] Every exposed object/namespace/function has a `help()` entry point or an explicit reason why not
- [ ] Every returned custom REPL type defines a useful terminal summary
- [ ] The summary highlights workflow-relevant properties, not raw internal structure
- [ ] Unit tests and/or Playwright tests are identified for `help()` output
- [ ] Unit tests and/or Playwright tests are identified for returned-object display behavior

### Configuration/Build Changes

None expected.

## Testing Strategy

### Unit Tests

- `src/repl-evaluator.test.ts`
  - verify scope accessors return stable data for user-defined bindings
  - verify reserved globals remain distinguished from user variables

- `src/bounce-api.test.ts`
  - verify `env` exists in the built API
  - verify `env.help()` output
  - verify `env.vars()`, `env.globals()`, `env.inspect()`, and `env.functions()` return the expected result shapes
  - verify returned introspection objects print useful summaries

- `src/tab-completion.test.ts`
  - verify `env` appears in completion
  - verify completion behavior stays aligned with callable-member introspection rules

### E2E Tests

Playwright coverage is optional for the first pass unless the implementation materially changes REPL interaction behavior beyond help/completion and printed summaries. If E2E coverage is added, it should verify:

- `env` appears in the live REPL
- introspection results render cleanly in the terminal
- help output is readable in a realistic session

When needed, use `./build.sh` rather than direct host Playwright commands.

### Manual Testing

- define a few REPL variables of different kinds (`number`, `string`, `Sample`, function)
- run `env.vars()` and confirm the list is accurate and readable
- run `env.globals()` and confirm Bounce globals are separated from user bindings
- inspect both a name and a live value
- verify callable-member output matches completion expectations
- verify direct evaluation of returned introspection objects prints concise summaries

## Success Criteria

- The REPL exposes a top-level `env` namespace
- Users can list user-defined variables without reaching into implementation internals
- Users can list Bounce globals separately from user-defined bindings
- Users can inspect a binding or value and see a useful runtime category/type label
- Users can list callable members of runtime objects through a supported API
- `env` and its primary methods are discoverable through `help()` and tab completion
- Introspection result objects print useful terminal summaries when returned directly
- Lint, build, and relevant tests pass

## Risks & Mitigation

### Risk: Overpromising on "types"

Users may expect exact TypeScript type recovery from runtime inspection.

Mitigation:

- define output as runtime-oriented type/category labels
- only add richer type names where explicit metadata exists

### Risk: Output becomes noisy or too verbose

A raw dump of scope values or object properties would be hard to use in the terminal.

Mitigation:

- use dedicated result objects with compact summaries
- keep previews short and emphasize workflow-relevant metadata

### Risk: Divergence between completion and introspection

If `env.functions()` and tab completion use different callable-member rules, users will see inconsistent behavior.

Mitigation:

- extract shared helper logic or centralize member discovery

### Risk: Tight coupling to evaluator internals

Directly reading private evaluator state could make the feature brittle.

Mitigation:

- add supported accessor methods on `ReplEvaluator`
- keep the public API at the renderer/bounce-api layer

## Implementation Order

1. Define the public `env` API surface and result types in typings and plan-driven docs.
2. Add stable scope-access and lookup helpers to `ReplEvaluator`.
3. Extract/shared callable-member introspection logic from tab completion as needed.
4. Implement `env` in `buildBounceApi()` with help text and examples.
5. Add introspection result objects and terminal-summary behavior.
6. Update completion for the new namespace.
7. Add or update focused unit tests for evaluator access, help output, completion, and returned-object display behavior.
8. Validate with lint, build, and relevant tests.

## Estimated Scope

Medium

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements
- [x] All sections agree on the data model / schema approach
- [x] REPL-facing changes define help() coverage and returned-object terminal summaries
- [x] Testing strategy names unit and/or Playwright coverage for REPL help/display behavior where applicable
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
