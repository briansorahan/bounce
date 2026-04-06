# Implementation: REPL Intelligence — Unified Registration, Completion, and Help

**Spec:** specs/repl-intelligence
**Created:** 2026-04-04
**Status:** In Progress

## Context

Unified architecture for REPL registration, tab completion, and help. Decorator-based registration, TypeScript Language Service utility process for AST/type resolution, REPL Intelligence Layer in main process dispatching to 6 completer types. See PLAN.md for full details and completer taxonomy.

## Implementation Log

### 2026-04-04 - Spec created

Research and planning complete. Five implementation phases defined.

## Decisions Made

### 2026-04-04 - Spec review decisions

1. **Decorator approach**: Use `experimentalDecorators` on TypeScript 5.9.3. Four decorators: `@namespace`, `@replType` (class-level), `@describe`, `@param` (method-level). All metadata is stored explicitly in decorator arguments — no reliance on `emitDecoratorMetadata` or `reflect-metadata`. Full API documented in PLAN.md § Decorator API.

2. **`.d.ts` generation**: Compiler-generated from actual TypeScript source via TS compiler API at build time. Decorator-decorated classes (`@namespace`, `@replType`) are the signal for extraction — only public API shape is emitted, not implementation details.

3. **Trigger characters**: Immediate fire on `.`, `(`, `{` only. Removed `"` and `'` — firing immediately on quote open provides no useful candidates (empty prefix). Quotes debounced normally at 150ms.

4. **`success` column dropped**: All commands replayed into the language service regardless of runtime success/failure. The language service only parses TypeScript for type inference — it doesn't execute code. A command that fails at runtime (e.g. file not found) is still valid TypeScript for type resolution.

5. **Phase 5 partitioned**: 28 discrete work chunks. Phase 5.1 (10 namespace migrations) and Phase 5.2 (12 porcelain type migrations) are fully parallelizable. Phase 5.3 (help system) blocks on 5.1+5.2. Phase 5.4 (scope persistence) blocks on Phase 2. Phase 5.5 (docs) blocks on all.

6. **String literal completer dispatch**: CompletionContext `stringLiteral` position kind alone is insufficient for dispatch. Intelligence layer cross-references `callee` + `paramIndex` against `@param` decorator `kind` field to determine which specialized completer to invoke.

7. **Application state taxonomy**: Broader design needed in ARCHITECTURE.md to precisely define what constitutes application state, how each piece is persisted/restored, and where "session" fits. Addressed in Phase 5.5.

8. **BOUNCE_GLOBALS removed**: All namespaces migrated to decorator-based registration. `BOUNCE_GLOBALS` set removed entirely from `repl-evaluator.ts`. Globals derived from registry.

9. **Two-level initialization**: The utility **process** spawns eagerly at app launch. `ts.createLanguageService()` inside the process initializes **lazily** on the first `langservice:parse` request. `langservice:ready` is sent once the TS language service is ready; main can poll `langservice:status` before that. First completion request after launch may have higher latency (~200–500ms) due to cold start.

10. **User-defined function inference**: Language service infers both parameter and return types for user-defined functions, enabling type-aware completion for user code.

11. **LSP considered, not adopted**: MessagePort protocol chosen over LSP. LSP adds ceremony (lifecycle, capability negotiation) that doesn't benefit tightly-integrated REPL. If VS Code integration needed later, can wrap with LSP adapter.

12. **`langservice:session-append` triggered from `save-command`**: The main-process `save-command` IPC handler (already the single choke point for all evaluated commands) forwards each command to the language service. No new renderer→main channel is needed. This keeps the renderer unaware of the language service.

13. **Ghost text only**: Phase 4 renderer integration renders ghost text only. No completion menu at this stage.

14. **TypedValueCompleter union dispatch**: When `@param` `kind: "typed"` resolves to a union type (e.g. `SliceFeature | NmfFeature`), dispatch once per union member and merge results, deduplicating by variable name.

15. **`session_start_timestamp` DB migration**: Added to the existing migration in place (not a new version) as NOT NULL DEFAULT 0 (Unix epoch). Users drop and recreate their database. Only user is the author. Session restore is initiated by the main process (not the renderer) after `langservice:ready` — main queries SQLite and sends commands via MessagePort. `env.clear()` and project-switch IPC handlers update `session_start_timestamp` and send `langservice:session-reset`.

16. **Generator script**: `scripts/generate-repl-artifacts.ts` scans `src/renderer/**/*.ts` for `@namespace`/`@replType` decorated classes. Emits method signatures from AST (not decorator args). Option types resolved one level deep. Build fails on unresolvable types or missing `@describe`. See PLAN.md § Generated files for full details.

17. **vis namespace API**: `vis.waveform(sample)` is the correct API (not `vis.scene()`). `VisStackResult` is built via chaining `.waveform()` and also has `.addScene()`. All completer tables updated accordingly.

18. **`ancestors` in CompletionContext**: Reserved for future use (parameter hints, diagnostics). No completer in this spec uses it.

19. **No transition period**: All namespaces and result types migrated in one pass. The Phase 5.1/5.2 work chunks are parallelizable but must all land together before the old `BOUNCE_GLOBALS`, `withHelp`, JSDoc codegen, and `tab-completion.ts` are removed.

20. **Visibility defaults to `false` (porcelain-only) before Phase 5c**: The intelligence layer hardcodes `dev = false` until `env.dev()` is implemented. Plumbing items are never surfaced in completions or help during earlier phases.

21. **Nested option types are a known limitation**: The `.d.ts` generator resolves option types one level deep only. Complex nested option type properties will not appear as `OptionsCompleter` candidates. Acceptable for the current API surface.

## Deviations from Plan

<!-- Where implementation diverged from plan and why -->

## Flaws Discovered in Previous Phases

<!-- Any issues found in RESEARCH.md or PLAN.md during implementation -->

## Issues & TODOs

<!-- Known problems, edge cases, future work -->

## Testing Results

<!-- Test execution results -->

## Status Updates

### Last Status: 2026-04-04

**What's Done:**
- Research and planning complete
- Completer taxonomy mapped for all namespaces and porcelain types
- Architecture decided: Language Service utility process + Intelligence Layer in main
- All open questions resolved (decorator API, .d.ts generation, TS version)
- Spec review complete — 7 decisions recorded

**What's Left:**
- Phase 1: Decorator infrastructure and registration system
- Phase 2: Language Service utility process
- Phase 3: Completers and intelligence layer
- Phase 4: Renderer integration
- Phase 5.1: Namespace migrations (9 chunks, parallelizable)
- Phase 5.2: Porcelain type migrations (11 chunks, parallelizable)
- Phase 5.3: Help system transition
- Phase 5.4: Scope persistence and session restore
- Phase 5.5: Documentation

**Next Steps:**
- Phase 1: Decorator infrastructure and registration system
- Proof of concept with `sn` namespace

**Blockers/Notes:**
- None

---

## Final Status

**Completion Date:**

**Summary:**

**Verification:**
- [ ] Linting passed (`npm run lint`)
- [ ] TypeScript builds (`npm run build:electron`)
- [ ] `./build.sh` passes (full Dockerized Playwright suite — mandatory for every spec)
- [ ] Manual testing complete
- [ ] REPL help() coverage verified by unit and/or Playwright tests
- [ ] REPL returned-object terminal summaries verified by unit and/or Playwright tests
- [ ] ARCHITECTURE.md updated with new process model

**Known Limitations:**

**Future Improvements:**
