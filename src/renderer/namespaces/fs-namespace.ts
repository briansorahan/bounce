/// <reference path="../types.d.ts" />
/// <reference path="../bounce-globals.d.ts" />
import {
  BounceResult,
  LsResult,
  LsResultPromise,
  GlobResult,
  GlobResultPromise,
  formatLsEntries,
} from "../bounce-result.js";
import type { NamespaceDeps } from "./types.js";
import { namespace, describe, param } from "../../shared/repl-registry.js";
import { fsCommands } from "./fs-commands.generated.js";
export { fsCommands } from "./fs-commands.generated.js";

export const FileType = {
  File:        "file",
  Directory:   "directory",
  Symlink:     "symlink",
  BlockDevice: "blockDevice",
  CharDevice:  "charDevice",
  FIFO:        "fifo",
  Socket:      "socket",
  Unknown:     "unknown",
} as const;

type FileTypeValue = typeof FileType[keyof typeof FileType];
type WalkEntry = { path: string; type: FileTypeValue };
type WalkCatchAll = (filePath: string, type: FileTypeValue) => Promise<void>;
type WalkHandlers = Partial<Record<FileTypeValue, (filePath: string) => Promise<void>>>;

@namespace("fs", { summary: "Filesystem utilities" })
export class FsNamespace {
  /** Namespace summary — used by the globals help() function. */
  readonly description = "Filesystem utilities";

  /** FileType constants for use in fs.walk() handlers. */
  readonly FileType = FileType;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_deps: NamespaceDeps) {}

  // ── Injected by @namespace decorator — do not implement manually ──────────

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  help(): unknown {
    // Replaced at class definition time by the @namespace decorator.
    return undefined;
  }

  toString(): string {
    return String(this.help());
  }

  // ── Public REPL-facing methods ────────────────────────────────────────────

  @describe({
    summary: "List directory contents. Directories in blue, audio files in green.",
    returns: "LsResultPromise (entries are sorted alphabetically, hidden by default, max 200)",
  })
  @param("dirPath", {
    summary: "Path (absolute, relative, or ~). Defaults to cwd.",
    kind: "filePath",
  })
  ls(dirPath?: string): LsResultPromise {
    return new LsResultPromise(
      (async () => {
        const { entries, truncated, total } = await window.electron.fsLs(dirPath);
        const msg = formatLsEntries(entries, truncated, total);
        return new LsResult(msg, entries, total, truncated);
      })(),
    );
  }

  @describe({
    summary: "List directory contents including dotfiles. Like fs.ls() but shows hidden entries.",
    returns: "LsResultPromise",
  })
  @param("dirPath", {
    summary: "Path (absolute, relative, or ~). Defaults to cwd.",
    kind: "filePath",
  })
  la(dirPath?: string): LsResultPromise {
    return new LsResultPromise(
      (async () => {
        const { entries, truncated, total } = await window.electron.fsLa(dirPath);
        const msg = formatLsEntries(entries, truncated, total);
        return new LsResult(msg, entries, total, truncated);
      })(),
    );
  }

  @describe({
    summary: "Change working directory (persists across restarts). Supports ~ expansion and relative paths.",
    returns: "BounceResult",
  })
  @param("dirPath", {
    summary: "Target directory (absolute, relative, or starting with ~).",
    kind: "filePath",
  })
  async cd(dirPath: string): Promise<BounceResult> {
    const newCwd = await window.electron.fsCd(dirPath);
    return new BounceResult(`\x1b[32m${newCwd}\x1b[0m`);
  }

  @describe({
    summary: "Print current working directory. Relative paths in sn.read() and other commands resolve against this.",
    returns: "BounceResult",
  })
  async pwd(): Promise<BounceResult> {
    const cwd = await window.electron.fsPwd();
    return new BounceResult(cwd);
  }

  @describe({
    summary: "Find files matching a glob pattern (e.g. **/*.wav). Returns sorted absolute paths.",
    returns: "GlobResultPromise",
  })
  @param("pattern", {
    summary: "Glob pattern string. Supports ** for recursive search.",
    kind: "plain",
  })
  glob(pattern: string): GlobResultPromise {
    return new GlobResultPromise(
      (async () => {
        const paths = await window.electron.fsGlob(pattern);
        return new GlobResult(paths);
      })(),
    );
  }

  @describe({
    summary: "Recursively walk a directory; handler fires per entry. Capped at 10,000 entries.",
    returns: "BounceResult",
  })
  @param("dirPath", {
    summary: "Directory to walk (absolute, relative, or ~).",
    kind: "filePath",
  })
  @param("handler", {
    summary: "Catch-all callback (filePath, type) => void, or handler-map keyed by fs.FileType.",
    kind: "plain",
  })
  async walk(
    dirPath: string,
    handler: WalkCatchAll | WalkHandlers,
  ): Promise<BounceResult | undefined> {
    const { entries, truncated } = await window.electron.fsWalk(dirPath);
    const typedEntries = entries as WalkEntry[];
    for (const entry of typedEntries) {
      if (typeof handler === "function") {
        await handler(entry.path, entry.type);
      } else {
        const cb = handler[entry.type];
        if (cb) await cb(entry.path);
      }
    }
    if (truncated) {
      return new BounceResult(`\x1b[33mWarning: walk truncated at 10,000 entries\x1b[0m`);
    }
  }
}

/** @deprecated Use `new FsNamespace(deps)` directly. Kept for backward compatibility. */
export function buildFsNamespace(deps: NamespaceDeps): FsNamespace {
  return new FsNamespace(deps);
}

// Re-export commands array for any consumers of the old JSDoc-generated metadata.
export { fsCommands as fsNamespaceCommands };
