# Spec Review: REPL Intelligence

**Spec:** specs/repl-intelligence
**Created:** 2026-04-04

---

## Round 1 — 2026-04-04

**Reviewers:** 5 sub-agents

### Reviewer Findings

#### Reviewer 1

##### Completeness

1. **IMPL.md is pre-implementation boilerplate.** "Deviations from Plan," "Flaws Discovered," "Issues & TODOs," and "Testing Results" are empty template stubs — expected, but a note clarifying these fill in during execution would prevent confusion.
2. **`session_start_timestamp` migration strategy is internally contradicted.** RESEARCH.md § Session File Accumulation says "Add to the existing migration in place." IMPL.md Decision 15 repeats the same. This bypasses the migration versioning system ARCHITECTURE.md prescribes. Rationale is stated but "drop-and-recreate" is fragile.
3. **`corpus` namespace absent from completer taxonomy.** ARCHITECTURE.md lists `corpus`. PLAN.md completer tables cover `sn`, `fs`, `vis`, `proj`, `inst`, `midi`/`mx`/`transport`/`pat` but not `corpus`. Intentional or oversight?
4. **`transport` and `pat` have no method-level completer tables.** Unlike every other namespace, no method-level table is provided.
5. **`IdentifierCompleter` user-variable source has no IPC mechanism.** `CompletionContext` does not carry user variable names, and no channel is defined to retrieve them from the language service.
6. **`PredictionResult` type is never defined.** Both documents reference `Iterator<PredictionResult>` but never specify its shape.
7. **`Completer` interface shape is never defined.** PLAN.md lists `src/shared/completer.ts` as containing the interface but gives no concrete definition.

##### Consistency

1. **PLAN.md § Plan Consistency Checklist false claim.** Item says "phased migration, old system works alongside new" but RESEARCH.md Resolved Question #10 and IMPL.md Decision #19 both explicitly state "No transition period — single-pass massive refactor."
2. **Phase 5 naming inconsistency.** PLAN.md uses "5a–5e" in Changes Required but "5.1–5.5" in Implementation Order. IMPL.md uses 5.1–5.5 throughout.
3. **ARCHITECTURE.md namespace list vs PLAN.md namespace list.** ARCHITECTURE.md lists 8 namespaces; PLAN.md migrates 9 chunks (missing `corpus`, adding `transport`/`pat` not in ARCHITECTURE.md).
4. **`help()` method vs `@describe` decorator — relationship undefined.** Does the user still type `sn.help()`? Is `help()` now a built-in that reads `Describable` metadata? Migration path for the user-facing call is unclear.

##### Feasibility

1. **TS language service memory growth is unbounded between `env.clear()` calls.** No session file size cap or line-count limit defined.
2. **`FilePathCompleter` path separator on Windows not addressed.**
3. **`completion:request` channel not added to `ipc-contract.ts`.** All IPC channels must be typed there; this is a concrete integration gap.
4. **`save-command` as "single choke point" is an unverified assumption.** If any evaluation path bypasses it, commands silently miss the language service session.
5. **Race condition: first completion request may arrive before `langservice:ready`.** Spec defaults to silent drop without discussing the queue-until-ready alternative.

##### REPL Interface Contract

1. **User-facing `help()` invocation mechanism is unspecified.**
2. **`terminalSummary` on `@replType` is underspecified** — no template syntax defined.
3. **`Describable` interface is never defined.**
4. **Claim "existing tests continue to work" for `help()` is likely false** — tests asserting JSDoc-generated output must be rewritten for decorator-based output.
5. **No terminal summary defined for health metrics or `dev` toggle result.**

##### Testing Strategy

1. **Completer unit tests described but not scoped** — no representative test cases per completer.
2. **No regression E2E test for existing tab completion.**
3. **No test for `langservice:session-append` correctness.**
4. **No test for `session_start_timestamp` boundary conditions** (exact timestamp, multiple `env.clear()`, project switch, no history).
5. **Crash loop prevention only manually tested** — should have automated unit tests for the highest-risk recovery path.
6. **No cross-platform test strategy.**
7. **No performance regression test.**

##### Clarity

1. **"Parallelizable chunks" contradicts "all must land together"** — intended meaning (parallel dev on one branch, merged atomically) is never stated.
2. **`repl-registry.ts` vs `repl-registry.generated.ts` naming collision risk.**
3. **`Describable` enforcement chain is vague.**
4. **Main process access to renderer-side runtime registry is never explained.**
5. **`env.dev()` is deferred to Phase 5c but referenced as complete throughout earlier sections.**

##### Top Priority Issues (Reviewer 1)

1. `PredictionResult` and `Completer` interface shapes undefined — Phase 3 blocking.
2. `IdentifierCompleter` user-variable source has no IPC mechanism.
3. `corpus` namespace missing from migration plan.
4. User-facing `help()` invocation mechanism unspecified.
5. `terminalSummary` template syntax undefined.
6. `session_start_timestamp` migration bypasses versioning system.
7. `completion:request` not added to `ipc-contract.ts`.
8. Crash loop prevention only manually tested.
9. "No transition period" + "parallelizable chunks" contradiction.
10. No regression E2E baseline for existing completion.

---

#### Reviewer 2

##### Completeness

1. **IMPL.md is largely a placeholder / near-duplicate of PLAN.md decisions.** No additive value beyond 21 decisions already covered in RESEARCH.md and PLAN.md.
2. **`PredictionResult` is never defined.** Shape is critical for renderer ghost text rendering and Phase 3 completers.
3. **`Describable` interface shape never defined.**
4. **`langservice:session-append` trigger point not assigned to a phase.** RESEARCH.md says it lives in `save-command` handler, but PLAN.md Phase 2 does not list modification of `history-handlers.ts`.
5. **`OptionsCompleter` `existingKeys` extraction mechanism not specified.** Context carries `existingKeys` but no completer note calls this out.

##### Consistency

1. **"Companion interface" ruled out in RESEARCH.md but PLAN.md checklist claims `Describable` provides enforcement.** Creates ambiguity about compile-time vs. runtime guarantees.
2. **PLAN.md checklist directly contradicts "no transition period" decision.**
3. **`session_start_timestamp` migration bypasses the project's migration skill** (`.github/skills/add-database-migration/SKILL.md`) without documentation.
4. **ARCHITECTURE.md namespace list doesn't include `transport`, `pat`, `midi`** — spec makes no note of updating ARCHITECTURE.md to reflect these.
5. **`corpus` absent from Phase 5.1 migration table.**

