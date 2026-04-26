# Spec Review: Granularize Effect (Audio Editor Workflow)

**Spec:** specs/granularize-effect
**Created:** 2026-04-26

---

## Round 1 — 2026-04-26

**Reviewers:** 5 sub-agents

### Reviewer Findings

#### Reviewer 1 (Completeness & Consistency)

**Critical:** GrainCollection constructor lacks grainPositions/grainSizeSamples storage — bounce() can't work without them. BounceGrainsOptions defined in two places (ipc-contract.ts AND granularize.rpc.ts) — should be single source of truth.

**Major:** Worker vs main process responsibility unclear. filter() breaks grain position correspondence. Help() attachment location unspecified. Null/silent grain handling during resynthesis undefined.

**Minor:** Density parameter range not validated. Pitch boundary behavior unspecified. featureHash stability unclear.

#### Reviewer 2 (Audio DSP)

**Critical:** C++ granular instrument only implements Hann window despite accepting envelope type parameter — the other 3 types (Hamming, Triangle, Tukey) are unimplemented. Source grain selection algorithm is vague ("map linearly") with no precise formula.

**Major:** No anti-aliasing for pitch-shifted reads — will alias at extreme values (4.0x). JSON-RPC number[] serialization is ~40-50MB for a 30s file. Overlap-add normalization strategy is "optional" — needs a clear default. Null grain handling undefined during resynthesis.

**Minor:** Window LUT size (1024) degrades for very short/long grains. Default density=20 not justified. Very high density can produce extreme overlaps.

#### Reviewer 3 (IPC & Rename Migration)

