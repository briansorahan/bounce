# Research: Help System — Porcelain Type Documentation

**Spec:** specs/help-system-types  
**Created:** 2026-03-31  
**Status:** Complete

## Problem Statement

Bounce REPL return types have two layers that are currently conflated:

- **Plumbing types** — the concrete implementation classes (`Sample`, `SamplePromise`) that handle sync/async dispatch internally
- **Porcelain types** — the conceptual type a user thinks of when using the REPL (e.g., just `Sample`)

Currently the plumbing type `Sample` doubles as the porcelain label. This creates friction: the union `Sample | SamplePromise` is exposed in signatures and internal code, but the user just thinks of both as a `Sample`. There is also no way to call `Sample.help()` in the REPL to learn what properties and methods a sample object provides — only namespace-level and command-level help exists today.

The goal is to:
1. Establish a naming convention that separates plumbing types from porcelain types
2. Introduce porcelain type aliases that express user intent (e.g., `type Sample = SampleResult | SamplePromise`)
3. Build a documentation generator for porcelain types — analogous to the existing command help generator — that attaches `help()` and terminal summaries to the porcelain type names
4. Expose this type help in the REPL so users can introspect what a `Sample` (or any other domain object) offers

## Background

Bounce's REPL is modeled after a RESTful shell: every command returns a value the user can inspect and chain. The `withHelp()` wrapper and the generated `*-commands.generated.ts` files give per-command documentation. What's missing is **per-type documentation**: once a user has a `Sample` object, they have no way to discover its methods without reading source code.

FluCoMa's SuperCollider REPL solves a similar problem by attaching `.help` to most objects. The Bounce version should feel similarly discoverable.

## Related Work / Prior Art

- **Existing command help generator** (`scripts/generate-help.ts`, `src/help-generator.ts`): parses JSDoc from namespace source files via TypeScript AST, outputs `*-commands.generated.ts` arrays consumed by `withHelp()` and `renderNamespaceHelp()`. A parallel generator for types would follow the same pattern but parse class/type definitions instead of function bodies.
- **FluCoMa (SuperCollider)**: `.help` on every object opens a help file. Bounce should approximate this at the terminal level.
- **Python `__doc__`**: docstrings on classes/methods; inspectable at runtime via `help()`. Bounce's generated approach is strictly compile-time safe.

## FluCoMa Algorithm Details

Not applicable to this spec.

## Technical Constraints

- **TypeScript AST-based generation** — must stay consistent with the existing `help-generator.ts` approach (no runtime reflection, no decorators)
- **ESM/CJS boundary** — generated files live under `src/renderer/` (ESM renderer bundle); must not bleed into the main process
- **No new runtime dependencies** — generation is a build step, not a runtime library
- **Backwards compatibility** — renaming plumbing types affects every file that imports them; the rename must be systematic and compiler-verified

## Audio Processing Considerations

Not applicable to this spec.

## Terminal UI Considerations

A user should be able to type any porcelain type name followed by `.help()` in the REPL and get a formatted description of that type's methods and properties. Example:

```
> Sample.help()
Sample — an audio file loaded into Bounce
  .play(opts?)     Play the sample
  .loop(opts?)     Loop the sample
  .onsets(opts?)   Run onset analysis → SliceFeature
  ...
> SliceFeature.help()
SliceFeature — onset/amp/novelty/transient slice analysis result
  .slices          Array of onset times in seconds
  .playSlice(i?)   Play a specific slice
  ...
```

Type help objects must also have a clean `toString()` for implicit terminal display (e.g., just evaluating `Sample` at the REPL prompt).

The porcelain types themselves (not instances) hold the `help()` method, so the user calls `Sample.help()` not `mySample.help()` (though HelpableResult subclasses already expose instance-level help).

## Cross-Platform Considerations

All generation is a Node.js build step — no platform-specific concerns beyond those already handled by the existing generator.

## Open Questions — RESOLVED

1. **Plumbing type naming convention** — **Decision: `Result` suffix.**
   Concrete sync classes get a `Result` suffix: `Sample` → `SampleResult`, `SliceFeature` → `SliceFeatureResult`, etc. The porcelain union becomes `type Sample = SampleResult | SamplePromise`.