##### Feasibility

1. **TypeScript language service memory understated.** Power-user sessions can push 300–500MB; 200MB warning threshold may trigger frequently.
2. **Partial `.d.ts` coverage during Phase 5 migration not addressed.** Language service utility process (Phase 2) starts before all namespaces are migrated.
3. **`experimentalDecorators` tsconfig scope is incomplete.** PLAN.md only mentions `tsconfig.json`; `tsconfig.renderer.json` must also be updated since namespace files live in `src/renderer/`.
4. **`typescript` package runtime dependency not discussed.** ~8MB JS, ~200MB unpacked — needs build config for the new utility process.
5. **`@param` prepend-ordering validation script responsibilities not defined.**

##### REPL Interface Contract

1. **`help()` entry point not concretely redefined for new system.**
2. **`terminalSummary` optionality fallback undefined.**
3. **No `help()` output format specification for the new system.**
4. **`@describe` `returns` field: required or optional? Shown in `help()` or not?**

##### Testing Strategy

1. **E2E tests thin.** No test for full loop (evaluate command → session accumulation → type-aware completion); no crash recovery test; no `env.clear()` context reset test; no cross-platform path handling.
2. **Build-time validation script has no automated tests.**
3. **Session derivation tests vaguely specified** — no scenarios for TS errors in history, NULL `session_start_timestamp`, project switch.
4. **No E2E test for user-variable type-aware completion** — the core value proposition.
5. **No performance baseline or regression test.**

##### Clarity

1. **"Single-pass massive refactor" vs. "parallelizable chunks"** — branch/merge strategy never stated.
2. **`env.dev()` deferred to Phase 5c but referenced throughout as complete feature.**
3. **`session_start_timestamp` location (SQLite) vs. settings store (JSON) — never explicitly justified.**

##### Top Priority Issues (Reviewer 2)

1. `PredictionResult` type undefined — Phase 3 blocking.
2. PLAN.md checklist contradicts "no transition period" decision.
3. `corpus` absent from migration plan.
4. `Describable` role is ambiguous (runtime vs. enforcement).
5. `experimentalDecorators` tsconfig scope incomplete.
6. No E2E test for user-variable type-aware completion.
7. `session_start_timestamp` migration bypasses stated migration process.
8. `terminalSummary` optionality has unspecified fallback behavior.

---

#### Reviewer 3

##### Completeness

1. **IMPL.md is a decisions dump, not a log.** All work sections are empty stubs; Decision log largely duplicates RESEARCH.md and PLAN.md content.
2. **`IdentifierCompleter` user variable resolution protocol undefined.** No channel exists to query in-scope variables from the language service.
3. **`Describable` interface never defined.**
4. **`terminalSummary` on `@replType` underspecified** — no template format, no substitution variables, no rendering spec.
5. **No full `@replType` + `@describe`/`@param` example for a type with meaningful `terminalSummary`.**
6. **Phase 5.3 "help system transition" lacks a spec for `help()` invocation.** Current baseline not documented.
7. **RESEARCH.md § Next Steps "application state taxonomy" not cross-referenced to Phase 5.5.**

##### Consistency

1. **"Companion interface" ruled out in RESEARCH.md but PLAN.md checklist says "`Describable` interface" provides enforcement.** These are different things using similar vocabulary.
2. **Phase numbering mismatch inside PLAN.md** — "5a/5b/5c/5d/5e" in Changes Required vs "5.1/5.2/5.3/5.4/5.5" in Implementation Order.
3. **PLAN.md checklist "old system works alongside new" directly contradicts Resolved Question #10.**
4. **`app.ts` vs `repl-evaluator.ts` boundary for session restore startup step unclear.**
5. **`corpus` absent from Phase 5.1 migration table** while present in ARCHITECTURE.md.

##### Feasibility

1. **TypeScript compiler bundling for new utility process not addressed.** No esbuild/Webpack config for new entry point specified.
2. **`.d.ts` generator resolves option types "one level deep"** — blast radius of nested option types not enumerated.
3. **`langservice:session-restore` implicit-await mismatch.** If `command_history` stores raw user input (e.g., `sn.read("kick.wav")` without `await`), type inference will show `Promise<Sample>` not `Sample`. Spec does not address whether raw or transformed source is stored.
4. **Ghost text rendering does not address stale response handling.** Spec discards stale responses by request ID but doesn't address showing stale ghost text until next response arrives.

##### REPL Interface Contract

1. **`help()` method signature, return type, and output format never defined.**
2. **`terminalSummary` undefined** — whether plain string, template, or function is never specified.
3. **"Enforced by decorator metadata" is not enforcement.** Missing `terminalSummary` on a `@replType` results in no terminal summary, not a build failure.
4. **`@namespace` decorator has no `terminalSummary` field** — what namespaces display when evaluated at the REPL is unspecified.
5. **`VisStack` and `VisScene` decorator examples absent from PLAN.md.**

##### Testing Strategy

1. **Completer unit tests: intention stated, no test specifications** (input `CompletionContext`, expected candidates, edge cases).
2. **E2E tests missing key scenarios:** type-aware variable completion; session persistence across restart; `env.dev(true)` plumbing in completions.
3. **Crash loop prevention: automated E2E for progressive fallback not planned.**
4. **No unit test for `@param` prepend-ordering invariant.**
5. **Build-time validation tests underspecified** — no fixture namespaces or failure scenarios defined.
6. **No cross-platform path handling tests.**

##### Clarity

1. **`repl-registry.ts` vs `repl-registry.generated.ts` naming collision risk.**
2. **"Companion interface" language persists in PLAN.md despite being ruled out.**
3. **`IdentifierCompleter` mixes two distinct behaviors** (registry lookup vs. session variable inference) — should be two sub-behaviors.
4. **Phase 5.1 blocking dependency table says "Phase 1" but should say "Phase 1 + sn PoC complete."**
5. **In-place migration decision embedded in a single line without prominence.**

##### Top Priority Issues (Reviewer 3)

1. `IdentifierCompleter` user-variable retrieval protocol undefined.
2. `help()` contract unspecified — Phase 5.3 is unimplementable without it.
3. `terminalSummary` format undefined — 11 porcelain type migrations blocked.
4. PLAN.md checklist contradicts "no transition period" decision.
5. `corpus` namespace absent from migration plan.
6. `experimentalDecorators` needed in all 3 tsconfig files, not just `tsconfig.json`.
7. Session source implicit-await mismatch — wrong type inference for common patterns.
8. TypeScript compiler bundling for new utility process not addressed.

