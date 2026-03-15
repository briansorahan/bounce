# Research: Filesystem Utilities

**Spec:** specs/filesystem-utilities  
**Created:** 2026-03-08  
**Status:** Complete

## Problem Statement

Users need a way to explore their filesystem from within Bounce's terminal UI in order to discover and load audio files into their corpus. Currently, loading audio requires knowing the exact absolute path to a file, or using a native OS dialog triggered by `display` with a non-absolute argument. There are no commands to browse directories, list audio files, or construct paths interactively.

## Background

Bounce's terminal UI is the primary interface. Users interact through a TypeScript REPL with a fixed set of globals (e.g., `display`, `analyze`, `corpus`). To populate a corpus, users must first load audio files via `display <path>`, which stores the audio in the SQLite database and returns a hash. Subsequent analysis and corpus-building operations reference audio by hash.

The friction point is path discovery: users must know file paths in advance or use an OS file dialog. A set of filesystem utility commands — `ls`, `cd`, `pwd`, `find` — would allow users to browse their local filesystem from within the terminal and load sounds without leaving the REPL.

## Related Work / Prior Art

- **Unix shell**: `ls`, `cd`, `pwd`, `find` are the canonical model. Users already know these.
- **Python REPL / IPython**: `%ls`, `%cd` magic commands for filesystem navigation within a REPL context.
- **SuperCollider REPL**: Requires full paths; no built-in filesystem browsing.
- **Node.js REPL**: No built-in filesystem browsing; relies on `require('fs')`.
- **Bounce `list` command**: Already lists samples and features stored in the DB (not filesystem).

## FluCoMa Algorithm Details

Not applicable — filesystem utilities are pure TypeScript/Node.js and do not involve FluCoMa.

## Technical Constraints

- The renderer process runs with `nodeIntegration: false` and `contextIsolation: true`, so filesystem access must go through IPC to the main process.
- The main process has full Node.js `fs` and `path` access.
- Directory traversal must be non-blocking (use `fs.promises` / async APIs).
- Path handling must be cross-platform: use `path.sep`, `path.join`, `path.resolve`.
- The REPL evaluator has a fixed set of `BOUNCE_GLOBALS` (`checkReservedNames`). New commands must be added to this set and to the `BounceApi` interface.
- `display` already accepts absolute paths via `ipcMain.handle("read-audio-file", ...)` — filesystem utilities should complement, not replace this.

## Audio Processing Considerations

Not directly applicable. The output of filesystem utilities feeds into `display <path>`, which handles audio decoding. Filesystem utilities themselves do no audio processing.

## Terminal UI Considerations

- **`fs.ls(path?)`** — list directory contents, hiding dotfiles. Highlights audio files (supported extensions) distinctly from subdirectories and other files using ANSI color codes (xterm supports these). Shows `[dir]` prefix for subdirectories.
- **`fs.la(path?)`** — same as `ls` but includes dotfiles and hidden directories.
- **`fs.cd(path)`** — change cwd; prints the new absolute path on success. Updates the prompt prefix if feasible.
- **`fs.pwd()`** — prints the absolute cwd.
- **`fs.glob(pattern)`** — returns a `string[]` of matched paths (printed to terminal and returned for use in further REPL expressions). Uses full glob syntax (`**/*.wav`, `*.{wav,flac}`).
- **`fs.walk(path, cb)`** — walks silently; the callback controls terminal output. If the callback throws, walk stops and prints the error.
- Output should be truncated for very large directories (cap `ls`/`la` at 200 entries with `... N more items` message).
- The terminal uses xterm.js; ANSI escape codes for color are supported.

## Cross-Platform Considerations

