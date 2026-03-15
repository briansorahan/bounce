# Plan: Sample Object API

**Spec:** specs/sample-object-api  
**Created:** 2026-03-15  
**Status:** Ready

## Goal

Replace Bounce's current top-level sample API with an object-oriented model centered on a top-level `sn` namespace, `Sample` instances returned by `sn.read()`, and rich feature objects returned by sample analysis methods. The new API should make sample identity explicit, remove most implicit "current audio" argument behavior from analysis/resynthesis flows, and preserve top-level visualization helpers as a separate concern.

Target usage:

```ts
const samp = await sn.read("HASH");
await samp.play();
const onsets = await samp.onsets();
await samp.slice();
const nmf = await samp.nmf({ components: 4 });
await samp.sep();
const mfcc = await samp.mfcc();
```

Visualization remains top-level:

```ts
await visualizeNmf();
await onsetSlice();
```

## Architecture

### Public API shape

Introduce a top-level `sn` namespace, parallel to `fs`, with:

- `sn.help()`
- `sn.read(pathOrHash): Promise<Sample>`
- `sn.list(): Promise<SampleListResult | BounceResult>`
- `sn.current(): Sample | null` or `Promise<Sample | null>` depending on implementation convenience

The help system should be available uniformly across the new object model. At minimum:

- `sn.help()`
- `sample.help()`
- `feature.help()` for every new feature class
- method-level help where practical for namespace functions such as `sn.read.help()`

Introduce a new `Sample` class as the primary domain object for persisted audio samples. `Sample` should wrap identity and metadata, not own a permanently loaded audio buffer. Expected properties:

- `hash`
- `filePath`
- `sampleRate`
- `channels`
- `duration`
- `id` if useful for debugging/introspection

Expected methods on `Sample`:

- `help(): BounceResult`
- `play(): Promise<Sample>`
- `stop(): BounceResult`
- `display(): Promise<Sample>` if separate from `play()`, otherwise explicitly document `play()` as display+play
- `slice(options?): Promise<SliceFeature | SliceCollection | BounceResult>` depending on final derived-object design
- `sep(options?): Promise<NmfComponentCollection | BounceResult>`
- `granularize(options?): Promise<GrainCollection>`
- `onsets(options?): Promise<OnsetFeature>`
- `nmf(options?): Promise<NmfFeature>`
- `mfcc(options?): Promise<MfccFeature>`

Introduce rich feature objects instead of keeping plain `FeatureResult` as the primary user-facing result:

- `OnsetFeature`
- `NmfFeature`
- `MfccFeature`
- optionally `GranularFeature` if granularization metadata needs first-class behavior

Each feature object should carry:

- `source`: `Sample`
- `featureHash`
- `featureType`
- `options`
- feature-specific metadata/methods
- `help(): BounceResult`

Examples of likely methods:

- `OnsetFeature.slice(): Promise<SliceCollection | BounceResult>`
- `OnsetFeature.show(): never` is **not** planned because visualization stays top-level
- `NmfFeature.sep(): Promise<NmfComponentCollection | BounceResult>`
- collection/result accessors for derived samples where appropriate

### Internal structure

Refactor `src/renderer/bounce-result.ts` from "display/result wrappers only" into the home for REPL-facing domain objects:

- keep `BounceResult`
- replace or supersede `AudioResult` with `Sample`
- replace or supersede `FeatureResult` with rich feature classes
- preserve or adapt `GrainCollection`
- add any new collection/result wrappers needed for `sn.list()`, slices, or separated components
- ensure every user-facing object returned from a REPL expression renders safely and usefully when printed

Refactor `buildBounceApi()` to construct:

- the `sn` namespace
- object factories/helpers for `Sample` and feature instances
- remaining top-level visualization utilities

### Playback/display semantics

Bounce will continue to use a singleton `AudioManager` and one current waveform/playback context. `Sample` methods should make that shared context explicit through object syntax:

