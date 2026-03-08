# Research: Filesystem Utilities

**Spec:** specs/filesystem-utilities  
**Created:** 2026-03-08  
**Status:** In Progress

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

- **`ls [path]`** — list directory contents, highlighting audio files (by extension) distinctly from other files and subdirectories. Should show file names with a visual cue (e.g., `[audio]` tag or color via xterm ANSI codes) for the supported formats: `.wav`, `.mp3`, `.ogg`, `.flac`, `.m4a`, `.aac`, `.opus`.
- **`cd <path>`** — change the REPL's current working directory. Subsequent relative paths in `display` and other commands should resolve against the cwd.
- **`pwd`** — print the current working directory.
- **`find <pattern> [path]`** — recursively search for audio files matching a glob pattern (e.g., `find *.wav`, `find kick ~/samples`). Limits results to audio files only for simplicity.
- Output should be paginated or truncated for very large directories (e.g., cap at 200 entries with a "... N more" message).
- The terminal uses xterm.js; ANSI escape codes for color are supported.

## Cross-Platform Considerations

- **Path separators**: Use `path.join` and `path.resolve` everywhere; never hard-code `/` or `\`.
- **Home directory**: Expand `~` to `os.homedir()` in the main process.
- **Case sensitivity**: Filesystem on macOS is case-insensitive by default; Linux is case-sensitive. `find` pattern matching should reflect this.
- **Windows drive letters**: `cd C:\Users\...` must be handled correctly. `path.isAbsolute` handles this cross-platform.
- **Symlinks**: `ls` should show symlinks without following them by default to avoid infinite loops.

## Open Questions

1. Should `cd` maintain a persistent cwd across app restarts, or reset to `os.homedir()` on each launch?
2. Should relative paths in `display <path>` be resolved against the REPL cwd, or always require absolute paths?
3. Should `find` support full glob syntax (e.g., `**/*.wav`) or just simple wildcards (`*.wav`)?
4. Should `ls` show hidden files (dotfiles) by default, or only with a flag like `ls -a`?
5. Should there be a `load` or `loadDir` command that calls `display` on every audio file in a directory (batch loading)?

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

### IPC Pattern
New filesystem commands will follow the established IPC pattern:
1. `ipcMain.handle("fs-ls", ...)` in `main.ts`
2. Exposed as `window.electron.fsLs(path)` in `preload.ts`
3. Wrapped as `ls(path)` global in `bounce-api.ts`
4. Added to `BOUNCE_GLOBALS` in `repl-evaluator.ts`

### Supported Audio Extensions
`.wav`, `.mp3`, `.ogg`, `.flac`, `.m4a`, `.aac`, `.opus` — defined in both `main.ts` and `bounce-api.ts`. Should be extracted to a shared constant to avoid duplication.

## Next Steps

- Answer the open questions (esp. #1, #2, #5) before planning
- Design the IPC API surface for each new command
- Decide on the exact terminal output format for `ls` and `find`
- Determine if `~` expansion and relative path resolution in `display` are in scope
- Plan the `BOUNCE_GLOBALS` and `BounceApi` additions
- Consider a shared `AUDIO_EXTENSIONS` constant as a housekeeping improvement