---

#### Reviewer 4

##### Completeness

1. **IMPL.md § Known Limitations empty** despite Decision #21 calling out nested option types as a known limitation.
2. **`corpus` namespace absent from migration plan.**
3. **`transport` and `pat` method inventories absent** — no method-level table unlike every other namespace.
4. **`MfccFeature`, `SpectralFeature`, and similar multi-result porcelain types absent from Phase 5.2** — unclear if wrapped or raw.
5. **`env` namespace methods beyond `dev()` not listed.**
6. **`session_start_timestamp` in-place migration not formally justified against migration skill.**

##### Consistency

1. **"No transition period" vs. "parallelizable Phase 5 chunks" tension.** Both systems coexist during Phase 5 but this is never acknowledged. Phase 5.3 is the removal point, which means there IS a transition period inside Phase 5.
2. **`corpus` absent without explanation.**
3. **PLAN.md checklist "old system works alongside new" contradicts resolved decision.**
4. **Phase numbering: 5a/5b/5c/5d/5e vs 5.1/5.2/5.3/5.4/5.5 mismatch inside PLAN.md.**
5. **`InstrumentResult` type not in Phase 5.2 migration list** but TypedValueCompleter for `MidiSequence.play(instrument)` depends on it.

##### Feasibility

1. **50–100MB TS language service estimate is optimistic.** Real-world large project overhead can reach 300–500MB. 200MB threshold basis not stated.
2. **Crash-loop incremental restore ripple effect.** Skipping a `let x = ...` line causes downstream `x` references to produce cascading TS errors or wrong type inference.
3. **Syntactically invalid commands and `save-command` flow.** Spec doesn't clarify if parse-error commands reach `save-command` or are filtered.
4. **Generator scan path (`src/renderer/**/*.ts`) not explained.** Classes in `src/electron/` or `src/shared/` with decorators would be silently excluded.
5. **`experimentalDecorators` not verified across all 3 tsconfig files.**
6. **Language service startup sequence relative to database availability not defined.** Does `langservice:session-restore` require DB to be ready first?

##### REPL Interface Contract

1. **`Describable` interface never concretely defined.**
2. **`terminalSummary` format and rendering never specified.**
3. **`@namespace` decorator has no `terminalSummary`** — namespace REPL display behavior undefined.
4. **`env.dev()` return value and terminal summary not defined.**
5. **"Help() output unchanged in appearance" success criterion is not verifiable** without a baseline output spec or snapshot approach.

##### Testing Strategy

1. **5 E2E tests, all for completion triggering.** Missing: full type-inference round-trip; crash recovery behavior; `env.clear()` context reset; cross-platform paths; session persistence across restart.
2. **Build-time validation script has no automated tests.**
3. **Session derivation tests vague** — no `session_start_timestamp` NULL scenario, no project switch scenario.
4. **No unit test for `@param` prepend-ordering invariant.**
5. **No performance regression test or benchmark.**
6. **Unit test for "end-to-end flow from buffer text to candidates"** — mock boundary unspecified (real TS language service vs. mock?).

##### Clarity

1. **`repl-registry.ts` vs `repl-registry.generated.ts` relationship never shown together.**
2. **"Companion interface" terminology confusion (rejected approach uses similar vocabulary to accepted approach).**
3. **`Describable` interface requirements at class level never stated.**
4. **"Ghost text only" (no completion menu) not motivated beyond "Phase 4."** Permanently deferred or future spec?
5. **`save-command` handler language service access path — circular dependency risk with `HandlerDeps` not addressed.**

##### Top Priority Issues (Reviewer 4)

1. `corpus` missing from Phase 5.1 — will break silently when BOUNCE_GLOBALS is removed.
2. "No transition period" contradicts parallelizable Phase 5 structure — ambiguity about when old system is removed.
3. `help()` and `Describable` interface never concretely specified.
4. `terminalSummary` template syntax undefined — blocks all Phase 5.2 migrations.
5. Crash-loop incremental restore ripple effect (cascading errors from skipped declarations).
6. `InstrumentResult` missing from Phase 5.2 migration list.
7. No E2E tests for help system output or `env.dev()` visibility toggle.
8. `@param` prepend-ordering invariant has no unit test.

---

#### Reviewer 5

##### Completeness

1. **IMPL.md Status summary says "7 decisions recorded" but 21 decisions are listed** — stale summary not updated.
2. **`proj.load(name)` completer deferred with no tracking pointer** — no issue number, no ROADMAP reference.
3. **`transport` and `pat` namespace method inventories absent.**
4. **`corpus` absent from PLAN.md** — appears to be genuine omission, not deliberate deferral.
5. **`env` namespace completer table never listed.**
6. **`session_start_timestamp` in-place migration rationale insufficient** — doesn't reference `.github/skills/add-database-migration/SKILL.md` to justify the deviation.
7. **RESEARCH.md "application state taxonomy" next step not cross-referenced to Phase 5.5.**

##### Consistency

1. **Phase numbering mismatch inside PLAN.md** — "5a/5b/5c/5d/5e" in Changes Required vs "5.1–5.5" in Implementation Order.
2. **PLAN.md checklist "old system works alongside new" directly contradicts Decision 19.**
3. **`glob(pattern)` in `fs` has no completer** — inconsistent with otherwise-comprehensive approach; FilePathCompleter for the path prefix portion is feasible.
4. **`BOUNCE_GLOBALS` removal timing ambiguous.** Phase 1 says "Remove `BOUNCE_GLOBALS`" but only `sn` is migrated in Phase 1. The other 8 namespaces would break. Needs bridge strategy or explicit removal gating.
5. **ARCHITECTURE.md namespace list already inconsistent with PLAN.md** — spec should reconcile or flag it for Phase 5.5 update.

##### Feasibility

1. **`save-command` coupling not flagged as risk.** If `save-command` is called from non-REPL contexts (test harnesses, internal calls), the session accumulates junk or misses entries.
2. **Single-pass massive refactor branch/merge strategy not stated.** 20 parallel migrations landing simultaneously creates merge conflict risk.
3. **`import`/`require` statements in session source** — user typing `import fs from 'fs'` at the REPL would be appended to the virtual session file. Not addressed.
4. **Windows memory constraints understated** — desktop users on Windows have tighter expectations.

