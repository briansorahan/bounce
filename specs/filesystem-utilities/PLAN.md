# Plan: Filesystem Utilities

**Spec:** specs/filesystem-utilities  
**Created:** 2026-03-08  
**Status:** In Progress

## Context

Users need to explore their filesystem from within Bounce's terminal REPL to discover and load audio files into a corpus. Currently `display()` requires an exact absolute path or opens a native OS dialog. There is no directory browsing, no persistent working directory, and no glob/walk capability.

The solution is a single `fs` REPL global (an object with six methods) backed by new IPC channels in the main process. The renderer has no direct filesystem access (`nodeIntegration: false`), so all filesystem operations must go through IPC. See RESEARCH.md for full background and API decisions.

## Approach Summary

1. Add a lightweight **`SettingsStore`** to the main process that persists the REPL's current working directory to `userData/settings.json`.
2. Add six **IPC handlers** (`fs-ls`, `fs-la`, `fs-cd`, `fs-pwd`, `fs-glob`, `fs-walk`) that do filesystem work in the main process using Node.js built-in `fs.promises` APIs (no new npm packages).
3. Expose these handlers via **`preload.ts`** under `window.electron`.
4. Build the **`fs` object** in `bounce-api.ts` that wraps the IPC calls. `fs.walk` executes the user's callback in the renderer after receiving an array of file paths from main.
5. Update **`read-audio-file`** to resolve relative paths against the stored cwd (instead of always opening a dialog for non-absolute paths).
6. Register **`"fs"`** in `BOUNCE_GLOBALS` and declare the type in `bounce-globals.d.ts`.
7. Extract a shared **`AUDIO_EXTENSIONS`** constant to eliminate duplication between `main.ts` and `bounce-api.ts`.

## Architecture Changes

