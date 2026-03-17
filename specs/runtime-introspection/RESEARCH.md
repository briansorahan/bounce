# Research: Runtime Introspection

**Spec:** specs/runtime-introspection  
**Created:** 2026-03-16  
**Status:** Complete

## Problem Statement

Bounce users can define variables, call functions, and work with rich REPL objects, but they cannot ask the runtime what is currently in scope. The goal of this feature is to make the live REPL environment inspectable so users can discover:

- which variables are currently defined
- which namespaces and functions are available
- what type or object category a value belongs to
- enough summary information to understand what a value is without dumping raw internals

This should reduce guesswork, make long REPL sessions easier to manage, and improve discoverability for users who are exploring Bounce interactively.

## Background

The current REPL already stores user-defined bindings in `ReplEvaluator` and uses those bindings for tab completion. Bounce also already has a convention for user-facing help and returned-object display:

- top-level namespaces such as `sn`, `fs`, `proj`, `vis`, and `corpus`
- `help()` methods on namespaces and many callable surfaces
- `BounceResult`-style terminal summaries for returned custom objects
- tab completion that inspects globals, user bindings, and callable members

That means runtime introspection is not a greenfield idea. The core information already exists internally; the missing piece is a supported public API.

## Related Work / Prior Art

### Internal prior art: evaluator scope tracking

`src/renderer/repl-evaluator.ts` keeps a private `scopeVars` map of user-defined variables across evaluations. It also exposes those bindings to the completion system through `getCompletionBindings()`.

This is the strongest prior art for:

- listing user-defined names
- retrieving live values from scope
- separating Bounce globals from user-created bindings

### Internal prior art: tab completion introspection

`src/renderer/tab-completion.ts` already walks an object's own properties and prototype chain to find callable members for completion. That shows Bounce already has one notion of "runtime inspection," but it is currently private, completion-oriented, and function-biased.

### Internal prior art: REPL-facing result objects

`src/renderer/bounce-result.ts` defines how custom objects print useful summaries in the terminal. Objects such as `Sample`, feature objects, and filesystem result wrappers already encode the idea that a returned value should be human-readable at a glance.

This is useful precedent for introspection results because a future `env` API should return rich, printable objects rather than raw JSON blobs.

### UX precedent: namespaced REPL surfaces

`fs`, `sn`, `proj`, and `vis` demonstrate the preferred REPL shape in Bounce:

- a namespace object
- `help()` at the root
- method-level discoverability
- chainable or printable result types

That makes a dedicated `env.*` namespace a strong fit for this feature.

## FluCoMa Algorithm Details

None. This feature is REPL/runtime ergonomics work and does not require new FluCoMa algorithms.

## Technical Constraints

### The runtime scope is real, but private

The evaluator persists top-level variables by rewriting declarations and tracking them in a private scope map. Today, that machinery is internal. A public introspection API will need a deliberate boundary so it can expose useful state without leaking evaluator internals or creating a fragile dependency on transpilation details.

### Bounce globals are reserved

The evaluator prevents users from redefining reserved globals such as `sn`, `fs`, `proj`, `vis`, and `help`. Runtime introspection should make that distinction visible rather than flattening everything into one undifferentiated list.

### Runtime "types" are not TypeScript types

Bounce has TypeScript declaration files for editor and compile-time support, but those types do not exist automatically at runtime. Any introspection feature will need to define what "type" means in practice. Realistic options include:

- JavaScript categories like `string`, `number`, `function`, `object`
- constructor or class names such as `Sample`, `OnsetFeature`, `LsResult`
- Bounce-specific labels derived from known objects or wrappers

The spec should avoid promising exact TypeScript type recovery unless the implementation plan adds explicit metadata for it.

### Promise-like wrappers complicate inspection

Bounce exposes thenable wrappers such as `SamplePromise` and `LsResultPromise` so users can chain without explicit `await`. Introspection needs to decide whether these should display as wrapper types, as pending values, or as the eventual domain object category when that is knowable.

### Introspection must remain REPL-safe

Many runtime values can be large or deeply nested. The feature should prefer short summaries and metadata previews over raw object dumps, both for readability and for terminal safety.

## Audio Processing Considerations

This work does not change audio processing directly. The main relevant consideration is that some values in scope may reference audio-heavy objects, derived samples, or feature wrappers. Introspection should avoid forcing eager audio loads or large data materialization just to print a summary.

## Terminal UI Considerations

This is primarily a terminal UX feature, so the REPL contract matters:

- `env.help()` should explain the inspection model with examples
- any new custom result types should print concise, useful summaries
- summaries should emphasize workflow-relevant properties such as name, category, value kind, and selected preview metadata
- tab completion should expose the new `env` namespace and its methods

Potential example flows:

```ts
env.help()
env.vars()
env.globals()
env.inspect("kick")
env.functions(sn)
```

The exact API shape is still open, but the namespaced pattern is the recommended direction.

## Cross-Platform Considerations

The feature is renderer-side TypeScript work and should be cross-platform as long as it continues to rely on existing REPL and IPC layers. Avoiding OS-specific object inspection or path-only assumptions will keep behavior consistent across macOS, Linux, and Windows.

## Open Questions

1. **What should count as a "type" in user output?**  
   Recommendation: start with runtime categories plus constructor/class names where available, and treat exact TypeScript types as out of scope unless explicit metadata is added.

2. **Should `env.vars()` include only user-defined bindings, or also Bounce globals?**  
   Recommendation: separate them. Use `env.vars()` for user-defined scope and `env.globals()` or equivalent for built-ins.

3. **How much value preview should be shown?**  
   Recommendation: default to short previews only, with enough metadata to identify the value but without dumping full nested structure.

4. **Should introspection expose callable members of arbitrary objects?**  
   Recommendation: yes, but through a focused method such as `env.functions(value)` rather than overloading `env.inspect()` with too much output.

5. **Should users be able to inspect by value, by name, or both?**  
   Recommendation: support both if practical. `env.inspect("name")` is useful for scope lookup, while `env.inspect(value)` is useful for ad hoc object exploration.

6. **How should thenable wrappers be labeled?**  
   Recommendation: show the wrapper class name first and, where feasible, also indicate the eventual Bounce domain category.

## Research Findings

1. **The core runtime data already exists.**  
   Bounce already tracks user-defined bindings in the evaluator and uses them for completion. The feature mostly needs a supported exposure layer, not a new storage model.

2. **The completion system already proves object-member introspection is feasible.**  
   There is existing logic for discovering callable properties via the prototype chain. That logic can likely be reused or extracted for runtime inspection.

3. **A namespaced REPL surface is consistent with the product.**  
   `env.*` matches Bounce's current direction better than a set of new top-level inspection functions.

4. **Returned-object display must be treated as part of the feature, not an afterthought.**  
   If `env.vars()` or `env.inspect()` returns custom result objects, they need the same summary discipline as `Sample`, `LsResult`, and other REPL-facing types.

5. **Exact static typing is not realistically available by default.**  
   The spec should frame "types" as runtime-friendly categories unless the implementation adds explicit metadata to bridge the gap.

## Next Steps

- Define the `env.*` namespace and its first-pass method set in `PLAN.md`
- Decide how scope entries, global entries, and inspection results should render in the terminal
- Identify whether callable-member discovery should move into a shared helper
- Specify unit and manual coverage for `help()`, returned-object summaries, and completion
