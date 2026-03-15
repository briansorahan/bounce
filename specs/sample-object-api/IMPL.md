# Implementation: Sample Object API

**Spec:** specs/sample-object-api  
**Created:** 2026-03-15  
**Status:** Complete

## Plan Reference

Implemented the PLAN.md refactor to replace the old top-level sample globals with:

- `sn.read()`, `sn.list()`, `sn.current()`, and `sn.help()`
- `Sample` instances with playback, analysis, slicing, separation, and granular methods
- rich feature objects (`OnsetFeature`, `NmfFeature`, `MfccFeature`) with object-level `help()`
- REPL-safe rendering for all returned API objects via `BounceResult`-style wrappers

Key plan constraints preserved:

- no compatibility shims for removed top-level sample globals
- visualization helpers remain top-level
- help is available on every new object
- returning `sn`, `Sample`, or feature objects from the REPL prints useful summaries instead of crashing

## Progress Log

- Reworked `src/renderer/bounce-result.ts` into the new domain model with `Sample`, `SampleNamespace`, rich feature objects, and shared help/rendering support.
- Refactored `src/renderer/bounce-api.ts` to expose the new `sn` namespace and bind instance methods for playback, slicing, separation, granularization, and analysis.
- Updated `src/renderer/bounce-globals.d.ts` to describe the new public REPL API and removed the old top-level sample function declarations.
- Updated `src/renderer/tab-completion.ts` so method completion works for prototype-based objects like `sn` and `Sample`.
- Cleaned up reserved REPL globals in `src/renderer/repl-evaluator.ts` to match the new API surface.
- Rewrote `src/bounce-api.test.ts` and `src/tab-completion.test.ts` around the new API shape.
- Updated related types and supporting code (`grain-collection.ts`, `types.d.ts`) to use `Sample` and feature metadata consistently.

## Deviations from Plan

- `Sample.display()` was kept as a convenience method in addition to `sn.read()` because it matches the object model well and provides a simple way to re-focus the shared current sample without reintroducing top-level globals.
- `help()` was implemented primarily at the object level (`sn.help()`, `sample.help()`, `feature.help()`), with method-level `.help()` attached where already ergonomic on namespace functions such as `sn.read.help()`, `sn.list.help()`, and `sn.current.help()`.

## Verification

- `npm run lint` — passed
- `npm run test` — passed
- `npx tsx src/bounce-api.test.ts` — passed
- `npm run build:electron` — passed

## Outstanding Issues / TODOs

- Playwright end-to-end coverage still needs a broader migration to the new `sn` / instance-method API where tests still assume removed top-level sample globals.

## Final Status

The renderer REPL sample API now uses an object model centered on `sn` and `Sample`, with rich feature objects and universal object-level help. The TypeScript surface, completion behavior, help text, focused API tests, and build all reflect the new shape.