- `samp.play()` loads `samp` into the shared audio manager and starts playback
- `samp.stop()` stops the shared transport, even though the method is called from an instance
- `sn.current()` should return the sample currently loaded into that shared context when possible

All returned domain objects must be REPL-safe. If a user evaluates an expression whose final value is `sn`, a `Sample`, or a feature object, Bounce should print useful summary information rather than throwing due to missing stringification or unsupported object rendering. This likely means each user-facing object needs a stable `toString()`-style contract compatible with the existing REPL print path.

### Migration strategy

This spec assumes **immediate replacement** of the old top-level sample API:

- remove top-level `play`, `stop`, `slice`, `sep`, `granularize`, `analyze`, `analyzeNmf`, `analyzeMFCC`, `playSlice`, and `playComponent` from the preferred API surface
- update `help()` output, REPL typings, and tab completion to reflect the new model
- keep top-level visualization utilities such as `visualizeNmf`, `visualizeNx`, `onsetSlice`, and `nmf` only if they still map cleanly to the shared visualization system

## Files to Change

### Core renderer API

- `src/renderer/bounce-api.ts`
  - replace top-level sample globals with `sn`
  - construct `Sample` and feature objects
  - move current sample-centric workflows onto instance methods
  - keep visualization utilities top-level

- `src/renderer/bounce-result.ts`
  - introduce/reshape REPL-facing domain classes
  - preserve `BounceResult`
  - add any needed collections for slices/components/sample lists
  - provide safe terminal rendering for `sn`, `Sample`, and feature objects

- `src/renderer/bounce-globals.d.ts`
  - remove deprecated sample globals from typings
  - declare `sn`, `Sample`, feature classes, and any collection types
  - preserve top-level visualization typings
  - ensure `help()` is declared on all new user-facing object types

### REPL behavior and ergonomics

- `src/renderer/tab-completion.ts`
  - ensure completion understands `sn`
  - ensure completion can discover `Sample` and feature members from typings/API object shape

- `src/renderer/repl-evaluator.ts`
  - only if needed to expose new class/namespace globals correctly or improve completion/introspection

### Tests

- `src/bounce-api.test.ts`
  - replace tests for removed top-level sample functions
  - add tests for `sn.read()`, `Sample` methods, and rich feature objects

- `src/tab-completion.test.ts`
  - add/update coverage for `sn`, `Sample`, and feature member completion

- `tests/` Playwright/e2e coverage if current REPL workflows depend on old globals

### Documentation

- `specs/sample-object-api/RESEARCH.md`
  - no structural changes expected beyond referencing plan decisions if helpful

- `README.md` or REPL-facing help text in source
  - only if user-facing docs currently describe the old sample globals outside of runtime help

## Implementation Steps

1. **Define the new public model in types first**
   - specify `sn`, `Sample`, feature classes, and collection/result types in `bounce-globals.d.ts`
   - decide exact return types for `slice()`, `sep()`, and `granularize()`
   - finalize whether `sn.current()` is sync or async
   - require `help()` on every user-facing object type

2. **Introduce rich REPL domain objects**
   - implement `Sample` and feature classes in `bounce-result.ts` or a split file if that becomes too crowded
   - centralize constructors/helpers that can turn DB/IPC responses into domain objects
   - preserve `toString()` behavior for terminal output
   - ensure `sn`, `Sample`, and feature instances print useful summaries when returned directly from the REPL

3. **Refactor the renderer API factory**
   - add `sn` namespace construction
   - migrate loading/playback/display flows onto `Sample`
   - migrate onset/NMF/MFCC entry points onto sample methods
   - migrate derived-audio workflows (`slice`, `sep`, `granularize`) onto the relevant sample/feature objects
   - remove old top-level sample globals from the returned API object
   - attach help affordances consistently across namespace and object surfaces

4. **Keep visualization utilities working against the new model**
   - leave `visualizeNmf`, `visualizeNx`, `onsetSlice`, and `nmf` top-level
   - update any internals that depended on `AudioResult`/`FeatureResult`
   - document how they locate the active/current sample or feature in the new world

