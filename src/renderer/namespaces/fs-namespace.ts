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

export function buildFsNamespace(_deps: NamespaceDeps) {
  const fs = {
    FileType,

    help(): BounceResult {
      return new BounceResult([
        "\x1b[1;36mfs\x1b[0m — Filesystem utilities",
        "",
        "  fs.\x1b[33mls\x1b[0m(path?)              List directory contents (dotfiles hidden)",
        "  fs.\x1b[33mla\x1b[0m(path?)              List directory contents including dotfiles",
        "  fs.\x1b[33mcd\x1b[0m(path)               Change working directory (persists across restarts)",
        "  fs.\x1b[33mpwd\x1b[0m()                  Print current working directory",
        "  fs.\x1b[33mglob\x1b[0m(pattern)          Find files matching a glob pattern (e.g. **/*.wav)",
        "  fs.\x1b[33mwalk\x1b[0m(path, handler)    Recursively walk a directory; handler fires per entry",
        "",
        "\x1b[90mFor detailed usage:\x1b[0m \x1b[33mfs.ls.help()\x1b[0m, \x1b[33mfs.walk.help()\x1b[0m, etc.",
      ].join("\n"));
    },

    ls: Object.assign(
      function ls(dirPath?: string): LsResultPromise {
        return new LsResultPromise(
          (async () => {
            const { entries, truncated, total } = await window.electron.fsLs(dirPath);
            const msg = formatLsEntries(entries, truncated, total);
            return new LsResult(msg, entries, total, truncated);
          })(),
        );
      },
      {
        help: (): BounceResult => new BounceResult([
          "\x1b[1;36mfs.ls(path?)\x1b[0m",
          "",
          "  List the contents of a directory. Dotfiles and hidden entries are",
          "  omitted. Use fs.la() to show everything.",
          "",
          "  Directories are shown in \x1b[34mblue\x1b[0m; audio files in \x1b[32mgreen\x1b[0m.",
          "  Output is capped at 200 entries.",
          "",
          "  \x1b[33mpath\x1b[0m  Optional path (absolute, relative, or ~). Defaults to cwd.",
          "",
          "  \x1b[90mExamples:\x1b[0m  fs.ls()",
          "            fs.ls('~/samples')",
          "            fs.ls('../other')",
        ].join("\n")),
      },
    ),

    la: Object.assign(
      function la(dirPath?: string): LsResultPromise {
        return new LsResultPromise(
          (async () => {
            const { entries, truncated, total } = await window.electron.fsLa(dirPath);
            const msg = formatLsEntries(entries, truncated, total);
            return new LsResult(msg, entries, total, truncated);
          })(),
        );
      },
      {
        help: (): BounceResult => new BounceResult([
          "\x1b[1;36mfs.la(path?)\x1b[0m",
          "",
          "  Like fs.ls(), but includes dotfiles and hidden entries.",
          "",
          "  \x1b[33mpath\x1b[0m  Optional path (absolute, relative, or ~). Defaults to cwd.",
          "",
          "  \x1b[90mExamples:\x1b[0m  fs.la()",
          "            fs.la('~/samples')",
        ].join("\n")),
      },
    ),

    cd: Object.assign(
      async function cd(dirPath: string): Promise<BounceResult> {
        const newCwd = await window.electron.fsCd(dirPath);
        return new BounceResult(`\x1b[32m${newCwd}\x1b[0m`);
      },
      {
        help: (): BounceResult => new BounceResult([
          "\x1b[1;36mfs.cd(path)\x1b[0m",
          "",
          "  Change the REPL's current working directory. The new cwd is persisted",
          "  to disk and restored on the next app launch. Supports ~ expansion and",
          "  relative paths.",
          "",
          "  \x1b[33mpath\x1b[0m  Target directory (absolute, relative, or starting with ~).",
          "",
          "  \x1b[90mExamples:\x1b[0m  fs.cd('~/samples')",
          "            fs.cd('../other')",
          "            fs.cd('/Volumes/SampleDrive')",
        ].join("\n")),
      },
    ),

    pwd: Object.assign(
      async function pwd(): Promise<BounceResult> {
        const cwd = await window.electron.fsPwd();
        return new BounceResult(cwd);
      },
      {
        help: (): BounceResult => new BounceResult([
          "\x1b[1;36mfs.pwd()\x1b[0m",
          "",
          "  Print the current working directory. Relative paths in display()",
          "  and other commands resolve against this path.",
          "",
          "  \x1b[90mExample:\x1b[0m  fs.pwd()",
        ].join("\n")),
      },
    ),

    glob: Object.assign(
      function glob(pattern: string): GlobResultPromise {
        return new GlobResultPromise(
          (async () => {
            const paths = await window.electron.fsGlob(pattern);
            return new GlobResult(paths);
          })(),
        );
      },
      {
        help: (): BounceResult => new BounceResult([
          "\x1b[1;36mfs.glob(pattern)\x1b[0m",
          "",
          "  Find files matching a glob pattern relative to the current working",
          "  directory. Supports full glob syntax including ** for recursive search.",
          "  Returns a sorted string[] of absolute paths and prints each match.",
          "",
          "  \x1b[33mpattern\x1b[0m  Glob pattern string.",
          "",
          "  \x1b[90mExamples:\x1b[0m  fs.glob('*.wav')",
          "            fs.glob('**/*.{wav,flac}')",
          "            fs.glob('drums/**/*.wav')",
        ].join("\n")),
      },
    ),

    walk: Object.assign(
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
      {
        help: (): BounceResult => new BounceResult([
          "\x1b[1;36mfs.walk(path, handler)\x1b[0m",
          "",
          "  Recursively walk a directory, calling handler for each entry.",
          "  Walk is capped at 10,000 entries.",
          "",
          "  \x1b[33mpath\x1b[0m     Directory to walk (absolute, relative, or ~).",
          "  \x1b[33mhandler\x1b[0m  Either a catch-all callback or a handler-map keyed by fs.FileType.",
          "",
          "  Catch-all — receives every entry:",
          "    \x1b[90mfs.walk('~/samples', (filePath, type) => {\x1b[0m",
          "    \x1b[90m  if (type === fs.FileType.File) return sn.read(filePath);\x1b[0m",
          "    \x1b[90m});\x1b[0m",
          "",
          "  Handler map — only listed types fire, rest are silently skipped:",
          "    \x1b[90mfs.walk('~/samples', {\x1b[0m",
          "    \x1b[90m  [fs.FileType.File]: (p) => sn.read(p),\x1b[0m",
          "    \x1b[90m  [fs.FileType.Directory]: (p) => { console.log(p); },\x1b[0m",
          "    \x1b[90m});\x1b[0m",
          "",
          "  fs.FileType values: File · Directory · Symlink · BlockDevice",
          "                      CharDevice · FIFO · Socket · Unknown",
        ].join("\n")),
      },
    ),
  };

  return fs;
}
