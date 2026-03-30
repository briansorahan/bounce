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
import { renderNamespaceHelp, withHelp } from "../help.js";
import { fsCommands, fsDescription } from "./fs-commands.generated.js";
export { fsCommands } from "./fs-commands.generated.js";
import type { NamespaceDeps } from "./types.js";

const FileType = {
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

/**
 * Filesystem utilities
 * @namespace fs
 */
export function buildFsNamespace(_deps: NamespaceDeps) {
  const fs = {
    FileType,

    description: fsDescription,

    help: () => renderNamespaceHelp("fs", fsDescription, fsCommands),

    ls: withHelp(
      /**
       * List directory contents (dotfiles hidden)
       *
       * List the contents of a directory. Dotfiles and hidden entries are
       * omitted. Use fs.la() to show everything.
       *
       * Directories are shown in blue; audio files in green.
       * Output is capped at 200 entries.
       *
       * @param dirPath Path (absolute, relative, or ~). Defaults to cwd.
       * @example fs.ls()
       * @example fs.ls('~/samples')
       * @example fs.ls('../other')
       */
      function ls(dirPath?: string): LsResultPromise {
        return new LsResultPromise(
          (async () => {
            const { entries, truncated, total } = await window.electron.fsLs(dirPath);
            const msg = formatLsEntries(entries, truncated, total);
            return new LsResult(msg, entries, total, truncated);
          })(),
        );
      },
      fsCommands[0],
    ),

    la: withHelp(
      /**
       * List directory contents including dotfiles
       *
       * Like fs.ls(), but includes dotfiles and hidden entries.
       *
       * @param dirPath Path (absolute, relative, or ~). Defaults to cwd.
       * @example fs.la()
       * @example fs.la('~/samples')
       */
      function la(dirPath?: string): LsResultPromise {
        return new LsResultPromise(
          (async () => {
            const { entries, truncated, total } = await window.electron.fsLa(dirPath);
            const msg = formatLsEntries(entries, truncated, total);
            return new LsResult(msg, entries, total, truncated);
          })(),
        );
      },
      fsCommands[1],
    ),

    cd: withHelp(
      /**
       * Change working directory (persists across restarts)
       *
       * Change the REPL's current working directory. The new cwd is persisted
       * to disk and restored on the next app launch. Supports ~ expansion and
       * relative paths.
       *
       * @param dirPath Target directory (absolute, relative, or starting with ~).
       * @example fs.cd('~/samples')
       * @example fs.cd('../other')
       * @example fs.cd('/Volumes/SampleDrive')
       */
      async function cd(dirPath: string): Promise<BounceResult> {
        const newCwd = await window.electron.fsCd(dirPath);
        return new BounceResult(`\x1b[32m${newCwd}\x1b[0m`);
      },
      fsCommands[2],
    ),

    pwd: withHelp(
      /**
       * Print current working directory
       *
       * Print the current working directory. Relative paths in display()
       * and other commands resolve against this path.
       *
       * @example fs.pwd()
       */
      async function pwd(): Promise<BounceResult> {
        const cwd = await window.electron.fsPwd();
        return new BounceResult(cwd);
      },
      fsCommands[3],
    ),

    glob: withHelp(
      /**
       * Find files matching a glob pattern (e.g. **\/*.wav)
       *
       * Find files matching a glob pattern relative to the current working
       * directory. Supports full glob syntax including ** for recursive search.
       * Returns a sorted string[] of absolute paths and prints each match.
       *
       * @param pattern Glob pattern string.
       * @example fs.glob('*.wav')
       * @example fs.glob('**\/*.{wav,flac}')
       * @example fs.glob('drums/**\/*.wav')
       */
      function glob(pattern: string): GlobResultPromise {
        return new GlobResultPromise(
          (async () => {
            const paths = await window.electron.fsGlob(pattern);
            return new GlobResult(paths);
          })(),
        );
      },
      fsCommands[4],
    ),

    walk: withHelp(
      /**
       * Recursively walk a directory; handler fires per entry
       *
       * Recursively walk a directory, calling handler for each entry.
       * Walk is capped at 10,000 entries.
       *
       * fs.FileType values: File · Directory · Symlink · BlockDevice
       *                     CharDevice · FIFO · Socket · Unknown
       *
       * @param dirPath Directory to walk (absolute, relative, or ~).
       * @param handler Catch-all callback or handler-map keyed by fs.FileType.
       * @example fs.walk('~/samples', (filePath, type) => {\n  if (type === fs.FileType.File) return sn.read(filePath);\n})
       * @example fs.walk('~/samples', {\n  [fs.FileType.File]: (p) => sn.read(p),\n  [fs.FileType.Directory]: (p) => { console.log(p); },\n})
       */
      async function walk(
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
      },
      fsCommands[5],
    ),
  };

  return fs;
}
