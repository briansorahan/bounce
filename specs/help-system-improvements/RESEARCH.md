# Research: Help System Improvements

**Spec:** specs/help-system-improvements  
**Created:** 2026-03-08  
**Status:** Complete

## Problem Statement

The current `help()` function outputs a flat, unsectioned list of all 21 commands with one-line descriptions. There is no way to get detailed usage information for a specific command. The `corpus` object (with `build`, `query`, and `resynthesize` methods) is completely undocumented in the help output. The composability story — one of Bounce's most powerful features — is mentioned only as a brief footer note.

## Background

Bounce's REPL exposes functions across three conceptual domains: audio analysis (FluCoMa algorithms), resynthesis/playback, and utility/visualization. Grouping them helps users build a mental model of the tool and find what they need. Additionally, as the function count grows, a flat list becomes increasingly unwieldy.

The target audience (sound designers, researchers, live performers) are likely to explore the REPL interactively, so discoverability and self-documentation are important.

## Design Discussion

This section captures the design decisions reached through brainstorming.

### help() organization

Organizing `help()` output into three sections was chosen:

1. **Analysis** — `analyze`, `analyzeNmf`, `analyzeMFCC`
2. **Resynthesis** — `slice`, `sep`, `nx`, `play`, `stop`, `playSlice`, `playComponent`, `granularize`, `corpus`
3. **Utilities** — `display`, `list`, `visualizeNmf`, `visualizeNx`, `onsetSlice`, `nmf`, `debug`, `clearDebug`, `help`, `clear`

### Per-command detail: fn.help() pattern

Several approaches were considered for accessing per-command documentation:

- `help("granularize")` — string argument; less discoverable
- `help(granularize)` — function argument; unusual pattern
- `granularize.help()` — method on the function object itself; **chosen**

`granularize.help()` was selected because:
- JavaScript functions are objects; attaching a `.help` property is idiomatic
- It is more discoverable — the help lives *on* the thing you're inspecting
- `corpus` is already an object with methods, so `corpus.help()` fits naturally without special-casing
- It is consistent across all commands including `corpus`

### Composability hint in help()

The main `help()` output should include a short "workflow hint" section showing how commands compose. The existing footer line (`sep(play("path")), slice(analyze()), etc.`) should be expanded into illustrative examples:

```
slice(analyze()) → playSlice(0)           # onset slicing workflow
sep(play("path")) → playComponent(0)      # NMF separation workflow
corpus.build(slice(analyze())) → corpus.query(0, 5)  # corpus workflow
```

### .help() mention in help()

Since every top-level command will have a `.help()` method, `help()` should mention this prominently in its footer so users know to look there for details.

## Current Implementation

- **`bounce-api.ts`** — `help()` function at line 675; flat list of 21 entries
- **`bounce-globals.d.ts`** — TypeScript declarations for all globals; currently functions typed as plain `async function` with no `.help` property
- **`repl-evaluator.ts`** — `BOUNCE_GLOBALS` set (lines 1–24) used for reserved name checking; `corpus` is included
- **`bounce-api.ts` lines 709–791** — `corpus` object with `build`, `query`, `resynthesize` methods; currently undocumented in help

## Technical Constraints

- All changes are TypeScript only — no native C++ changes needed
- The `.help` property pattern requires updating TypeScript type declarations so the REPL evaluator and type checker don't reject `granularize.help()`
- `corpus` is already an object so `.help()` is straightforward to add
- The REPL runs in the Electron renderer process with `contextIsolation: true`

## Terminal UI Considerations

- Output uses ANSI color codes via BounceResult; the existing pattern (cyan headers, yellow function names) should be extended
- Section headers should be visually distinct from function entries
- Per-command `.help()` output should include: signature, description, options/defaults, and one usage example

## Open Questions

None remaining — all design decisions resolved in discussion.

## Research Findings

- The function-as-object pattern (`fn.help = () => ...`) is straightforward in JS/TS
- TypeScript requires updating the type declarations in `bounce-globals.d.ts` to include `help(): BounceResult` on each command's type
- `corpus.help()` requires no special treatment since `corpus` is already a plain object
- The `BOUNCE_GLOBALS` set in `repl-evaluator.ts` does not need changes (it guards top-level names, not properties)

## Next Steps

- Write PLAN.md with full implementation design and ordering