##### REPL Interface Contract

1. **`Describable` interface shape never defined** — whether `help()` is a method on the interface, synthesized from metadata, or a standalone function is unanswered.
2. **`terminalSummary` "template" implies substitution syntax** — never specified.
3. **Returned-object terminal summaries not enumerated for `VisScene`, `VisStack`, `AudioDevice`, `RecordingHandle`, `MidiRecordingHandle`, `MidiSequence`, `Pattern`.**
4. **`env.dev()` return value and terminal summary not specified.**

##### Testing Strategy

1. **E2E tests rely on Tab-key simulation in xterm.js** — existing `sendCommand` fixture types full strings; mid-input Tab simulation is architecturally different and never addressed.
2. **No unit tests for `scripts/generate-repl-artifacts.ts`** — a broken generator silently produces stale or malformed artifacts.
3. **No test for `langservice:health` push channel.**
4. **Crash loop prevention unit tests promised but not scenario-specified.**
5. **Help system regression: existing tests may rely on generated `porcelain-types.generated.ts`** (being deleted) — rewrite scope not identified.
6. **No cross-platform path handling for `FilePathCompleter`.**
7. **`TypedValueCompleter` union dispatch deduplication has no unit test.**

##### Clarity

1. **`Describable` / `help()` relationship never explained** — CLAUDE.md says `help()` is a method on each object; spec never reconciles this with the decorator system.
2. **"Parallelizable" + "must land together" are contradictory without stating the branch strategy.**
3. **"Companion interface" language in PLAN.md was ruled out in RESEARCH.md** — stale reference.
4. **`BOUNCE_GLOBALS` removal vs Phase 1 PoC vs Phase 5.1 completion** — three places with inconsistent statements about when globals disappear.

##### Top Priority Issues (Reviewer 5)

1. `corpus` missing from Phase 5.1 — will break silently when BOUNCE_GLOBALS removed.
2. `Describable` interface shape never defined.
3. PLAN.md checklist contradicts resolved "no transition period" decision.
4. `BOUNCE_GLOBALS` removal timing ambiguous relative to Phase 1 PoC.
5. `terminalSummary` template syntax undefined.
6. No unit tests for generator script.
7. `session_start_timestamp` migration rationale insufficient.
8. E2E Tab-key simulation in xterm.js not addressed.

---

### Consolidated Summary

**Overall:** The spec is substantively well-developed — architecture is sound, IPC channel inventory is thorough, completer taxonomy tables are detailed, and the decision log in IMPL.md makes the design history traceable. However, all 5 reviewers converged on a consistent set of gaps. The issues fall into four tiers by severity.

#### Tier 1 — Blocking / Will cause implementation failure

These must be resolved before any implementation phase begins.

| # | Issue | Unanimity |
|---|-------|-----------|
| T1-1 | **`corpus` namespace absent from Phase 5.1 migration table and all completer tables.** Present in ARCHITECTURE.md; silently breaks when BOUNCE_GLOBALS is removed. Explicitly include or explicitly exclude with rationale. | 5/5 |
| T1-2 | **PLAN.md § Plan Consistency Checklist states "old system works alongside new" — directly contradicts RESEARCH.md Resolved Question #10 and IMPL.md Decision #19 ("no transition period").** The checklist was not updated after the decision was made. | 5/5 |
| T1-3 | **`Describable` interface is referenced as the `help()` enforcement mechanism but never defined.** No property shape, no method signatures. Phase 5.3 is unimplementable without it. | 5/5 |
| T1-4 | **`terminalSummary` on `@replType` is described as a "template" but the template syntax, available substitution variables, rendering mechanism, and fallback for missing values are never specified.** All 11 Phase 5.2 porcelain type migrations are blocked. | 5/5 |
| T1-5 | **`PredictionResult` type shape never defined.** Referenced as the return element of `Iterator<PredictionResult>` but no fields (label, kind, insertText, documentation?) specified. Phase 3 completers and Phase 4 ghost text rendering both blocked. | 4/5 |
| T1-6 | **`IdentifierCompleter` user-variable retrieval has no IPC mechanism.** `CompletionContext` does not carry in-scope user variable names; no channel is defined to query them from the language service. Core value proposition (type-aware user variable completion) is unimplementable. | 3/5 |
| T1-7 | **`BOUNCE_GLOBALS` removal timing is ambiguous.** Phase 1 says "Remove `BOUNCE_GLOBALS`" but only `sn` is migrated as PoC in Phase 1. Removing globals before Phase 5.1 completes would break 8 namespaces. A bridge strategy or explicit gating statement is required. | 2/5 |
| T1-8 | **`InstrumentResult` is absent from Phase 5.2 porcelain type migration list** but `TypedValueCompleter` for `MidiSequence.play(instrument)` depends on it. | 1/5 |

#### Tier 2 — Significant gaps that will cause design rework mid-implementation

| # | Issue | Unanimity |
|---|-------|-----------|
| T2-1 | **Phase numbering mismatch inside PLAN.md.** "5a/5b/5c/5d/5e" in Changes Required vs "5.1/5.2/5.3/5.4/5.5" in Implementation Order; IMPL.md uses 5.1–5.5. Confusing for anyone cross-referencing. | 4/5 |
| T2-2 | **`experimentalDecorators` tsconfig update scoped only to `tsconfig.json`.** PLAN.md § Configuration/Build Changes only mentions `tsconfig.json`. Namespace files live in `src/renderer/` (compiled by `tsconfig.renderer.json`). All 3 tsconfig files need the flag. | 3/5 |
| T2-3 | **`completion:request` IPC channel not added to `src/shared/ipc-contract.ts`.** All channels in Bounce are typed there. A concrete integration gap. | 1/5 |
| T2-4 | **Session source implicit-await mismatch.** If `command_history` stores raw user input (`sn.read("kick.wav")` without await), the language service infers `Promise<Sample>` not `Sample`. The spec must state whether raw or auto-awaited source is stored and whether the replay path rewrites expressions. | 2/5 |
| T2-5 | **`session_start_timestamp` migration bypasses the project's migration skill** (`.github/skills/add-database-migration/SKILL.md`) without formal justification. Should either use a versioned migration or prominently document the deliberate deviation with stronger rationale. | 4/5 |
| T2-6 | **User-facing `help()` invocation mechanism is unspecified.** Does the user still type `sn.help()`? Does a global `help(sn)` now exist? The CLAUDE.md requirement ("every namespace has a `help()` method") must be reconciled with the new decorator system. | 4/5 |
| T2-7 | **TypeScript compiler bundling for the new language service utility process not addressed.** The `typescript` npm package must be available at runtime; no esbuild/Webpack entry point config for the new process is specified. | 2/5 |