- **Path separators**: Use `path.join` and `path.resolve` everywhere; never hard-code `/` or `\`.
- **Home directory**: Expand `~` to `os.homedir()` in the main process.
- **Case sensitivity**: Filesystem on macOS is case-insensitive by default; Linux is case-sensitive. `find` pattern matching should reflect this.
- **Windows drive letters**: `cd C:\Users\...` must be handled correctly. `path.isAbsolute` handles this cross-platform.
- **Symlinks**: `ls` should show symlinks without following them by default to avoid infinite loops.

## Open Questions

~~1. Should `cd` maintain a persistent cwd across app restarts, or reset to `os.homedir()` on each launch?~~
**Decision:** cwd persists across restarts (stored in SQLite or Electron's `app.getPath("userData")`).

~~2. Should relative paths in `display <path>` be resolved against the REPL cwd, or always require absolute paths?~~
**Decision:** Relative paths in all commands (including `display`) resolve against the REPL cwd.

~~3. Should `find` support full glob syntax (e.g., `**/*.wav`) or just simple wildcards (`*.wav`)?~~
**Decision:** Replaced by `fs.glob(pattern)` which supports full glob syntax. No `find` command.

~~4. Should `ls` show hidden files (dotfiles) by default, or only with a flag like `ls -a`?~~
**Decision:** `fs.ls()` hides dotfiles by default. `fs.la()` shows all entries including dotfiles.

~~5. Should there be a `load` or `loadDir` command that calls `display` on every audio file in a directory (batch loading)?~~
**Decision:** No `loadDir`. Instead `fs.walk(path, callback)` lets users write their own recursive loaders in the REPL.

## Research Findings

### Existing Filesystem Code
- `src/electron/main.ts`: Uses `fs.readFileSync`, `path.isAbsolute`, `dialog.showOpenDialog`. The `read-audio-file` IPC handler accepts absolute paths directly and opens a dialog for non-absolute arguments.
- `src/renderer/bounce-api.ts`: `display()` validates extensions against `[".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aac", ".opus"]` before calling IPC.
- No directory listing, traversal, or cwd management exists anywhere in the codebase.

### REPL Architecture
- `src/renderer/repl-evaluator.ts`: `BOUNCE_GLOBALS` set governs which names are injected as REPL globals. New commands require entries here.
- `src/renderer/bounce-api.ts`: `BounceApi` interface + implementation wraps IPC calls. New filesystem commands follow the same pattern.
- `src/electron/preload.ts`: Exposes `window.electron` via `contextBridge`. New IPC channels need entries here.
- `src/electron/main.ts`: `ipcMain.handle(...)` registers handlers. New filesystem IPC handlers go here.

### API Design (Resolved)

The filesystem utilities are exposed as a single `fs` global object (not individual top-level globals). This keeps the global namespace clean and groups related functionality:

```typescript
fs.ls(path?: string): Promise<void>        // list directory, hide dotfiles
fs.la(path?: string): Promise<void>        // list directory, show all including dotfiles
fs.cd(path: string): Promise<void>         // change cwd, persists across restarts
fs.pwd(): Promise<void>                    // print cwd
fs.glob(pattern: string): Promise<string[]> // full glob, returns matched paths
fs.walk(path: string, cb: (filePath: string) => Promise<void>): Promise<void>
// recursively walks directory, calling cb for each file
```

**`fs.walk` usage example** — how a user would build a corpus from a directory:
```typescript
await fs.walk("~/samples/kicks", async (file) => {
  await display(file);
});
// then: await corpus.build(...)
```

### IPC Pattern (Revised)
New filesystem commands expose `fs` as a single object rather than individual IPC channels:
1. `ipcMain.handle("fs-ls", ...)`, `ipcMain.handle("fs-cd", ...)` etc. in `main.ts`
2. Exposed as `window.electron.fsLs(path)`, `window.electron.fsCd(path)` etc. in `preload.ts`
3. Assembled into `fs` object in `bounce-api.ts`
4. `"fs"` added to `BOUNCE_GLOBALS` in `repl-evaluator.ts`

### Supported Audio Extensions
`.wav`, `.mp3`, `.ogg`, `.flac`, `.m4a`, `.aac`, `.opus` — defined in both `main.ts` and `bounce-api.ts`. Should be extracted to a shared constant to avoid duplication.

## Next Steps

- ~~Answer the open questions (esp. #1, #2, #5) before planning~~ ✓ Resolved above
- Design the IPC API surface for each new command → done above
- Decide on the exact terminal output format for `ls`/`la` (columns? icons? audio file highlighting?)
- Plan cwd persistence mechanism (SQLite `settings` table vs. Electron `store`)
- Plan `~` expansion in the main process
- Plan the `BOUNCE_GLOBALS` addition (`"fs"`) and `BounceApi` interface changes
- Plan `fs.walk` callback execution model in the REPL (async iteration, error handling)
- Consider a shared `AUDIO_EXTENSIONS` constant as a housekeeping improvement
- Mark RESEARCH as Complete and move to PLAN phase
