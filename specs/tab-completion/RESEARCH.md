# Research: Tab Completion

**Spec:** specs/tab-completion  
**Created:** 2026-03-08  
**Status:** Complete

## Problem Statement

When a user is typing at the Bounce REPL prompt, they have no way to discover or
quickly enter command names. Tab completion is a fundamental REPL convenience:
predict what the user is typing, show them the possibilities, and let them
accept a suggestion without re-typing.

## Background

The Bounce REPL currently has 19 built-in globals (functions). Users must
already know the exact name of a function to type it. There is no suggestion
mechanism beyond `help()` (which the user must already know to call) and
Ctrl+R reverse search (which only searches previously-executed commands).

Tab completion is standard in every major REPL (Python, Node.js, fish shell,
zsh, bash) and is expected by technical users.

## Related Work / Prior Art

**Fish shell / zsh:** Ghost-text ("autosuggestion") shows a faded completion
candidate inline to the right of the cursor. Pressing the right-arrow or Tab
accepts it. Multiple candidates are shown in a menu below the input line.

**readline (bash/Python REPL):** Tab once shows completion or beeps;
Tab twice shows all matches. No ghost text.

**node REPL:** Uses readline with Tab-once cycling through completions;
no ghost text.

**xterm.js ecosystem:** xterm.js itself has no autocomplete addon in its
core/community packages. Any completion UI must be hand-rolled using:
- ANSI escape sequences to write/erase ghost text
- Cursor positioning (`\x1b[<n>A`, `\x1b[<n>B`, etc.) to draw lines below.

**fish-style inline ghost text** is preferred here because it is visually
unobtrusive and requires no separate pop-up widget, which matches Bounce's
minimal terminal-first aesthetic.

## FluCoMa Algorithm Details

Not applicable — this is a pure terminal UI feature.

## Technical Constraints

- All rendering is via ANSI escape sequences written to xterm.js (no DOM access).
- The renderer runs with `contextIsolation: true` and `nodeIntegration: false`.
- Completion candidates must be derived from a static list at render time
  (no async IPC needed for the initial version).
- Must not interfere with existing Ctrl+R reverse-search mode.
- Must not interfere with multi-line input mode.

## Audio Processing Considerations

None — this feature is entirely in the UI layer.

## Terminal UI Considerations

### Ghost text rendering

Ghost text is displayed using the dim/faint ANSI color (`\x1b[90m`), which
is already used for the multi-line continuation prompt. It must be erased
before re-rendering on every keypress to keep the display consistent.

Erasing requires saving the number of ghost-text lines written and issuing
the appropriate cursor-up + erase-line sequences.

### Single-match mode (inline ghost text)

```
> displ█ay(fileOrHash)
         ─────────────  ← ghost text (dim)
```

The ghost text shows the **suffix** of the matching command name plus `()`
(or `(fileOrHash)` for discoverability). Pressing Tab inserts the suffix
and positions the cursor between the parentheses.

### Multi-match mode (list below cursor)

```
> an█
     alyze()
     alyzeNmf()
```

The matched-command list is rendered below the input line using cursor-down
and carriage-return sequences. Pressing Tab cycles the selection; pressing
Enter accepts the selected item (pastes into prompt, does **not** execute).

### Accepted candidate insertion

When a completion is accepted (Tab in single-match mode, Enter in multi-match
mode), the text inserted into the command buffer is the full function name
followed by `()`, with the cursor placed **between** the parentheses so the
user can type arguments immediately.

### Clearing ghost text

Ghost text must be cleared:
- On any keypress that changes the buffer (including Backspace).
- On Enter (execution).
- On ESC.
- When reverse-search mode activates.

## Cross-Platform Considerations

All rendering uses standard ANSI escape codes that xterm.js handles
identically on macOS, Linux, and Windows. No platform-specific code needed.

## Open Questions

1. **Completion scope:** Only complete the 19 bounce globals, or also
   include variables defined in the REPL scope (`scopeVars`)?
   → Decision: Start with **globals only** to keep scope simple. Scope-variable
   completion can be added later.

2. **Completion trigger:** Only Tab, or also typing characters?
   → Decision: **Both** — ghost text updates on every character typed
   (fish-style), Tab accepts/cycles.

3. **Multi-match highlight style:** Highlight the selected item in the list,
   or just show a `>` prefix?
   → Decision: Use a leading `>` prefix and bright cyan (`\x1b[1;36m`) for
   the selected item; other items shown in dim (`\x1b[90m`).

4. **Function signature in ghost text:** Show full signature
   (`display(fileOrHash)`) or just name + `()`?
   → Decision: Show just `()` in single-match mode for brevity. The user can
   call `help()` for full signatures.

5. **Tab in multi-match mode:** Cycle forward through list or accept immediately?
   → Decision: Cycle through list (Tab advances selection). Enter accepts.

## Research Findings

- No autocomplete infrastructure exists in the codebase today.
- All input flows through `BounceApp.handleInput()` in `src/renderer/app.ts`.
- Ghost text rendering can be implemented entirely via ANSI escape sequences
  written to the xterm.js terminal.
- The 19 globals are already collected in the `BOUNCE_GLOBALS` Set in
  `src/renderer/repl-evaluator.ts`. This set should be exported and used
  as the completion source.
- Cursor position within the command buffer is tracked via `cursorPosition`
  in `BounceApp`. Ghost text must be rendered relative to the cursor.
- The `redrawCommandLine()` method already handles full redraws of the input
  line. Ghost text rendering should be integrated here or called immediately
  after.
- xterm.js `write()` accepts raw ANSI strings; there is no separate "overlay"
  API to use.

## Next Steps

- Design the `TabCompletion` class (or module) that encapsulates:
  - candidate matching
  - ghost text generation
  - state machine (idle / single-match / multi-match / cycling)
- Determine exactly where in `handleInput()` Tab key events arrive
  (xterm.js sends `\t` for Tab).
- Plan the ANSI sequence approach for drawing and erasing ghost text.
- Define the public API surface so `BounceApp` can call into the completion
  module with minimal coupling.