2. **Scope of rename** — **Decision: All types uniformly.**
   Every result class is renamed with `Result` suffix in one pass, compiler-verified.
   Types without an async variant still get the `Result` suffix (e.g., `MfccFeature` → `MfccFeatureResult`); their porcelain alias simply equals the single plumbing class.

3. **Where do porcelain type definitions live?** — **Decision: `src/renderer/results/porcelain.ts`.**
   A single new file exports all porcelain type aliases and their associated help objects.

4. **Type documentation source** — **Decision: `@porcelain` JSDoc blocks in `porcelain.ts`.**
   JSDoc for each porcelain type is authored as a `/** @porcelain TypeName … */` block on (or adjacent to) the alias declaration in `porcelain.ts`. The type-doc generator parses this file.

5. **REPL exposure** — **Decision: Explicit assignment in `bounce-api.ts`.**
   Like namespace objects (`sn`, `vis`, etc.), porcelain type help objects are explicitly assigned to the REPL context in `bounce-api.ts`.

## Research Findings

### Existing Result Type Inventory

All result types live under `src/renderer/results/`. The full sync/async pairing as of 2026-03-31:

| Porcelain name (proposed) | Current sync class | Current async class |
|---|---|---|
| `Sample` | `Sample` | `SamplePromise` |
| `SliceFeature` | `SliceFeature` | `SliceFeaturePromise` |
| `NmfFeature` | `NmfFeature` | `NmfFeaturePromise` |
| `MfccFeature` | `MfccFeature` | `MfccFeaturePromise` |
| `NxFeature` | `NxFeature` | `NxFeaturePromise` |
| `GrainCollection` | _(none — only Promise)_ | `GrainCollectionPromise` |
| `LsResult` | `LsResult` | `LsResultPromise` |
| `GlobResult` | `GlobResult` | `GlobResultPromise` |
| `VisScene` | `VisScene` | `VisScenePromise` |
| `MidiSequenceResult` | `MidiSequenceResult` | `MidiSequencePromise` |
| `Pattern` | `Pattern` | _(none)_ |
| `ProjectResult` | `ProjectResult` | _(none)_ |
| `InstrumentResult` | `InstrumentResult` | _(none)_ |
| `AudioDevice` | `AudioDevice` | _(none)_ |
| `RecordingHandle` | `RecordingHandle` | _(none — returns SamplePromise)_ |

Note: `Pattern`, `ProjectResult`, `InstrumentResult`, `AudioDevice`, `RecordingHandle` have no async variant — their porcelain type would just alias the single plumbing class (or they might be excluded from the renaming entirely).

### Existing Command Help Generator Pattern

`scripts/generate-help.ts` → calls `processFile()` in `src/help-generator.ts` → emits `*-commands.generated.ts`.

The generator:
- Uses `ts.createSourceFile()` to parse the AST
- Finds top-level functions annotated with `/** @namespace <name> */`
- Walks function bodies for `withHelp(fn, meta)` calls
- Extracts JSDoc from leading trivia (regex, not `ts.getJSDocTags`)
- Parses `@param {type} name desc` and `@example` blocks
- Writes `export const <ns>Commands: CommandHelp[]` + `export const <ns>Description: string`

A parallel type-doc generator would:
- Find class declarations (or interface declarations) annotated with `/** @porcelain <TypeName> */` (or similar)
- Extract method/property JSDoc
- Emit `export const <TypeName>Help: TypeHelp` objects
- Optionally emit a registry `export const porcelainTypes: TypeHelp[]`

### `help.ts` Structure

`src/renderer/help.ts` defines:
- `CommandHelp` interface — `{ name, signature, summary, description?, params?, examples? }`
- `withHelp<F>(fn, meta)` — attaches `.help()` to any function
- `renderNamespaceHelp(ns, desc, commands)` — formats command list as `BounceResult`
- `renderCommandHelp(cmd)` — formats single command as `BounceResult`

The new `TypeHelp` interface would parallel `CommandHelp`:
- `{ name, summary, description?, properties?, methods? }`
- A `renderTypeHelp(typeHelp)` function analogous to `renderNamespaceHelp`

## Next Steps

1. Resolve Open Questions 1–5 with the user (naming, scope, location, source, exposure)
2. Audit which types are truly "domain objects" users care about vs. internal plumbing that shouldn't surface
3. Draft the `TypeHelp` interface
4. Design the generator script
5. Decide on REPL injection strategy
6. Move to PLAN phase
