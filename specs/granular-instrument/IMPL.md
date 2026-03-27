# Implementation: Granular Instrument

**Spec:** specs/granular-instrument  
**Created:** 2026-03-21  
**Status:** In Progress — awaiting `./build.sh`

## Context

Real-time granular synthesis instrument built on the existing `Instrument` C++ abstract base and `inst` REPL namespace from the sampler-instrument spec. No IPC protocol changes needed — `kind: "granular"` routes to the new `GranularInstrument` class.

## Implementation Log

- **2026-03-26**: PLAN.md filled out; C++ implementation complete (`GranularInstrument`, `GrainStream`, Hann LUT, grain scheduler); TypeScript `inst.granular()`, `set()`, `load()` added; 6 unit tests passing; Playwright e2e test written.

## Decisions Made

- `set()` method attached to all instrument result objects (not just granular) — but only granular has meaningful non-volume params. Sampler can use `set({ volume: ... })` in future.
- `load(sample)` convenience method wraps `loadSample(0, sample)` — note=0 convention for single-source instruments.
- Granular params stored in `InstrumentState.granularParams` for live display updates without re-querying native.
- Tab completion is runtime-driven (no code changes needed).

## Deviations from Plan

- `src/renderer/results/instrument.ts` was not changed — the display string is built in `formatInstrument()` inside the namespace, so no constructor changes needed. Simpler.

## Flaws Discovered in Previous Phases

None.

## Issues & TODOs

- Auto-gain at high density (clipping prevention) deferred per RESEARCH.md.
- Asynchronous (stochastic) grain scheduling deferred — synchronous scheduling is MVP.
- Multi-channel source support deferred — first channel only.

## Testing Results

**Unit tests** (`npx tsx --test src/granular-instrument.test.ts`):
```
✔ inst.granular.help() mentions granular synthesis (0.45ms)
✔ inst.granular() returns an object whose toString() starts with Granular (0.25ms)
✔ inst.granular() default params shown in toString() (0.07ms)
✔ g.set({ position: 0.3 }) updates toString() (0.13ms)
✔ g.help() output contains Load the source sample and grainSize (0.12ms)
✔ g.set({ unknown: 1 }) returns error message containing unknown params (0.06ms)
pass 6 / fail 0
```

**Lint**: `npm run lint` — clean.

**Playwright**: `tests/granular-instrument.spec.ts` written (7 tests). Awaiting `./build.sh`.

---

## Final Status

<!-- When work is complete, summarize outcome -->

**Completion Date:** TBD

**Summary:**

**Verification:**
- [ ] Linting passed
- [ ] TypeScript builds
- [ ] Tests pass
- [ ] Manual testing complete
- [ ] REPL help() coverage verified by unit and/or Playwright tests (if applicable)
- [ ] REPL returned-object terminal summaries verified by unit and/or Playwright tests (if applicable)
- [ ] Cross-platform tested (if applicable)

**Known Limitations:**

**Future Improvements:**