#### Tier 3 — Testing gaps that will leave critical behaviors unverified

| # | Issue | Unanimity |
|---|-------|-----------|
| T3-1 | **No E2E test for the core value proposition: user-variable type-aware completion** (assign variable → type `.` → verify type-appropriate methods). | 4/5 |
| T3-2 | **No unit tests for `scripts/generate-repl-artifacts.ts`** (generator). A broken generator silently produces stale `.d.ts` or malformed registry. | 2/5 |
| T3-3 | **Crash loop progressive fallback only manually tested.** The 4-level recovery sequence should have automated tests; the crash counting threshold logic is exactly the kind of thing that regresses silently. | 3/5 |
| T3-4 | **No unit test for `@param` prepend-ordering invariant.** A single mis-ordered `@param` silently corrupts all parameter metadata for multi-param methods. | 3/5 |
| T3-5 | **No regression E2E baseline for existing tab completion.** All 5 Playwright tests cover new behaviors; none guard existing completion from regressing during Phase 5. | 2/5 |
| T3-6 | **E2E Tab-key simulation in xterm.js not addressed.** Existing `sendCommand` fixture types full commands; mid-input Tab is architecturally different and requires explicit test infrastructure. | 1/5 |
| T3-7 | **No cross-platform test strategy.** `FilePathCompleter`, session source storage, and SQLite `session_start_timestamp` all have Windows/Linux edge cases. CLAUDE.md mandates cross-platform support. | 3/5 |

#### Tier 4 — Clarity and consistency issues (low implementation risk but cause confusion)

- `save-command` as single choke point is an unverified assumption — should be explicitly verified or flagged as a risk.
- Incremental restore ripple effect: skipping a `let x = ...` declaration causes cascading errors on downstream `x` references.
- "Parallelizable chunks" vs "must land together" — branch strategy should be stated explicitly.
- `@namespace` decorator has no `terminalSummary` — namespace REPL display behavior undefined.
- `corpus` namespace discrepancy with ARCHITECTURE.md means ARCHITECTURE.md needs updating regardless.
- `env` namespace completer table missing (minor, but inconsistent).
- `transport`/`pat` method tables should enumerate any options-taking methods at minimum.
- IMPL.md "7 decisions recorded" summary is stale (21 listed).
- IMPL.md § Known Limitations is empty despite Decision #21 calling out nested option types.
- Ghost text stale-response visual state during debounce window unaddressed.
- `import`/`require` statements in session source not addressed.

### Changes Applied

| Document | Change | Rationale |
|----------|--------|-----------|
| PLAN.md | Added `Describable` interface definition with `help()` method, decorator injection description, and user-facing invocation examples | T1-3: interface was referenced but never defined |
| PLAN.md | Added `terminalSummary` template syntax spec: `{{propertyName}}` tokens, `renderTerminalSummary()` renderer, fallback to `<TypeName>: <summary>` | T1-4: format was completely unspecified |
| PLAN.md | Added `PredictionResult` type (label, insertText?, kind, detail?) and `Completer` interface (`predict(context): PredictionResult[]`) to § Decorator API | T1-5: types were referenced but never defined |
| RESEARCH.md | Extended `CompletionContext` `identifier` position variant with `sessionVariables: Array<{ name, typeName }>` field, populated by the language service | T1-6: no IPC mechanism existed for IdentifierCompleter to retrieve user variable names |
| PLAN.md | Phase 1 Implementation Order: replaced "Remove BOUNCE_GLOBALS" with explicit note that removal is gated on Phase 5.1 completion | T1-7: removal was listed in Phase 1 but only `sn` migrates there |
| PLAN.md | Phase 5.1 table: added chunk 5.1.10 for `corpus` namespace (method inventory required first) | T1-1: corpus was in ARCHITECTURE.md but absent from migration plan |
| PLAN.md | Phase 5.2 table: added chunk 5.2.12 for `InstrumentResult` | T1-8: required by TypedValueCompleter for `MidiSequence.play(instrument)` |
| PLAN.md | Completer tables: added `corpus` namespace section with method inventory placeholder | T1-1: completer table was also missing corpus |
| PLAN.md | Changes Required: renamed Phase 5a/5b/5c/5d/5e → Phase 5.1/5.2/5.3/5.4/5.5 | T2-1 (consistency): naming inconsistency within PLAN.md |
| PLAN.md | Plan Consistency Checklist: corrected backwards compat item to accurately describe "no transition period" with Phase 5.3 as the removal gate | T1-2: checklist directly contradicted the resolved design decision |
| PLAN.md | Plan Consistency Checklist: corrected "companion interfaces" reference to "build-time validation script" | T1-2 (related): stale companion interface language persisted |
| PLAN.md | REPL Interface Contract: removed "via companion interfaces" from enforcement description | T1-3: companion interfaces ruled out in RESEARCH.md |
| PLAN.md | Build enforcement § removed "companion interface includes all public methods" sentence | T1-3: same stale reference |
| PLAN.md | Work chunk summary: updated 9→10 chunks in 5.1, 11→12 in 5.2, total 26→28 | Follows from T1-1 and T1-8 additions |

---

## Round 1 Post-Review Updates — 2026-04-04

Additional changes applied based on user decisions on T2/T3/T4 issues.

| Document | Change | Rationale |
|----------|--------|-----------|
| PLAN.md | § Configuration/Build Changes: expanded tsconfig entry to all 3 files; added note to move `typescript` from devDependencies to dependencies | T2-2: all 3 tsconfigs need `experimentalDecorators`; T2-7: typescript must be a runtime dep for the utility process |
| PLAN.md | § Phase 3 Changes Required: added `src/shared/ipc-contract.ts` to modified files with payload/response type spec for `completion:request` | T2-3: all IPC channels must be typed in the contract |
| RESEARCH.md | § Session File Accumulation: added explicit clarification that raw user input is stored; documented `Promise<Sample>` vs `Sample` inference as a known accepted limitation | T2-4: decided raw source is stored as-is |
| PLAN.md | § Unit Tests: added decorator ordering invariant test; expanded per-completer test cases with specific scenarios; added session derivation edge cases; added full generator script test suite | T3-2, T3-4 |
| PLAN.md | § E2E Tests: added `typeAndTab()` helper spec with implementation notes; added type-aware variable completion E2E test; added regression baseline test | T3-1, T3-5, T3-6 |
| PLAN.md | § Crash loop prevention: replaced "tested manually" with automated unit tests covering threshold, incremental restore, escalation, clean-slate fallback, and cascading-error handling | T3-3 |