- **New file**: `src/electron/settings-store.ts` — `SettingsStore` class; reads/writes `userData/settings.json`; initialized in `main.ts` at app startup; cwd defaults to `os.homedir()` on first run.
- **New file**: `src/electron/audio-extensions.ts` — single source of truth for the supported audio extension list.
- **Modified**: `src/electron/main.ts` — 6 new IPC handlers; `read-audio-file` updated for relative-path resolution; imports `SettingsStore` and `AUDIO_EXTENSIONS`.
- **Modified**: `src/electron/preload.ts` — 6 new entries in the `contextBridge` object.
- **Modified**: `src/renderer/bounce-api.ts` — `fs` object added to return value; imports `AUDIO_EXTENSIONS` (or duplicates list if cross-process import isn't clean).
- **Modified**: `src/renderer/repl-evaluator.ts` — `"fs"` added to `BOUNCE_GLOBALS`.
- **Modified**: `src/renderer/bounce-globals.d.ts` — `FsApi` interface and `declare const fs: FsApi`.

## Changes Required

### Native C++ Changes

None.

### TypeScript Changes

#### `src/electron/audio-extensions.ts` (new)
```typescript
export const AUDIO_EXTENSIONS = [".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aac", ".opus"];
```
Import in `main.ts` and `bounce-api.ts` to replace the two hard-coded arrays.

#### `src/electron/settings-store.ts` (new)
- `SettingsStore` class with `getCwd(): string` and `setCwd(p: string): void`
- Reads/writes `app.getPath("userData")/settings.json` synchronously (startup read, sync write on each `cd`)
- Initializes cwd to `os.homedir()` if the file does not exist or cwd key is missing
- Handles `~` expansion: any path starting with `~` is resolved to `os.homedir() + path.slice(1)`

#### `src/electron/main.ts`
- Instantiate `SettingsStore` near the top (after `app` is ready)
- **`ipcMain.handle("fs-ls", (_e, dirPath?: string, showHidden = false)`**
  - Resolves `dirPath` against cwd (default: cwd) with `~` expansion
  - Calls `fs.promises.readdir(resolved, { withFileTypes: true })`
  - Returns `{ name, isDir, isAudio }[]` (filter dotfiles unless `showHidden`)
  - Cap at 200 entries; include `{ truncated: true, total: N }` if exceeded
- **`ipcMain.handle("fs-la", ...)` ** — calls `fs-ls` logic with `showHidden = true`
- **`ipcMain.handle("fs-cd", (_e, dirPath: string))`**
  - Resolves path against cwd with `~` expansion
  - Verifies target is a directory (throws if not)
  - Calls `settingsStore.setCwd(resolved)`
  - Returns the new absolute cwd string
- **`ipcMain.handle("fs-pwd")`** — returns `settingsStore.getCwd()`
- **`ipcMain.handle("fs-glob", (_e, pattern: string))`**
  - Uses Node.js 22+ `fs.promises.glob(pattern, { cwd: settingsStore.getCwd() })`
  - Collects results from the async iterable into `string[]`, returns sorted
- **`ipcMain.handle("fs-walk", (_e, dirPath: string))`**
  - Resolves path against cwd
  - Uses `fs.promises.readdir(resolved, { recursive: true, withFileTypes: true })`
  - Returns all file paths (relative to `dirPath`) as `string[]`; caller resolves absolute paths
- **Update `read-audio-file`**: when `filePathOrHash` is not a hash and not absolute, resolve it against `settingsStore.getCwd()` before reading

#### `src/electron/preload.ts`
Add to `contextBridge.exposeInMainWorld("electron", { ... })`:
```typescript
fsLs: (dirPath?: string) => ipcRenderer.invoke("fs-ls", dirPath, false),
fsLa: (dirPath?: string) => ipcRenderer.invoke("fs-ls", dirPath, true),
fsCd: (dirPath: string) => ipcRenderer.invoke("fs-cd", dirPath),
fsPwd: () => ipcRenderer.invoke("fs-pwd"),
fsGlob: (pattern: string) => ipcRenderer.invoke("fs-glob", pattern),
fsWalk: (dirPath: string) => ipcRenderer.invoke("fs-walk", dirPath),
```

The `fs-walk` IPC handler returns `{ path: string, type: FileType }[]` — a flat list that the renderer iterates locally. Callbacks never cross IPC.

#### `src/renderer/bounce-api.ts`
Add `fs` object to the return value of `buildBounceApi`.

**`fs.FileType` enum** — defined in `bounce-api.ts` and re-exported as a property of the `fs` object so it's accessible as `fs.FileType.File` in the REPL:

```typescript
enum FileType {
  File          = "file",
  Directory     = "directory",
  Symlink       = "symlink",
  BlockDevice   = "blockDevice",
  CharDevice    = "charDevice",
  FIFO          = "fifo",
  Socket        = "socket",
  Unknown       = "unknown",
}
```

**`fs.walk` callback — union type**, accepts either a catch-all or a per-type handler map:

```typescript
type WalkCatchAll = (path: string, type: FileType) => Promise<void>;
type WalkHandlers = Partial<Record<FileType, (path: string) => Promise<void>>>;

// Catch-all: user decides what to do with each type
await fs.walk("~/samples", async (filePath, type) => {
  if (type === fs.FileType.File) await display(filePath);
});

// Handler map: only types with a key are invoked, rest silently skipped
await fs.walk("~/samples", {
  [fs.FileType.File]: async (filePath) => { await display(filePath); },
  [fs.FileType.Directory]: async (dirPath) => { terminal.writeln("entering " + dirPath); },
});
```

**Full `fs` object sketch:**

```typescript
const fs = {
  FileType, // expose enum on the fs object
  async ls(dirPath?: string): Promise<BounceResult> { ... },
  async la(dirPath?: string): Promise<BounceResult> { ... },
  async cd(dirPath: string): Promise<BounceResult> { ... },
  async pwd(): Promise<BounceResult> { ... },
  async glob(pattern: string): Promise<string[]> { ... },
  async walk(dirPath: string, handler: WalkCatchAll | WalkHandlers): Promise<void> {
    const entries = await window.electron.fsWalk(dirPath);
    // entries: { path: string, type: FileType }[]
    for (const entry of entries) {
      if (typeof handler === "function") {
        await handler(entry.path, entry.type);
      } else if (handler[entry.type]) {
        await handler[entry.type]!(entry.path);
      }
      // no handler for this type → silently skip
    }
  },
};
```

**Terminal output format for `ls`/`la`:**
- Directories: `\x1b[34m<name>/\x1b[0m` (blue)
- Audio files: `\x1b[32m<name>\x1b[0m` (green)
- Other files: plain white
- If truncated: `\x1b[33m... N more items (use fs.la() to see all)\x1b[0m`

#### `src/renderer/repl-evaluator.ts`
Add `"fs"` to `BOUNCE_GLOBALS`.

#### `src/renderer/bounce-globals.d.ts`
Add:
```typescript
declare namespace fs {
  const enum FileType {
    File        = "file",
    Directory   = "directory",
    Symlink     = "symlink",
    BlockDevice = "blockDevice",
    CharDevice  = "charDevice",
    FIFO        = "fifo",
    Socket      = "socket",
    Unknown     = "unknown",
  }
}

interface FsEntry {
  name: string;
  type: fs.FileType;
  isAudio: boolean;
}

type WalkCatchAll = (path: string, type: fs.FileType) => Promise<void>;
type WalkHandlers = Partial<Record<fs.FileType, (path: string) => Promise<void>>>;

interface FsApi {
  FileType: typeof fs.FileType;
  ls(dirPath?: string): Promise<BounceResult>;
  la(dirPath?: string): Promise<BounceResult>;
  cd(dirPath: string): Promise<BounceResult>;
  pwd(): Promise<BounceResult>;
  glob(pattern: string): Promise<string[]>;
  walk(dirPath: string, handler: WalkCatchAll | WalkHandlers): Promise<void>;
}

declare const fs: FsApi;
```

### Terminal UI Changes

- `fs.ls()` / `fs.la()`: columnar or single-column listing (single-column for simplicity); color-coded entries; truncation notice if > 200 entries.
- `fs.cd()`: prints new absolute path on success.
- `fs.pwd()`: prints cwd.
- `fs.glob()`: prints each matched path on its own line.
- `fs.walk()`: no automatic terminal output; the user's callback controls what is printed.

### Configuration/Build Changes

None — no new npm packages. Uses Node.js 24 built-in `fs.promises` (including `fs.promises.glob` available since Node.js 22).

## Testing Strategy

### Unit Tests

- **`settings-store.test.ts`**: test `getCwd()` default (homedir), `setCwd()` persistence, `~` expansion, invalid path handling.
- **`repl-evaluator.test.ts`** (existing): add `"fs"` to the reserved name check tests.

### E2E Tests

Add a new Playwright spec `tests/filesystem.spec.ts`:
- `fs.pwd()` returns a non-empty string matching an absolute path
- `fs.cd("~")` changes cwd to home directory
- `fs.ls()` output contains at least one entry
- `fs.glob("*.ts")` returns an array
- `fs.walk` calls callback for each file in a test directory
- Relative path in `display("relative/path.wav")` resolves against cwd (use a temp file)
- cwd persists across app restart (requires two app launches in same test)

### Manual Testing

- `fs.cd("~/some/dir")` followed by `fs.ls()` shows contents
- `fs.cd("../parent")` navigates up
- `display("filename.wav")` with a relative path resolves correctly against cwd
- `fs.walk("~/samples", async (f) => { await display(f) })` bulk-loads audio files
- `fs.glob("**/*.wav")` finds nested wav files
- cwd is restored after app restart

## Success Criteria

- All six `fs` methods work in the REPL without errors
- `display("relative.wav")` resolves against the REPL cwd
- cwd survives app restart
- `fs.walk` can be used to load a directory of audio files into the DB
- `fs.glob` supports `**` patterns
- `fs.ls` hides dotfiles; `fs.la` shows them
- Existing tests continue to pass

## Risks & Mitigation

| Risk | Mitigation |
|---|---|
| `fs.promises.glob` is experimental in Node 22 / may be missing in some Node 24 builds | Fall back to `fsPromises.readdir({ recursive: true })` + manual pattern matching using `minimatch` (already a transitive dep) |
| `fs.walk` with a very large directory tree could return huge arrays | Cap at 10,000 entries; emit a warning if exceeded |
| `settings.json` write race (multiple `cd` calls) | `SettingsStore` uses synchronous `fs.writeFileSync`; single-process, no race |
| Breaking change to `read-audio-file` (relative path now resolves vs dialog) | Only triggered when path has a known audio extension or path separator — unchanged behavior for hash-style lookups and bare filenames without extension |

## Implementation Order

1. `src/electron/audio-extensions.ts` — shared constant (no dependencies)
2. `src/electron/settings-store.ts` — cwd persistence (depends on: Electron `app`)
3. `src/electron/main.ts` — IPC handlers + `read-audio-file` update (depends on: 1, 2)
4. `src/electron/preload.ts` — bridge exposure (depends on: 3)
5. `src/renderer/bounce-api.ts` — `fs` object (depends on: 4)
6. `src/renderer/repl-evaluator.ts` — add `"fs"` to BOUNCE_GLOBALS (depends on: 5)
7. `src/renderer/bounce-globals.d.ts` — type declarations (depends on: 5)
8. Unit tests (depends on: 2, 6)
9. E2E tests (depends on: 3–7)

## Estimated Scope

Medium — ~8 files changed/created, no native code, no schema migrations, no new npm packages.

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements (existing `display` behavior preserved for hashes and absolute paths)
- [x] All sections agree on the data model / schema approach (JSON settings file, no DB migration)
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
