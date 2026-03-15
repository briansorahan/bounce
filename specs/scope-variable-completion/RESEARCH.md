# Research: Scope Variable Completion

**Spec:** specs/scope-variable-completion  
**Created:** 2026-03-15  
**Status:** Complete

## Problem Statement

Bounce's REPL shows ghost-text and tab completion for built-in globals like `sn` and `fs`, but it does not predict methods on objects stored in user-defined variables. A concrete failure is:

```ts
const contact_mic_on_plate = sn.read("...wav")
contact_mic_on_plate.pl
```

At that point the user should see a prediction such as `ay()`, but today no ghost text appears.

## Background

The sample-object API moved Bounce toward an object-oriented REPL surface centered on `sn` and `Sample`. That change made instance methods like `sample.play()` and `sample.onsets()` the primary workflow, so completion now needs to work not just for built-in globals, but also for user-defined variables that hold returned REPL objects.

Completion logic currently lives in `src/renderer/tab-completion.ts`, while REPL state lives in `src/renderer/repl-evaluator.ts`. The evaluator persists variables across commands in an internal `scopeVars` map, but completion does not currently consult that map.

## Related Work / Prior Art

- The original tab completion spec explicitly left "scope-variable completion (variables declared in the REPL session)" as future work.
- The sample-object API spec already called out that `Sample` and feature methods must remain discoverable through tab completion.
- Existing completion behavior already supports:
  - top-level built-in globals using `BOUNCE_GLOBALS`
  - dot-method completion for prototype-based built-in objects already present in the static API object
  - async filesystem path completion for a narrow set of `fs.*` methods

## FluCoMa Algorithm Details

None. This fix is REPL UX only.

## Technical Constraints

- The REPL evaluator stores persisted variable state in a private `scopeVars: Map<string, unknown>`.
- Completion runs during prompt redraw and must remain safe with async updates.
- Existing dot-completion regex only matches simple identifiers without `_` or `$`, so variables like `contact_mic_on_plate` are ignored even before lookup.
- Built-in global completion and `fs` path completion must keep working unchanged.

## Audio Processing Considerations

None. No audio processing behavior changes.

## Terminal UI Considerations

This work changes predictive ghost text behavior, not the REPL API surface itself.

- No new user-facing objects or namespaces are introduced.
- Existing `help()` methods on `sn`, `Sample`, and feature objects remain unchanged.
- Returned-object terminal summaries should remain unchanged.
- Automated coverage should focus on ghost-text/tab-completion behavior for REPL variables holding `Sample`-like objects.

## Cross-Platform Considerations

The fix is renderer-side TypeScript and should be platform-neutral.

## Open Questions

1. Should completion support only member prediction on scope variables, or also top-level variable-name completion?
   - Recommendation: support both while touching the same plumbing, since the evaluator already tracks names and users will expect persisted variables to autocomplete like globals.

2. Should completion introspect only evaluator scope, or also continue to use the static API object?
   - Recommendation: merge both sources, with scope variables taking precedence when names collide.

## Research Findings

- `TabCompletion.update()` only checks `this.api[objName]` for dot completion, so user-defined variables are invisible.
- The current dot-completion regex `/([a-zA-Z][a-zA-Z0-9]*)\.([a-zA-Z][a-zA-Z0-9]*)?$/` rejects underscores, which breaks the reported `contact_mic_on_plate.pl` case.
- `ReplEvaluator` already has all the state needed to power completion: persisted scope names and values are stored in `scopeVars`.
- Existing completion tests cover prototype-based built-ins like `sn`, but there is no coverage for REPL scope variables.

## Next Steps

- Add a completion-facing scope snapshot/lookup path from `ReplEvaluator`.
- Extend `TabCompletion` to resolve identifiers from merged built-in API + REPL scope.
- Broaden identifier matching to valid JavaScript identifiers used in practice by Bounce users, including `_` and `$`.
- Add focused tests for global variable completion and dot-method prediction on scope variables.
