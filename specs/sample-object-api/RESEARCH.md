# Research: Sample Object API

**Spec:** specs/sample-object-api  
**Created:** 2026-03-15  
**Status:** Complete

## Problem Statement

Bounce's REPL currently exposes sample-oriented behavior through a mix of top-level functions and typed result objects. Typical usage today looks like `play("kick.wav")`, `analyze()`, `slice()`, or `sep(audio)`. That works, but the API shape is inconsistent with the newer `fs` namespace, and it forces the user to think in terms of hashes and ambient "current audio" rather than persistent sample objects.

The proposed direction is to move toward an object-oriented sample API that starts from a top-level namespace, e.g. `const samp = sn.read("HASH")`, and then exposes behavior on the returned object: `samp.play()`, `samp.stop()`, `samp.slice()`, `samp.sep()`, `samp.granularize()`, `samp.nmf()`, `samp.mfcc()`, and `samp.onsets()`.

## Background

The renderer REPL already has a typed API factory in `src/renderer/bounce-api.ts`, a typed globals declaration file in `src/renderer/bounce-globals.d.ts`, and a result model in `src/renderer/bounce-result.ts`. The current sample flow centers on `AudioResult` and `FeatureResult`, which carry hashes so users can compose functions, but they are data/result carriers rather than rich domain objects.

The codebase has already moved one area in the desired direction: `fs` is a single top-level namespace with discoverable methods like `fs.ls()`, `fs.cd()`, and `fs.glob()`, plus typed result wrappers that support chaining. That makes `fs` the best internal precedent for the proposed `sn` surface.

## Related Work / Prior Art

### Internal prior art: `fs`

`fs` is implemented as a namespace object constructed inside `buildBounceApi()`. It exposes:

- a root `fs.help()`
- named methods with their own `.help()`
- rich results like `LsResult`, `GlobResult`, `LsResultPromise`, and `GlobResultPromise`

This is useful precedent for:

- discoverability via namespace grouping
- per-method help text
- typed chainable objects instead of plain JSON
- a REPL-friendly mental model that avoids too many globals

### Internal prior art: result objects

`AudioResult` and `FeatureResult` already preserve identity:

- `AudioResult` carries `hash`, `filePath`, `sampleRate`, `duration`
- `FeatureResult` carries `sourceHash`, `featureHash`, `featureType`

That means the refactor is not starting from zero. The system already has stable identifiers and typed objects; the main shift is to turn those identifiers into first-class behavior-bearing objects.

### Existing composition model

Current composition is function-based:

- `sep(play("..."))`
- `const a = display("loop.wav"); analyzeMFCC(a)`
- `analyze(); slice(); playSlice(0)`

This is flexible, but less discoverable than instance methods and still exposes workflow seams like "use current audio if omitted" or "pass sample hash as the first argument."

## FluCoMa Algorithm Details

The relevant analysis/resynthesis surfaces already exist:

- Onset slicing via `analyze()` -> stored as `feature_type = "onset-slice"`
- NMF decomposition via `analyzeNmf()` -> stored as `feature_type = "nmf"`
- MFCC extraction via `analyzeMFCC()` -> stored as `feature_type = "mfcc"`
- Granularization via `granularize()` -> stored as `feature_type = "granularize"`
- Separation via `sep()` currently depends on existing NMF analysis/derived samples

Each of these features is already persisted through the database layer, keyed by sample hash plus feature hash, so a future `Sample` object can act as a stable entry point for both analysis and retrieval.

## Technical Constraints

### Current API architecture

The current REPL API is built in the renderer:

- `buildBounceApi()` creates globals and namespace objects
- `preload.ts` exposes IPC methods on `window.electron`
- `main.ts` handles IPC and delegates to the database layer / command modules
- `database.ts` stores samples, features, and derived samples

Any `Sample` refactor will need to span at least:

- renderer API construction
- type declarations in `bounce-globals.d.ts`
- likely result/domain classes in `bounce-result.ts`
- tab completion/help text
- tests for the REPL API surface

### Hash identity is core

The entire persistence model is based on sample hashes and feature hashes:

- `samples.hash` identifies a sample
- `features.sample_hash` links analyses to a source sample
- `samples_features` links derived samples back to `source_hash` and `feature_hash`

This strongly suggests that `Sample` should be a thin domain wrapper around a persisted sample identity, not an object that owns mutable audio state.

### Current audio manager is singleton-style

Playback and waveform display are currently driven by a single `AudioManager` instance and a single "current audio" value. Global `play()`, `display()`, `analyze()`, and visualization commands rely heavily on that ambient state.

This creates an important design constraint:

- `samp.play()` can still load the sample into the shared playback/display context
- `samp.stop()` cannot realistically stop only "that object's" playback unless Bounce gains multi-voice playback state

In other words, `Sample.stop()` would be object-oriented syntax over a globally shared transport.

### IPC shape is already close

The preload bridge already exposes the primitives needed for a first pass:

- `readAudioFile(pathOrHash)`
- `getSampleByHash(hash)`
- `getMostRecentFeature(sampleHash, featureType)`
- `createSliceSamples(sampleHash, featureHash)`
- `getDerivedSampleByIndex(sourceHash, featureHash, index)`
- `granularizeSample(sourceHash, options)`
- `storeFeature(sampleHash, featureType, featureData, options)`

That suggests the first version of `Sample` can mostly be implemented in the renderer without immediately changing the persistence schema.

## Audio Processing Considerations

