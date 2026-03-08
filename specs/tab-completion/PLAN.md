# Plan: Tab Completion

**Spec:** specs/tab-completion  
**Created:** 2026-03-08  
**Status:** In Progress

## Context

The Bounce REPL has 19 built-in globals but no mechanism for discovering or
completing them. This plan adds fish-style tab completion:
- **Single match:** inline ghost text after cursor; Tab accepts.
- **Multiple matches:** list of candidates below cursor; Tab cycles, Enter accepts.
- Acceptance inserts `functionName()` with cursor placed between the parens.
- Ghost text is displayed on every character change and cleared on irrelevant
  keys or mode transitions.

Full details in `specs/tab-completion/RESEARCH.md`.

## Approach Summary

Introduce a self-contained `TabCompletion` class in a new file
`src/renderer/tab-completion.ts`. The class owns all completion state and
exposes a small API. `BounceApp` calls into it from `handleInput()` to:

1. Update completion state on each character typed.
2. Handle Tab and Enter keypresses when completion is active.
3. Ask for the ANSI string to append after each `redrawCommandLine()` call.

Ghost text is rendered by writing ANSI sequences directly to the terminal
after each prompt redraw, and erased by writing cursor-movement + erase-line
sequences before the next redraw.

## Architecture Changes

**New file:** `src/renderer/tab-completion.ts`  
Encapsulates the completion state machine and all ANSI rendering strings.
Zero dependencies on xterm.js or Electron; it returns strings that the caller
writes to the terminal. This keeps it easily unit-testable.

**Modified file:** `src/renderer/repl-evaluator.ts`  
Export `BOUNCE_GLOBALS` so `TabCompletion` can import it as the candidate set.

**Modified file:** `src/renderer/app.ts`  
- Instantiate `TabCompletion` in constructor.
- Call `completion.update(buffer)` whenever `commandBuffer` changes.
- Handle `\t` (Tab) in `handleInput()` — currently unhandled.
- Handle Enter in multi-match mode before default Enter logic.
- Append ghost text after `redrawCommandLine()` calls.
- Clear ghost text before redraws.

## Changes Required

### Native C++ Changes

None.

### TypeScript Changes

#### `src/renderer/repl-evaluator.ts`

- Export `BOUNCE_GLOBALS` (change `const BOUNCE_GLOBALS` to
  `export const BOUNCE_GLOBALS`).

#### `src/renderer/tab-completion.ts` (new file)

```
TabCompletionState enum:
  Idle            – no prefix typed or no matches
  SingleMatch     – exactly one candidate matches
  MultiMatch      – two or more candidates match

TabCompletion class:
  Fields:
    state: TabCompletionState
    candidates: string[]      // all 19 globals, sorted
    matches: string[]         // current filtered matches
    selectedIndex: number     // active index in multi-match cycling
    ghostLines: number        // how many lines of ghost text were written

  Methods:
    update(buffer: string): void
      – Recomputes matches from buffer prefix, resets selectedIndex to 0,
        updates state. Does NOT write to terminal.

    handleTab(): CompletionAction | null
      – In SingleMatch: returns { kind: 'accept', text: fullCommand }
      – In MultiMatch:  advances selectedIndex (wraps), returns { kind: 'redraw' }
      – In Idle:        returns null

    handleEnter(): CompletionAction | null
      – In MultiMatch:  returns { kind: 'accept', text: matches[selectedIndex] }
      – Otherwise:      returns null (let normal Enter logic proceed)

    ghostText(buffer: string, cols: number): string
      – Returns the ANSI string to write after the prompt line.
        SingleMatch: dim suffix + "()" on same line after cursor.
        MultiMatch: newlines + dim/selected candidates below.
        Idle: "".
      – Also sets this.ghostLines for use by eraseGhostText().

    eraseGhostText(): string
      – Returns ANSI to erase previously written ghost text and return
        cursor to end of prompt line. Uses saved ghostLines count.

CompletionAction:
  { kind: 'accept'; text: string }   // insert text into buffer
  { kind: 'redraw' }                 // just redraw ghost text
```

**Matching logic:** case-sensitive prefix match on the start of the current
word being typed (content from last whitespace/`(` to cursor).

**Insertion:** accepted text = `<full name>()`, cursor placed at
`commandBuffer.length - 1` (between the parens).

#### `src/renderer/app.ts`

1. Import `TabCompletion`, `TabCompletionState`, `CompletionAction`.
2. Add `private completion: TabCompletion` field.
3. In constructor: `this.completion = new TabCompletion()`.
4. Add `private writeGhostText(): void` — calls
   `this.terminal.write(this.completion.ghostText(this.commandBuffer, cols))`.
5. Add `private eraseGhostText(): void` — calls
   `this.terminal.write(this.completion.eraseGhostText())`.
6. Update `redrawCommandLine()` to call `eraseGhostText()` before redrawing
   and `writeGhostText()` after.
7. In `handleInput()`:
   - Add `case '\t':` before the printable-character fallthrough:
     - Call `completion.update(commandBuffer)`.
     - Call `completion.handleTab()`.
     - If `accept` action: update buffer, cursor, redraw.
     - If `redraw` action: erase + redraw + write ghost text.
     - `return` (do not fall through).
   - In the Enter branch: check `completion.handleEnter()` first.
     If `accept` action: insert text into buffer and redraw (do not execute).
   - For all other buffer-changing paths (printable chars, Backspace,
     history navigation, etc.): call `completion.update(commandBuffer)` so
     the ghost text stays up to date.