---

## Round 2 — 2026-04-04

**Reviewers:** 5 sub-agents

### Reviewer Findings

#### Round 2 Reviewer 1

##### Completeness
1. **`corpus` method inventory explicitly deferred (5.1.10)** — placeholder table contributes nothing; no gating mechanism prevents 5.1.10 being started prematurely.
2. **`InstrumentResult` (5.2.12) has no completer table** — unlike every other Phase 5.2 type.
3. **`midi`, `mx`, `transport`, `pat` namespace completer tables absent** — one-sentence blanket statement.
4. **`BOUNCE_DEV=1` propagation mechanism unspecified** — where read, how propagated to visibility filter, precedence over `env.dev()`.

##### Consistency
1. **Phase 5.1 heading says "9 independent chunks", Phase 5.2 says "11"** — tables have 10 and 12. Both headings stale.
2. **IMPL.md Decision 5 says "26 chunks / 9 namespace / 11 type"** — PLAN.md says 28/10/12. Three-way contradiction.

##### Feasibility
1. **`typescript` ASAR packaging** — TypeScript resolves `lib/*.d.ts` via filesystem; may fail inside ASAR. `asarUnpack` may be needed; packaged-build smoke test required.
2. **Utility process entry point path resolution** — packaged vs. development mode not addressed; spec should reference audio engine pattern.
3. **`langservice:session-restore` from `renderer/app.ts`** — renderer has no MessagePort to language service. Flow must go through main process. Data flow not traced; no IPC channel named.
4. **Ghost text rendering mechanism completely unspecified** — no commitment to xterm.js decoration API, overlay, or canvas. Blocks Phase 4 and all E2E tests.

##### REPL Interface Contract
1. **`terminalSummary` enforcement gap** — "spec violation" with no build warning.
2. **`help()` output format undefined** — "unchanged in appearance" needs a concrete example.
3. **`env.dev()` return type/display unspecified.**
4. **`vis.stack()` → `VisStack` chain not called out as a generator requirement.**

##### Testing Strategy
1. **No test for `BOUNCE_DEV=1`.**
2. **No E2E for cross-session type inference restore.**
3. **No test for `save-command` → `langservice:session-append` integration.**
4. **Regression baseline doesn't cover `mx`, `transport`, `pat`, `midi`.**
5. **`typeAndTab` ghost text selector deferred — E2E tests are incomplete stubs.**

##### Top Priority Issues (R2 Reviewer 1)
1. Ghost text rendering mechanism unspecified — blocks Phase 4 and E2E tests.
2. Session restore architectural error — renderer can't send `langservice:session-restore`.
3. `InstrumentResult` no completer table.
4. Phase 5.1/5.2 heading counts stale; IMPL.md counts stale.
5. `BOUNCE_DEV=1` propagation unspecified.
6. No E2E for cross-session type inference restore.
7. Validator vs. generator responsibility overlap.

---

#### Round 2 Reviewer 2

##### Completeness
1. **`corpus` inventory deferred** — hard blocker for 5.1.10 with no owner.
2. **`midi`/`mx`/`transport`/`pat` completer tables absent.**
3. **`InstrumentResult` no method table.**
4. **Ghost text DOM selector deferred** — should be explicit Phase 4 prerequisite.
5. **`terminalSummary` templates undefined for all types except `Sample`.**

##### Consistency
1. **IMPL.md chunk counts stale** (26/9/11 vs 28/10/12).
2. **ARCHITECTURE.md namespace list missing `transport`/`pat`/`midi`** — Phase 5.5 must address; spec should call it out.

##### Feasibility
1. **`typescript` ASAR packaging** — `lib/` files must be accessible; `asarUnpack` may be needed.
2. **Session source memory growth edge case** — restart triggered by memory threshold re-replays full session, potentially immediately re-exceeding threshold.

##### REPL Interface Contract
1. **`help()` injection conflict with inherited `HelpableResult.help()`** — silent overwrite risk.
2. **`terminalSummary` templates for 11 types undefined.**
3. **`env.dev()` return value/display unspecified.**
4. **Global-scope functions (`help()`, `clear()`) not addressed by decorator system.**

##### Testing Strategy
1. **No E2E for `env.dev(true)` effect on `help()` output.**
2. **No E2E for first-launch with no prior history.**
3. **No integration test for `langservice:session-append` path.**
4. **Regression baseline CI enforcement not described.**
5. **No negative-case `typeAndTab` test.**

##### Top Priority Issues (R2 Reviewer 2)
1. `terminalSummary` templates for 11 types.
2. `corpus` no owner/timeline.
3. `midi`/`mx`/`transport`/`pat` tables absent.
4. Validator vs. generator overlap.
5. IMPL.md counts stale.
6. `help()` injection conflict with inherited `help()`.
7. `typescript` ASAR packaging.
8. No CI enforcement for regression baseline.

---

#### Round 2 Reviewer 3

##### Completeness
1. **`corpus` deferred.**
2. **`midi`/`mx`/`transport`/`pat` tables absent** — OptionsCompleter count of ~18 unverifiable.
3. **`InstrumentResult` no method table.**
4. **`terminalSummary` for 11/12 types undefined.**

##### Consistency
1. **ARCHITECTURE.md three-process model** — intentional deferral; note it's temporary.
2. **`transport`/`pat` in CLAUDE.md and Phase 5.1 but absent from ARCHITECTURE.md namespace table.**
3. **IMPL.md counts stale.**
4. **`PredictionResult[]` in PLAN.md vs `Iterator<PredictionResult>` in RESEARCH.md** — stale reference.

##### Feasibility
1. **`typescript` ASAR risk** — ~30MB; `asarUnpack` may be needed.
2. **`.d.ts` generator "one level deep" for union string literals undefined** — does `"onset" | "amplitude"` get resolved?
3. **`langservice:session-append` before `langservice:ready`** — dropped or queued? Dropped → incomplete session on slow machines.
4. **`callArgument` vs `stringLiteral` mutual exclusivity unspecified** — critical for language service implementer.