The current system stores full audio buffers in SQLite and reloads them as needed. `display()` and `play()` both flow through loading sample audio into the renderer-managed `AudioManager`. Derived samples such as slices, components, and grains are also persisted as samples with provenance links.

Implications for the refactor:

- `Sample` methods should preserve lazy loading where possible; the object itself should not require eagerly embedding the full audio buffer
- analysis methods can continue to load/render the sample into the current audio context before computing or visualizing results
- derived audio artifacts may want their own object model later (`SliceSample`, `ComponentSample`, `GrainCollection`), but that can be a second phase

## Terminal UI Considerations

Bounce is REPL-first, so discoverability matters as much as type correctness. A namespaced object model can improve the user experience if it stays inspectable:

- `sn.help()` should explain the namespace
- `sn.read.help()` should explain how samples are acquired
- `Sample` methods should each have `.help()` where practical, or at minimum be discoverable through typings/tab completion
- help text should show end-to-end examples like:
  - `const samp = sn.read("hash")`
  - `samp.play()`
  - `const f = samp.onsets()`
  - `samp.slice()`

One caution: instance methods are harder to describe in static globals help than top-level functions, so the REPL completion/help system will need to expose method members well.

## Cross-Platform Considerations

The refactor is mostly renderer/TypeScript/API work, so it should be platform-neutral as long as it keeps using existing IPC/database layers. The biggest cross-platform concern is preserving current file/path behavior through `readAudioFile()` and related display/load paths.

Because the proposed API uses hashes and sample objects more often than raw file paths, it may actually reduce path handling at the call site, which is beneficial for cross-platform consistency.

## Open Questions

1. **Should `AudioResult` become `Sample`, or should `Sample` be a new class?**  
   Recommendation: introduce a new `Sample` class or rename/evolve `AudioResult` into it in one deliberate pass. A partial aliasing approach could get confusing fast.

2. **Should `sn.read()` replace `display()` and `play()`, or coexist initially?**  
   Recommendation: coexist first. Keep top-level functions as compatibility shims during the migration, but make the spec target the object API as the preferred surface.

3. **What should analysis methods return?**  
   Options:
   - return `FeatureResult` as today
   - return richer feature objects (`OnsetFeature`, `NmfFeature`, `MfccFeature`)
   - return `Sample` for side-effect-driven workflows

   Recommendation: keep returning typed feature/result objects in the first refactor, then consider feature objects as a follow-up. This limits scope and preserves composition.

4. **Which globals remain top-level?**  
   Likely keep:
   - `fs`
   - `help`
   - maybe visualization utilities

   Likely move under `sn`/`Sample`:
   - `play`
   - `stop`
   - `slice`
   - `sep`
   - `granularize`
   - `analyzeNmf` / `analyzeMFCC` / onset analysis

5. **How should "current audio" semantics work after the refactor?**  
   Recommendation: preserve the singleton playback/display model internally, but make `Sample` methods explicitly load themselves into that context instead of depending on omitted arguments.

6. **Should `sn` also expose listing/query helpers?**  
   Likely useful additions:
   - `sn.read(hashOrPath)`
   - `sn.list()`
   - `sn.current()`

   This would make the namespace feel parallel to `fs` instead of being only a factory.

7. **What should the method names be?**  
   The user proposed concise names:
   - `play`, `stop`
   - `slice`, `sep`, `granularize`
   - `nmf`, `mfcc`, `onsets`

   That is more coherent than mixing verbs like `analyzeNmf` and nouns like `nmf`.

## Research Findings

1. **The existing codebase is already structurally ready for this refactor.**  
   The renderer API factory, typed globals, and typed result classes provide a clean place to introduce a `sn` namespace and `Sample` class.

2. **`fs` is a strong model for the namespace, but not for instances.**  
   `fs` proves the value of grouping methods under one global object. The sample refactor will need an additional pattern: a rich instance type representing a persisted sample.

3. **The persistence model strongly favors identity-based objects.**  
   Because samples and features are already keyed by hash, a `Sample` object can be lightweight and reconstructable from stored metadata.

4. **The current API has inconsistent argument semantics.**  
   Some functions accept omitted sources and fall back to current audio; others require an explicit `AudioResult`. Moving behavior onto `Sample` instances would remove much of that ambiguity.

5. **A compatibility layer is feasible.**  
   Existing top-level functions can likely be reimplemented as thin wrappers over `sn` and `Sample` methods during migration, which reduces rollout risk and preserves old workflows while docs and tests catch up.

6. **Feature objects are an attractive but probably separate concern.**  
   The proposed sample object refactor is already substantial. Turning `FeatureResult` into a full object model at the same time would broaden scope significantly.

## Next Steps

The PLAN phase should focus on:

1. Defining the exact public API:
   - `sn` namespace methods
   - `Sample` constructor/factory behavior
   - which methods return `Sample`, `FeatureResult`, `BounceResult`, or collections

2. Choosing the migration strategy:
   - compatibility shims vs immediate replacement
   - whether `AudioResult` is renamed, wrapped, or superseded

3. Mapping affected files:
   - `src/renderer/bounce-api.ts`
   - `src/renderer/bounce-globals.d.ts`
   - `src/renderer/bounce-result.ts`
   - `src/renderer/tab-completion.ts`
   - `src/bounce-api.test.ts`
   - possibly REPL/help docs and e2e tests

4. Deciding whether feature objects are in scope for this spec or explicitly deferred.