8. In reverse-search entry (`CTRL_R`): call `eraseGhostText()` and
   `completion.update("")` to reset completion state.

### Terminal UI Changes

- **Single-match ghost text:** Dim (`\x1b[90m`) suffix after cursor, on same
  line. Example: user types `dis`, ghost shows `play()`.
- **Multi-match list:** Lines below current input. Selected item prefixed
  with `> ` in bright cyan (`\x1b[1;36m`); others in dim (`\x1b[90m`).
- **Erase sequence:**
  ```
  \r                              // CR to line start
  \x1b[2K                        // erase current line (re-draws prompt)
  (\x1b[1A\x1b[2K) × ghostLines  // move up & erase each ghost line
  ```
  Followed by a full `redrawCommandLine()` to restore the prompt.

### Configuration/Build Changes

None — new `.ts` file is picked up by existing `tsconfig.renderer.json`.

## Testing Strategy

### Unit Tests

Create `tests/tab-completion.test.ts`:

- `update()` with no input → `Idle` state.
- `update("dis")` → `SingleMatch`, matches `["display"]`.
- `update("an")` → `MultiMatch`, matches `["analyze", "analyzeNmf"]`.
- `update("xyz")` → `Idle` (no matches).
- `handleTab()` in `SingleMatch` → returns `accept` with `"display()"`.
- `handleTab()` in `MultiMatch` → cycles `selectedIndex`.
- `handleTab()` in `Idle` → returns `null`.
- `handleEnter()` in `MultiMatch` → returns `accept` with selected command.
- `handleEnter()` in `SingleMatch` → returns `null`.
- `ghostText()` in `SingleMatch` → string contains dim ANSI and suffix.
- `ghostText()` in `MultiMatch` → string contains two candidate lines.
- `eraseGhostText()` after multi-match → correct number of erase sequences.

### E2E Tests

Add to existing Playwright test suite (or create
`tests/e2e/tab-completion.spec.ts`):

- Type `dis` then `Tab` → command buffer becomes `display()` with cursor
  inside parens.
- Type `an` → two ghost lines visible below cursor.
- Type `an` then `Tab` → selection advances to `analyzeNmf`.
- Type `an` then `Tab` then `Enter` → buffer shows `analyzeNmf()`, no
  execution (no result line printed).
- Type `cl` → single ghost `ear()` shown; Tab completes to `clear()`.
- Reverse-search (Ctrl+R) clears ghost text.

### Manual Testing

- Verify ghost text appears immediately as user types in the live app.
- Verify Tab works in single-match and multi-match modes.
- Verify Enter in multi-match pastes but does not execute.
- Verify ghost text erased correctly when switching modes (e.g., history
  navigation clears completion).
- Verify no visual artifacts left after completion is dismissed.

## Success Criteria

1. Typing any prefix of a bounce global shows ghost text within one keypress.
2. A single match shows an inline grey suffix; Tab completes to `name()` with
   cursor between parens.
3. Multiple matches show a dim list below; Tab cycles, Enter pastes into prompt.
4. Accepted completions do not execute the command.
5. Ghost text is cleanly erased before every prompt redraw.
6. No interference with Ctrl+R reverse-search, history navigation, or
   multi-line input mode.
7. All new unit tests pass; existing tests unaffected.

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| Ghost text erasing leaves visual artifacts | Test erase sequences carefully; use absolute cursor positioning if needed |
| Terminal column width needed for ghost text layout | Read `this.terminal.cols` (xterm.js property on `Terminal` instance); expose via `BounceTerminal` |
| Multi-line input mode conflict | Only show completion when `inputLines.length === 0` (first line of input) |
| xterm.js renders ghost text during rapid typing | Debounce is NOT needed — erasing before each redraw is sufficient |
| Tab key already captured by browser focus management | Handled: xterm.js `Terminal` intercepts Tab by default via its `attachCustomKeyEventHandler` or by consuming the `onData` event; needs verification |

## Implementation Order

1. Export `BOUNCE_GLOBALS` from `repl-evaluator.ts`.
2. Create `src/renderer/tab-completion.ts` with full `TabCompletion` class.
3. Write unit tests in `tests/tab-completion.test.ts`; iterate until green.
4. Expose `cols` on `BounceTerminal` wrapper if not already available.
5. Integrate `TabCompletion` into `BounceApp` (`app.ts`):
   a. Add field + constructor init.
   b. Wire `update()` into printable-char and Backspace paths.
   c. Add Tab handler.
   d. Add Enter interception for multi-match.
   e. Add `writeGhostText()` / `eraseGhostText()` around `redrawCommandLine()`.
   f. Clear completion state on Ctrl+R, history nav, Ctrl+C.
6. Manual smoke test in `npm run dev:electron`.
7. Write / update E2E tests.
8. Run `npm run lint` and `npm run build:electron`.

## Estimated Scope

Medium (new module ~150 lines, integration changes ~80 lines, tests ~120 lines).

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements (no breaking changes)
- [x] All sections agree on the data model (state machine in `TabCompletion`)
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
