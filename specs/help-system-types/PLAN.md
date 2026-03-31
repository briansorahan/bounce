# Plan: Help System — Porcelain Type Documentation

**Spec:** specs/help-system-types  
**Created:** 2026-03-31  
**Status:** In Progress

## Context

From RESEARCH.md: Bounce REPL result types conflate plumbing (concrete sync/async classes) with the porcelain names users naturally associate with domain objects. The fix is a three-part change:

1. **Rename** all concrete sync result classes with a `Result` suffix (plumbing layer)
2. **Introduce** `src/renderer/results/porcelain.ts` with union type aliases (porcelain layer)
3. **Generate** type documentation from `@porcelain` JSDoc blocks and expose it in the REPL as callable `TypeName.help()` objects

## Approach Summary

- Rename plumbing classes (`Sample` → `SampleResult`, etc.) in a single compiler-verified pass
- Update barrel files (`src/renderer/results/index.ts`, `src/renderer/bounce-result.ts`) to export renamed classes and add missing module re-exports (`midi.ts`, `pattern.ts`)
- Write `porcelain.ts` exporting union aliases (`type Sample = SampleResult | SamplePromise`) with JSDoc blocks
- Extend the help generator to also parse `porcelain.ts` and emit a `TypeHelp[]` registry
- Add a `TypeHelp` interface + `renderTypeHelp()` to `src/renderer/help.ts`
- Expose each type's help object in `bounce-api.ts` so `Sample.help()` works in the REPL

## Architecture Changes

No new processes or IPC channels required. Changes are entirely within the renderer bundle and the build pipeline:

- New file: `src/renderer/results/porcelain.ts`
- Modified file: `src/renderer/help.ts` (new interface + render function)
- New generator output: `src/renderer/results/porcelain-types.generated.ts`
- Modified script: `scripts/generate-help.ts` (add porcelain type pass)
- Modified file: `src/renderer/bounce-api.ts` (inject type help objects into REPL context)
- Modified file: `src/renderer/results/index.ts` (add missing re-exports for `midi.ts` and `pattern.ts`)
- Modified file: `src/renderer/bounce-result.ts` (barrel re-export — all 14+ import sites in renderer code go through this)

## Changes Required

### Native C++ Changes

None.

### TypeScript Changes

#### 1. Rename plumbing classes — all result files under `src/renderer/results/`

Full rename map (sync classes only; Promise classes keep their names):

| Old name | New name |
|---|---|
| `Sample` | `SampleResult` |
| `SampleListResult` | `SampleListResult` _(already has Result; keep)_ |
| `CurrentSamplePromise` | `CurrentSamplePromise` _(keep — internal utility)_ |
| `SliceFeature` | `SliceFeatureResult` |
| `NmfFeature` | `NmfFeatureResult` |
| `MfccFeature` | `MfccFeatureResult` |
| `NxFeature` | `NxFeatureResult` |
| `GrainCollectionPromise` | `GrainCollectionPromise` _(keep — only async exists)_ |
| `VisScene` | `VisSceneResult` |
| `VisStack` | `VisStackResult` |
| `VisSceneListResult` | `VisSceneListResult` _(keep)_ |
| `LsResult` | `LsResult` _(keep — already Result)_ |
| `GlobResult` | `GlobResult` _(keep — already Result)_ |
| `AudioDevice` | `AudioDeviceResult` |
| `RecordingHandle` | `RecordingHandleResult` |
| `InputsResult` | `InputsResult` _(keep)_ |
| `MidiSequenceResult` | `MidiSequenceResult` _(keep)_ |
| `MidiDevicesResult` | `MidiDevicesResult` _(keep)_ |
| `MidiDeviceResult` | `MidiDeviceResult` _(keep)_ |
| `MidiRecordingHandle` | `MidiRecordingHandleResult` |
| `MidiSequencesResult` | `MidiSequencesResult` _(keep)_ |
| `ProjectResult` | `ProjectResult` _(keep)_ |
| `ProjectListResult` | `ProjectListResult` _(keep)_ |
| `InstrumentResult` | `InstrumentResult` _(keep)_ |
| `InstrumentListResult` | `InstrumentListResult` _(keep)_ |
| `Pattern` | `PatternResult` |
| `EnvScopeResult` | `EnvScopeResult` _(keep)_ |
| `EnvInspectionResult` | `EnvInspectionResult` _(keep)_ |
| `EnvFunctionListResult` | `EnvFunctionListResult` _(keep)_ |

The classes that already carry a `Result` suffix or are not user-facing domain objects (handle types, list/collection types) are kept as-is. Renaming priority is on the core domain types that form clean porcelain names.

The **minimal meaningful rename set** (types that will have a corresponding clean porcelain alias) is:

- `Sample` → `SampleResult`
- `SliceFeature` → `SliceFeatureResult`
- `NmfFeature` → `NmfFeatureResult`
- `MfccFeature` → `MfccFeatureResult`
- `NxFeature` → `NxFeatureResult`
- `VisScene` → `VisSceneResult`
- `VisStack` → `VisStackResult`
- `Pattern` → `PatternResult`
- `AudioDevice` → `AudioDeviceResult`
- `RecordingHandle` → `RecordingHandleResult`
- `MidiRecordingHandle` → `MidiRecordingHandleResult`

All other classes are already adequately named (either already end in `Result`, or are Promise variants).

#### 2. New file: `src/renderer/results/porcelain.ts`

Exports:
- Porcelain type aliases: `type Sample = SampleResult | SamplePromise`, etc.
- For types with no async variant: `type MfccFeature = MfccFeatureResult`
- Each alias is preceded by a `/** @porcelain TypeName … */` JSDoc block documenting properties and methods
- Re-exports all renamed plumbing classes so downstream code only needs to import from `porcelain.ts`

#### 3. `src/renderer/help.ts` — add `TypeHelp` interface and `renderTypeHelp()`

```typescript
export interface TypePropertyHelp {
  name: string;
  type: string;
  description: string;
  readonly?: boolean;
}

export interface TypeMethodHelp {
  name: string;
  signature: string;
  summary: string;
  params?: Array<{ name: string; type: string; description: string; optional?: boolean }>;
  returns?: string;
}

export interface TypeHelp {
  name: string;          // porcelain type name, e.g. "Sample"
  summary: string;       // first line of @porcelain JSDoc
  description?: string;  // remaining lines
  properties?: TypePropertyHelp[];
  methods?: TypeMethodHelp[];
}

export function renderTypeHelp(typeHelp: TypeHelp): BounceResult { ... }
```

#### 4. Generator extension: `scripts/generate-help.ts` → new pass

Add a `generatePortableTypeDocs()` function that:
- Parses `src/renderer/results/porcelain.ts` using the TypeScript AST
- Finds `/** @porcelain TypeName */` JSDoc blocks above type aliases
- Parses `@prop {type} name desc` and `@method signature desc` tags (new tags)
- Emits `src/renderer/results/porcelain-types.generated.ts` exporting:
  ```typescript
  export const porcelainTypeHelps: TypeHelp[] = [ ... ];
  ```

The generator runs as part of `npm run build:electron` alongside the existing command help generation.

#### 5. `src/renderer/bounce-api.ts` — inject type help into REPL context

For each porcelain type that has a `TypeHelp` entry, assign a callable help object to the REPL context:

```typescript
// In bounce-api.ts REPL context setup
import { porcelainTypeHelps } from "./results/porcelain-types.generated.js";
import { renderTypeHelp } from "./help.js";

for (const typeHelp of porcelainTypeHelps) {
  replContext[typeHelp.name] = {
    help: () => renderTypeHelp(typeHelp),
    toString: () => renderTypeHelp(typeHelp).toString(),
  };
}
```

#### 6. Update barrel files and imports

The primary import path for result types is `bounce-result.ts` → `results/index.ts`. These barrel files must be updated first:

- `src/renderer/results/index.ts` — add missing re-exports for `midi.ts` and `pattern.ts`; all renamed class exports flow through here automatically
- `src/renderer/bounce-result.ts` — single-line `export * from "./results/index.js"` barrel; no change needed unless porcelain re-exports are added here

Import update strategy (single pass):
- Implementation code (`results/*.ts`, `namespaces/*.ts`, `grain-collection.ts`, `visualization-scene-manager.ts`, etc.) imports the renamed plumbing classes (`SampleResult`, `SliceFeatureResult`, etc.) directly from the barrel or result files
- Porcelain type aliases in `porcelain.ts` are consumed only by `bounce-api.ts` (for REPL injection) and by type-level annotations where the union is semantically appropriate
- No second import migration pass is needed: implementation code stays on plumbing names, REPL surface uses porcelain names

### Terminal UI Changes

- `Sample.help()` in the REPL prints a formatted type summary
- Typing `Sample` (without calling) also shows the summary via `toString()`
- Tab completion: the type names (`Sample`, `SliceFeature`, …) should appear as top-level completions

Tab completion is out of scope for this spec (tracked as a future improvement).

### REPL Interface Contract

**Porcelain type help objects** are plain objects `{ help(), toString() }` injected into the REPL context under their porcelain names.