##### REPL Interface Contract
1. **`terminalSummary` for 11/12 types undefined.**
2. **`help()` output format undefined** — needs concrete example.
3. **`env.dev()` signature undefined** — should be `dev(toggle?: boolean): boolean`.
4. **`help()` return type should be stated explicitly as `void`.**

##### Testing Strategy
1. **No E2E for `terminalSummary` rendering.**
2. **No test for `langservice:session-append` / `save-command` integration.**
3. **Regression baseline must be committed before Phase 5.1, not retroactively.**
4. **No E2E for identifier completion of variable names** (e.g., `sa` + Tab → `samp`).

##### Top Priority Issues (R2 Reviewer 3)
1. `terminalSummary` for 11/12 types.
2. `InstrumentResult` method table missing.
3. `corpus` inventory.
4. `midi`/`mx`/`transport`/`pat` tables.
5. `callArgument` vs `stringLiteral` mutual exclusivity.
6. `typescript` ASAR packaging.
7. `PredictionResult[]` vs `Iterator<PredictionResult>` stale.
8. Phase 5.1/5.2 coexistence mechanism.

---

#### Round 2 Reviewer 4

##### Completeness
1. **`midi`/`mx`/`transport`/`pat` absent** — no formal deferral; implies "no interesting completers" which may be wrong.
2. **`InstrumentResult` absent from completer tables and `terminalSummary` undefined.**
3. **`session_start_timestamp = NULL` behavior** — named test scenario; expected behavior not defined.

##### Consistency
1. **IMPL.md Decision 5 stale (26/9/11 vs 28/10/12).**
2. **CLAUDE.md says "three-process model"** — Phase 5.5 must update CLAUDE.md, not mentioned in its scope.
3. **`transport`/`pat`/`midi` in PLAN.md Phase 5.1 but absent from ARCHITECTURE.md namespace table.**

##### Feasibility
1. **`typescript` packaging — esbuild/webpack tree-shaking risk.**
2. **`history-handlers.ts` needs language service manager reference** — `HandlerDeps` or singleton; not addressed.
3. **Session restore from `renderer/app.ts`** — architectural error; must be main-process-initiated.
4. **Request ID stale-response discard with `ipcRenderer.invoke`** — one-to-one; stale discard scenario needs explicit trace.

##### REPL Interface Contract
1. **`help()` injection may overwrite inherited `HelpableResult.help()`.**
2. **`terminalSummary` non-enforcement** — at minimum, validator should warn.
3. **Global-scope functions (`help()`, `clear()`) not addressed** — not `@namespace` class methods; decorator system doesn't apply.
4. **`env.dev()` return type/display unspecified.**

##### Testing Strategy
1. **No E2E for `env.dev()` persistence across restart.**
2. **No test for large command history session restore.**
3. **Generator test doesn't cover union return types.**
4. **Regression baseline not assigned to a phase.**
5. **No test for concurrent requests (trigger char + debounced in-flight).**

##### Top Priority Issues (R2 Reviewer 4)
1. Phase 5.4 session restore architectural error.
2. `midi`/`mx`/`transport`/`pat` tables absent.
3. Global-scope functions not addressed by decorator migration.
4. `InstrumentResult` undocumented.
5. Validator vs. generator overlap.
6. IMPL.md counts stale.
7. `@replType` may conflict with inherited `HelpableResult.help()`.
8. Regression baseline not assigned to a phase.

---

#### Round 2 Reviewer 5

##### Completeness
1. **`midi`/`mx`/`transport`/`pat` absent** — 4 of 10 Phase 5.1 chunks have no completer guidance.
2. **`InstrumentResult` absent.**
3. **`session_start_timestamp = NULL` behavior undefined.**
4. **`corpus` deferred.**

##### Consistency
1. **IMPL.md Decision 5 stale.**
2. **`transport`/`pat`/`midi` in Phase 5.1 but absent from ARCHITECTURE.md namespace table.**

##### Feasibility
1. **`typescript` in `dependencies`** — ~10–20MB; no tradeoff discussion.
2. **`langservice:session-append` and `HandlerDeps` wiring unspecified.**
3. **Virtual session file no size cap independent of memory pressure** — parse latency could degrade before memory threshold.
4. **`env.clear()` silently wipes type context** — no user notification even in porcelain mode.

##### REPL Interface Contract
1. **`help()` output format undefined** — "unchanged" needs a concrete example.
2. **`terminalSummary` "spec violation" not actionable** — add generator warning or define fallback.
3. **Union dispatch E2E missing** — having both `SliceFeature` and `NmfFeature` in scope.
4. **`Describable.help()` is `void`** — confirm renderer handles void correctly.

##### Testing Strategy
1. **No test for `langservice:ready` pre-ready drop behavior.**
2. **`session_start_timestamp = NULL` test scenario but behavior undefined.**
3. **Generator parameter-order test missing** — AST extraction could produce wrong order independently.
4. **E2E plumbing toggle test uses `dumpBuffers`** — hypothetical method; must reference a real plumbing method.
5. **`FilePathCompleter` edge cases** — non-existent path should return empty, not throw.

##### Top Priority Issues (R2 Reviewer 5)
1. `midi`/`mx`/`transport`/`pat` tables absent — 4 chunks with no spec.
2. `InstrumentResult` no method table.
3. `session_start_timestamp = NULL` behavior undefined.
4. IMPL.md stale counts.
5. `corpus` inventory.
6. `terminalSummary` non-enforcement not actionable.
7. No test for `langservice:ready` pre-ready drop.
8. `langservice:session-append` / `HandlerDeps` wiring unspecified.

---

### Consolidated Summary

**Overall:** The spec has improved substantially since Round 1. All T1 blockers are resolved and the testing strategy is strong. The remaining issues are smaller in scope but still concrete enough to block specific implementation chunks.

#### Tier 1 — Blocking

| # | Issue | Votes |
|---|-------|-------|
| R2-T1-1 | **`langservice:session-restore` initiated from `renderer/app.ts` is architecturally wrong.** Renderer has no MessagePort to the language service. Session restore must be main-process-initiated on startup. Phase 5.4 description must be corrected. | 3/5 |
| R2-T1-2 | **`midi`, `mx`, `transport`, `pat` namespace method tables absent.** Chunks 5.1.5–5.1.8 have no per-method completer guidance. "No special completion" may be wrong for some methods. | 5/5 |
| R2-T1-3 | **`InstrumentResult` has no method table or completer assignments.** Listed in Phase 5.2 and referenced by `MidiSequence.play`, but its own methods are completely unspecified. | 5/5 |
| R2-T1-4 | **`session_start_timestamp = NULL` behavior undefined.** Named as a test scenario but expected behavior not defined — replay all history or start fresh? | 3/5 |

