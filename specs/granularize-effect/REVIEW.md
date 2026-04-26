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