**Critical:** GrainCollection constructor change needed. IPC channel, preload bridge, and GrainCollectionPromise.bounce() proxy all missing (expected — they're implementation items).

**Major:** Rename scope incomplete — missed `src/renderer/bounce-globals.d.ts` and `src/electron/database.ts`. Redundant audio data transfer in RPC params. Tab completion and opts-docs entries missing.

**Minor:** filter() will break after constructor change. Error handling for missing bounce callback unspecified.

#### Reviewer 4 (REPL UX & Help System)

**Critical:** GrainCollection extends BounceResult not HelpableResult — needs @replType decorator for registry integration. No TypeDescriptor in registry means attachMethodHelpFromRegistry() won't attach help to bounce(). Tab completion lookup for "GrainCollection.bounce" will fail — no registry entry.

**Major:** attachNamespaceMethodHelp is wrong function for GrainCollection (it's a type, not a namespace). BounceGrainsOptions not in opts-docs.ts. Constructor signature change not reflected in sample-namespace.ts construction site.

**Minor:** Chaining proxy test gap. window.electron.bounceGrains not in types.d.ts.

#### Reviewer 5 (Testing & Edge Cases)

**Critical:** GrainCollection constructor change breaks existing callers.

**Major:** No tests for GrainCollectionPromise.bounce() proxy. Empty/all-silent grain collection behavior undefined. No input validation tests for out-of-range options. Missing IPC contract test for BounceGrains channel.

**Minor:** Identity resynthesis tolerance threshold unspecified. No concurrent bounce test. filter() doesn't preserve grain positions. Playwright test rename coverage incomplete.

### Consolidated Summary

**Themes across all 5 reviewers:**

1. **GrainCollection architecture gap (all 5 reviewers):** The class needs fundamental changes — new constructor params, @replType decorator, bounce() method, help() support. This is the most impactful change and must be designed carefully.

2. **Resynthesis algorithm underspecified (reviewers 1, 2, 5):** The grain selection formula, null grain handling, normalization strategy, and window envelope implementation all need precise pseudocode, not prose descriptions.

3. **Help system integration (reviewers 1, 4):** GrainCollection needs @replType decorator and must use attachMethodHelpFromRegistry() (not attachNamespaceMethodHelp). Without this, bounce.help() and tab completion won't work.

4. **Filter + bounce position alignment (reviewers 1, 3, 5):** When grains are filtered, the corresponding grainPositions must also be filtered to maintain 1:1 correspondence. This is unaddressed.

5. **BounceGrainsOptions single source of truth (reviewers 1, 3):** Define in one place (rpc contract), import elsewhere. Don't duplicate.

6. **Audio quality at extremes (reviewer 2):** Aliasing at high pitch, window LUT resolution for tiny grains, and no normalization default are real DSP concerns that should at least be documented as known limitations.

7. **Rename scope incomplete (reviewers 3, 5):** Missing bounce-globals.d.ts and possibly database.ts from the rename file list.

**Priority issues to resolve before implementation:**

| # | Issue | Severity | Action |
|---|-------|----------|--------|
| 1 | GrainCollection needs @replType, grainPositions, bounceCallback | Critical | Update PLAN §8 with full constructor design |
| 2 | Grain selection algorithm needs precise formula | Critical | Add pseudocode to PLAN §2 |
| 3 | Null grain handling during resynthesis undefined | Major | Specify: skip nulls, use only non-null positions |
| 4 | Help system: use attachMethodHelpFromRegistry, not namespace help | Major | Fix PLAN §8 and REPL contract |
| 5 | BounceGrainsOptions: single source of truth | Major | Define only in rpc contract, re-export |
| 6 | filter() must filter grainPositions in tandem | Major | Update PLAN §8 with filter() changes |
| 7 | Normalization strategy: normalize if peak > 1.0 by default | Major | Add to PLAN §2 algorithm |
| 8 | Rename scope: add bounce-globals.d.ts | Minor | Update PLAN §1 file list |
| 9 | Edge case tests: empty collection, invalid options | Minor | Add to PLAN testing strategy |
| 10 | Document aliasing as known limitation at extreme pitch | Minor | Add to PLAN risks |

### Changes Applied

| Document | Change | Rationale |
|----------|--------|-----------|
| PLAN.md §2 (Resynthesis Engine) | Added precise grain selection formula, null grain handling, normalization strategy | Reviewers 1,2,5: algorithm was underspecified |
| PLAN.md §8 (GrainCollection) | Added @replType decorator, attachMethodHelpFromRegistry, updated filter() to preserve positions | Reviewers 1,3,4,5: architecture gap |
| PLAN.md §1 (Rename) | Added bounce-globals.d.ts to rename file list | Reviewer 3: missed file |
| PLAN.md REPL Interface Contract | Fixed: use attachMethodHelpFromRegistry not attachNamespaceMethodHelp | Reviewer 4: wrong help function |
| PLAN.md §3 (RPC) | BounceGrainsOptions defined only in rpc contract, re-exported from ipc-contract | Reviewers 1,3: single source of truth |
| PLAN.md Testing Strategy | Added edge case tests: empty collection, invalid options, filtered bounce, proxy chaining | Reviewer 5: coverage gaps |
| PLAN.md Risks | Added aliasing at extreme pitch as known limitation | Reviewer 2: DSP quality concern |
| RESEARCH.md §5 | Updated to note C++ only implements Hann window; TS must implement all 4 | Reviewer 2: envelope gap |

---

## Round 2 — 2026-04-26

**Reviewers:** 5 sub-agents

### Reviewer Findings

#### Reviewer 1 (Full Implementation Audit)

**Critical:** filter() pseudocode has array indexing bug — uses raw loop index `j` to access `#grainPositions` which only contains non-null entries. `GranularizeResult` missing `grainSizeSamples` field at IPC boundary. REPL contract checklist prematurely marked as checked (items not implemented yet).

**Major:** Sample-namespace constructor call site will break when GrainCollection constructor changes. Normalization strategy ambiguous ("always" vs "if peak > 1.0"). Density/pitch parameter validation unspecified.

**Minor:** silenceThreshold comment in RPC type needs updating. Test strategy references files that don't exist yet (expected — they're to-be-created).

#### Reviewer 2 (DSP Algorithm Precision)

**Critical:** `normalize` parameter missing from `ResynthesisParams` — normalization is either always-on or always-off with no user control.

**Major:** Grain boundary handling unspecified — what if `outPos + grainSizeSamples > outputLengthSamples`? Source boundary handling unspecified — what if pitch-shifted read exceeds source length? Window LUT interpolation imprecise for very short grains (< 10 samples).

**Minor:** Density can produce extreme overlaps at high values. Multi-channel behavior not addressed (mono output only). Grain selection via `Math.round()` may skip grains or repeat them.

#### Reviewer 3 (Data Flow Trace)

**Critical:** `grainStartPositions` exists in RPC contract (`granularize.rpc.ts`) but is missing from IPC contract (`ipc-contract.ts` `GranularizeResult`). This breaks the data flow — renderer cannot access grain positions for bounce(). `grainSizeSamples` also missing from IPC response.

**Major:** Full data flow trace confirms 7 implementation gaps (all expected — these are plan items, not code yet). Preload bridge and type declarations need explicit attention.

**Minor:** `bounceSample` method in sample-namespace needs to be documented in PLAN.

#### Reviewer 4 (Rename Scope Audit)

**Critical:** Rename scope incomplete — 7 additional files found via codebase search: `src/shared/rpc/granularize.rpc.ts`, `src/shared/ipc-contract.ts`, `src/electron/database.ts`, `src/electron/preload.ts`, `src/electron/ipc/sample-handlers.ts`, `src/renderer/types.d.ts`, `src/electron/audio-resolver.ts`. Plus 3 additional test files: `src/audio-resolver.test.ts`, `src/shared/ipc-contract.test.ts`, `tests/workflows/helpers.ts`.

**Major:** `GranularizeOptions` type rename to `GrainsOptions` not addressed in PLAN. IPC channel `"granularize-sample"` should be renamed to `"grains-sample"` for full-stack consistency.

**Minor:** RPC method key rename (`granularize` → `grains` in GranularizeRpc) not explicit.

#### Reviewer 5 (Consistency & Terminology)

**Major:** Stale problem statement in RESEARCH.md still references old approach. Duplicate paragraph in PLAN.md approach summary (items 1-3 repeated). Success criterion #11 vague.

**Minor:** Terminology inconsistency between "granular resynthesis" and "overlap-add resynthesis". silenceThreshold change not detailed enough in implementation sections.

### Consolidated Summary

**Themes across round 2:**

1. **Rename scope significantly expanded (reviewer 4):** 7 additional source files and 3 test files were missed in the rename table. IPC channel name should also be renamed for consistency. `GranularizeOptions` type needs renaming to `GrainsOptions`.

2. **IPC data flow gap (reviewers 1, 3):** `grainStartPositions` and `grainSizeSamples` exist in the RPC layer but are not exposed through the IPC contract `GranularizeResult`. Without these, the renderer cannot construct a bounce-capable `GrainCollection`.

3. **filter() indexing bug (reviewers 1, 2):** The pseudocode uses `#grainPositions[j]` where `j` is the raw loop index over `#grains` (includes nulls), but `#grainPositions` only contains non-null entries. Needs separate `posIndex` tracker.

4. **Algorithm boundary conditions (reviewer 2):** Grain truncation at buffer end, source exhaustion during pitch-shifted reads, and parameter validation were all unspecified. Now addressed with explicit truncation, zero-padding, and validation rules.

5. **ResynthesisParams missing normalize (reviewer 2):** User should be able to opt out of normalization. Added `normalize?: boolean` (default true).

6. **Duplicate content and premature checkmarks (reviewers 1, 5):** Approach summary had a duplicate paragraph. REPL checklist was marked complete prematurely.

**Priority issues resolved:**

| # | Issue | Severity | Action Taken |
|---|-------|----------|-------------|
| 1 | Rename scope incomplete — 7+ files missing | Critical | Expanded rename table with all missing files |
| 2 | filter() indexing bug with grainPositions | Critical | Fixed pseudocode with separate posIndex tracker |
| 3 | grainStartPositions/grainSizeSamples missing from IPC | Critical | Added to GranularizeResult in IPC contract section |
| 4 | Grain boundary handling unspecified | Major | Added truncation rule and zero-padding for source exhaustion |
| 5 | normalize missing from ResynthesisParams | Major | Added optional normalize parameter (default true) |
| 6 | Parameter validation unspecified | Major | Added validation step with specific error conditions |
| 7 | Duplicate paragraph in approach summary | Minor | Removed duplicate |
| 8 | REPL checklist prematurely checked | Minor | Unchecked all items |

### Changes Applied

| Document | Change | Rationale |
|----------|--------|-----------|
| PLAN.md §1 (Rename) | Added 10 additional files to rename table: rpc contract, ipc contract, database, preload, sample-handlers, types.d.ts, audio-resolver, plus 3 test files. Added GranularizeOptions → GrainsOptions rename. Added IPC channel rename. | Reviewer 4: rename scope incomplete |
| PLAN.md §2 (Resynthesis) | Expanded algorithm with explicit boundary handling: grain truncation at buffer end (step 4e), source zero-padding when exhausted (step 4c), parameter validation (step 6). Made window LUT interpolation precise. | Reviewer 2: boundary conditions unspecified |
| PLAN.md §2 (ResynthesisParams) | Added `normalize?: boolean` parameter (default true) | Reviewer 2: normalize should be optional |
| PLAN.md §3 (BounceGrainsOptions) | Added `normalize?: boolean` parameter | Consistency with ResynthesisParams |
| PLAN.md §4 (IPC Contract) | Added `grainStartPositions` and `grainSizeSamples` fields to GranularizeResult | Reviewers 1,3: IPC data flow gap |
| PLAN.md §8d (filter) | Fixed indexing bug: added separate `posIndex` tracker for non-null positions | Reviewers 1,2: array out-of-bounds bug |
| PLAN.md Approach Summary | Removed duplicate paragraph (items 1-3 were repeated) | Reviewer 5: duplicate content |
| PLAN.md REPL Checklist | Unchecked all items — they are implementation targets, not completed work | Reviewer 1: prematurely checked |