5. **Update REPL discoverability**
   - refresh root `help()` output
   - add `sn.help()` and `sn.read.help()`
   - add object-level help for `Sample` and each feature class
   - ensure completion and typings expose the new API clearly

6. **Rewrite automated tests**
   - replace old API tests with `sn`/`Sample`/feature-object tests
   - update completion tests
   - update any e2e scripts or fixtures that invoke removed globals

7. **Validate and document**
   - run lint and relevant tests
   - confirm terminal help/completion reflect the new surface
   - update any user-facing examples still referencing the old sample globals

## Testing Strategy

- Run `npm run lint`
- Run `npm run test`
- Run any focused Playwright coverage if REPL interaction tests already exist for affected flows

Manual verification checklist:

- `const samp = await sn.read("hash")` returns a usable object
- evaluating `sn` directly prints a useful summary instead of crashing
- evaluating `samp` directly prints a useful summary instead of crashing
- `await samp.play()` loads waveform and plays audio
- `samp.stop()` stops playback
- `await samp.onsets()` returns an `OnsetFeature`
- evaluating an `OnsetFeature`, `NmfFeature`, or `MfccFeature` directly prints useful summary info
- `sn.help()`, `samp.help()`, and each feature object's `help()` return useful guidance
- `await samp.nmf()` returns an `NmfFeature`
- `await samp.mfcc()` returns an `MfccFeature`
- `await samp.slice()` and `await samp.sep()` still produce usable derived audio workflows
- top-level visualization utilities still work with the shared current-audio context
- removed globals no longer appear in help or completion

## Success Criteria

- The REPL exposes a top-level `sn` namespace and no longer presents the old top-level sample/analysis functions as the canonical API
- `sn.read()` returns a `Sample` instance with metadata and behavior-bearing methods
- Sample analysis methods return rich feature objects rather than plain `FeatureResult`
- Every new user-facing object (`sn`, `Sample`, feature objects, and key collections where applicable) exposes a `help()` method
- Returning `sn`, a `Sample`, or a feature object from a REPL expression prints useful terminal output and does not crash the REPL
- The new object model covers playback, slicing, separation, granularization, and analysis workflows end to end
- Visualization remains available through top-level helpers and still works with the refactored sample/feature model
- Help text, typings, and completion consistently describe the new API
- Lint and relevant automated tests pass

## Risks / Mitigations

### Risk: Scope expansion from rich feature objects

Adding feature objects in the same refactor broadens the change considerably.

**Mitigation:** keep visualization out of scope for object migration, and keep feature objects narrowly focused on identity, metadata, and the most important workflow methods.

### Risk: Breaking existing REPL workflows abruptly

Immediate replacement means tests, examples, and muscle memory will all shift at once.

**Mitigation:** update help/completion/examples in the same change so the new workflow is discoverable immediately.

### Risk: Singleton playback semantics may feel odd on instances

`samp.stop()` still acts on shared transport state, not a private voice.

**Mitigation:** document this clearly in help text and keep `sn.current()` available so the shared-current-sample model is visible.

### Risk: Result/domain classes may become muddled

The current `BounceResult` hierarchy mixes display text with typed data. Rich objects could become confusing if they inherit behavior inconsistently.

**Mitigation:** decide early whether domain objects extend `BounceResult`, compose it, or provide their own `toString()` contract, and apply that choice consistently across `Sample` and feature classes.

### Risk: New objects may render poorly in the REPL

If user-facing objects rely on default object inspection or lack a stable stringification path, simply returning them from expressions could produce noisy output or runtime errors.

**Mitigation:** make printable summaries and `help()` support explicit design requirements for all user-facing objects, and cover them in API tests.

### Risk: Tab completion may lag behind runtime behavior

The new object-heavy API is only successful if the REPL can discover it.

**Mitigation:** treat `bounce-globals.d.ts` and completion tests as first-class deliverables, not cleanup.