#### Tier 2 — Significant gaps

| # | Issue | Votes |
|---|-------|-------|
| R2-T2-1 | **`corpus` inventory still a placeholder.** 5.1.10 cannot start without it. | 5/5 |
| R2-T2-2 | **`terminalSummary` templates undefined for 11/12 Phase 5.2 types.** Phase 5.2 implementers have no guidance for the terminal display contract. | 4/5 |
| R2-T2-3 | **Phase 5.1 heading says "9 chunks", Phase 5.2 says "11".** Tables have 10/12. IMPL.md Decision 5 says 26/9/11. Three contradictory sources. | 5/5 |
| R2-T2-4 | **Validator vs. generator responsibility overlap unresolved.** Generator already fails on missing `@describe`; validator's distinct role never defined. | 4/5 |
| R2-T2-5 | **`typescript` ASAR packaging risk.** TypeScript's `lib/*.d.ts` access via filesystem may fail inside ASAR; `asarUnpack` may be needed; packaged-build smoke test required. | 5/5 |
| R2-T2-6 | **Ghost text rendering mechanism unspecified.** No commitment to xterm.js decoration API, custom overlay, or canvas. E2E tests are incomplete stubs until this is decided. | 3/5 |
| R2-T2-7 | **`help()` injection may silently overwrite inherited `HelpableResult.help()`.** Spec says "do not implement manually" but doesn't address inherited `help()` from base class. | 2/5 |
| R2-T2-8 | **Global-scope functions (`help()`, `clear()`) not addressed.** Decorator model doesn't apply to plain REPL-scope functions. Unspecified after `BOUNCE_GLOBALS` removal. | 2/5 |
| R2-T2-9 | **Phase 5.1/5.2 coexistence mechanism unclear.** Does `BOUNCE_GLOBALS` stay fully populated while registry grows, or shrink as namespaces are migrated? | 2/5 |
| R2-T2-10 | **`langservice:session-append` → `HandlerDeps` wiring unspecified.** Language service manager must be injectable into `history-handlers.ts`; spec doesn't address how. | 2/5 |

#### Tier 3 — Testing gaps

| # | Issue | Votes |
|---|-------|-------|
| R2-T3-1 | **No E2E for cross-session type inference restore** (close app, reopen, verify prior types available). | 2/5 |
| R2-T3-2 | **Regression baseline not assigned to a phase.** Should be written at end of Phase 4; currently unassigned — risk it's added after Phase 5.1 begins. | 3/5 |
| R2-T3-3 | **No test for `langservice:ready` pre-ready drop behavior.** Load-bearing UX contract with no coverage. | 2/5 |
| R2-T3-4 | **`PredictionResult[]` in PLAN.md vs `Iterator<PredictionResult>` in RESEARCH.md.** RESEARCH.md stale. | 1/5 |
| R2-T3-5 | **Generator parameter-order test missing.** Runtime decorator test exists but generator AST extraction could independently produce wrong order. | 1/5 |

#### Tier 4 — Clarity / minor

- `BOUNCE_DEV=1` propagation mechanism unspecified
- `callArgument` vs `stringLiteral` mutual exclusivity never stated — critical for language service implementer
- `env.dev()` return type/display unspecified — should be `dev(toggle?: boolean): boolean`
- Phase 5 "atomically" in Risks section is misleading — "feature branch" is clearer
- `langservice:session-append` granularity — single REPL buffer or line-by-line? Matters for incremental restore
- No E2E for identifier-level variable name completion (`sa` + Tab → `samp`)
- CLAUDE.md says "three-process model" — Phase 5.5 scope should include updating it
- `env.clear()` silently wipes type context with no user notification

### Changes Applied

| Document | Change | Rationale |
|----------|--------|-----------|
| PLAN.md | Filled in corpus completer table (`build`, `query`, `resynthesize`); removed TBD placeholder and inventory-required note | R2-T1-2 / method inventory completed |
| PLAN.md | Replaced blanket `midi, mx, transport, pat` note with per-namespace method tables; documented `ChannelControl` methods inline under mx | R2-T1-2: all namespaces must have explicit completer tables |
| PLAN.md | Added `InstrumentResult` completer table entry (data object, no REPL-callable methods, just properties) | R2-T1-3 |
| PLAN.md | Phase 5.4 modified files: removed `src/renderer/app.ts` session-restore entry; added `src/electron/main.ts` (initiates `langservice:session-restore` after `langservice:ready`) and `src/electron/ipc/` (handles `env.clear`/project-switch by updating `session_start_timestamp` and sending `langservice:session-reset`) | R2-T1-1: renderer cannot initiate MessagePort messages to language service |
| PLAN.md | `session_start_timestamp` column spec updated to NOT NULL DEFAULT 0 throughout (database.ts entry, unit test scenarios) | R2-T1-4: non-nullable, user decision |
| PLAN.md | Phase 5.1 heading: "9 independent chunks" → "10 independent chunks"; chunk 5.1.10 TBD note removed | Corpus inventory complete; count was stale |
| PLAN.md | Phase 5.2 heading: "11 independent chunks" → "12 independent chunks" | Count was stale |
| PLAN.md | TypedValueCompleter usage summary updated to ~11 call sites with correct method references | midi.play was wrong; ChannelControl.attach and VisStack.panel added |
| RESEARCH.md | `session_start_timestamp` description updated to NOT NULL DEFAULT 0; added explanation of first-launch no-op behavior | R2-T1-4 |
| RESEARCH.md | Startup steps 2–3 now explicitly identify main process as the owner of session restore; added parenthetical explaining renderer cannot initiate MessagePort | R2-T1-1 |
| RESEARCH.md | Resolved Questions #6: added NOT NULL DEFAULT 0 and first-launch no-op rationale | R2-T1-4 |
| IMPL.md | Decision 5: 26/9/11 → 28/10/12 | Counts were stale |
| IMPL.md | Decision 15: added NOT NULL DEFAULT 0, main-process ownership of restore, IPC handler role for reset | R2-T1-1, R2-T1-4 |