User-visible surface:
```
> Sample.help()
Sample — an audio file loaded into Bounce
  Properties:
    hash: string        Unique identifier derived from file content
    path: string        Absolute path to the source audio file
    duration: number    Duration in seconds
    channels: number    Number of audio channels
    sampleRate: number  Sample rate in Hz
  Methods:
    .play(opts?)        Play the sample from beginning
    .loop(opts?)        Loop the sample
    .onsets(opts?)      Onset analysis → SliceFeature
    .nmf(opts?)         NMF decomposition → NmfFeature
    .mfcc(opts?)        MFCC analysis → MfccFeature
    ...
```

#### REPL Contract Checklist

- [x] Every exposed object/namespace/function has a `help()` entry point — porcelain type objects expose `help()` directly
- [x] Every returned custom REPL type defines a useful terminal summary — via `toString()` on the help object
- [x] The summary highlights workflow-relevant properties, not raw internal structure
- [ ] Unit tests and/or Playwright tests are identified for `help()` output — see Testing Strategy
- [ ] Unit tests and/or Playwright tests are identified for returned-object display behavior — see Testing Strategy

### Configuration/Build Changes

- `package.json` `generate:help` script: add the new porcelain type generation pass
- `src/renderer/results/index.ts`: add `export * from "./midi.js"` and `export * from "./pattern.js"` (currently missing)
- `tsconfig.renderer.json`: no changes needed (new files are under `src/renderer/`)
- `tsconfig.json` (library): may need to include `src/renderer/results/porcelain.ts` if it becomes a public export — TBD in IMPL

## Testing Strategy

### Unit Tests

New test file: `src/porcelain-types.test.ts`

- Verify `TypeHelp` shape is correct for each generated porcelain type (name, summary populated)
- Verify `renderTypeHelp()` returns a non-empty `BounceResult` for every type
- Verify that `Sample.help()` (and at least 3 other types) produce output containing expected method names

### E2E Tests

New Playwright test block in an existing or new spec file:

- `Sample.help()` produces output that includes known method names (`play`, `loop`, `onsets`)
- `SliceFeature.help()` produces output including `slices`, `playSlice`
- Evaluating `Sample` alone (no call) triggers the `toString()` summary

### Manual Testing

- Run `npm run dev:electron`, type `Sample.help()` in REPL, verify output is well-formatted
- Verify that namespace commands whose return type is `Sample` still work correctly after the rename
- Verify that existing `SamplePromise` chains (`sn.read(path).play()`) still work

## Success Criteria

1. `npm run build:electron` passes with zero TypeScript errors after all renames
2. `npm run lint` passes
3. All existing unit tests pass
4. `Sample.help()` in the REPL shows a formatted type summary with methods and properties
5. At least `Sample`, `SliceFeature`, `NmfFeature`, `VisScene`, and `Pattern` have `help()` in the REPL
6. `./build.sh` passes (full Playwright suite)

## Risks & Mitigation

| Risk | Mitigation |
|---|---|
| Rename touches many files — high chance of missed imports | Use `npm run build:electron` as compiler gate; fix all errors before merging |
| `porcelain.ts` re-exports create circular import chains | Keep `porcelain.ts` as leaf (no imports from namespace files); only import from result files. No result file should ever import from `porcelain.ts`. |
| Generated file gets stale if author adds a new type | CI build step (`generate:help`) runs before TypeScript compile; missing type → compile error if referenced |
| Promise wrapper classes reference the renamed sync class | Update class bodies during the rename pass; compiler catches mismatches |
| Barrel files (`results/index.ts`) missing module re-exports | Add `midi.ts` and `pattern.ts` re-exports early in implementation (step 2) so all types flow through the standard import path |

## Implementation Order

1. Add `TypeHelp`, `TypePropertyHelp`, `TypeMethodHelp` interfaces and `renderTypeHelp()` to `src/renderer/help.ts`
2. Add missing re-exports to `src/renderer/results/index.ts` (`midi.ts`, `pattern.ts`)
3. Rename plumbing classes in `src/renderer/results/` (the minimal meaningful rename set)
4. Fix all import errors from the rename (compiler-guided; barrel files propagate automatically)
5. Write `src/renderer/results/porcelain.ts` with type aliases and `@porcelain` JSDoc blocks
6. Extend `scripts/generate-help.ts` to parse `porcelain.ts` and emit `porcelain-types.generated.ts`
7. Wire the generated type help objects into `bounce-api.ts`
8. Write unit tests in `src/porcelain-types.test.ts`
9. Write Playwright assertions for REPL type help output
10. Run `npm run build:electron` + `npm run lint` + `./build.sh`

## Estimated Scope

Large (systematic rename across many files + new generator pass + new REPL surface)

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements (compiler-verified rename; no runtime breakage)
- [x] All sections agree on the data model / schema approach (`TypeHelp` in `help.ts`)
- [x] REPL-facing changes define help() coverage and returned-object terminal summaries
- [x] Testing strategy names unit and/or Playwright coverage for REPL help/display behavior
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
