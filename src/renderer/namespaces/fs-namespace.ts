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
import { type CommandHelp, renderNamespaceHelp, withHelp } from "../help.js";
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

export const fsCommands: CommandHelp[] = [
  {
    name: "ls",
    signature: "fs.ls(path?)",
    summary: "List directory contents (dotfiles hidden)",
    description:
      "List the contents of a directory. Dotfiles and hidden entries are\nomitted. Use fs.la() to show everything.\n\nDirectories are shown in blue; audio files in green.\nOutput is capped at 200 entries.",
    params: [
      { name: "path", type: "string", description: "Path (absolute, relative, or ~). Defaults to cwd.", optional: true },
    ],
    examples: ["fs.ls()", "fs.ls('~/samples')", "fs.ls('../other')"],
  },
  {
    name: "la",
    signature: "fs.la(path?)",
    summary: "List directory contents including dotfiles",
    description: "Like fs.ls(), but includes dotfiles and hidden entries.",
    params: [
      { name: "path", type: "string", description: "Path (absolute, relative, or ~). Defaults to cwd.", optional: true },
    ],
    examples: ["fs.la()", "fs.la('~/samples')"],
  },
  {
    name: "cd",
    signature: "fs.cd(path)",
    summary: "Change working directory (persists across restarts)",
    description:
      "Change the REPL's current working directory. The new cwd is persisted\nto disk and restored on the next app launch. Supports ~ expansion and\nrelative paths.",
    params: [
      { name: "path", type: "string", description: "Target directory (absolute, relative, or starting with ~)." },
    ],
    examples: ["fs.cd('~/samples')", "fs.cd('../other')", "fs.cd('/Volumes/SampleDrive')"],
  },
  {
    name: "pwd",
    signature: "fs.pwd()",
    summary: "Print current working directory",
    description:
      "Print the current working directory. Relative paths in display()\nand other commands resolve against this path.",
    examples: ["fs.pwd()"],
  },
  {
    name: "glob",
    signature: "fs.glob(pattern)",
    summary: "Find files matching a glob pattern (e.g. **/*.wav)",
    description:
      "Find files matching a glob pattern relative to the current working\ndirectory. Supports full glob syntax including ** for recursive search.\nReturns a sorted string[] of absolute paths and prints each match.",
    params: [
      { name: "pattern", type: "string", description: "Glob pattern string." },
    ],
    examples: ["fs.glob('*.wav')", "fs.glob('**/*.{wav,flac}')", "fs.glob('drums/**/*.wav')"],
  },
  {
    name: "walk",
    signature: "fs.walk(path, handler)",
    summary: "Recursively walk a directory; handler fires per entry",
    description:
      "Recursively walk a directory, calling handler for each entry.\nWalk is capped at 10,000 entries.\n\nfs.FileType values: File · Directory · Symlink · BlockDevice\n                    CharDevice · FIFO · Socket · Unknown",
    params: [
      { name: "path", type: "string", description: "Directory to walk (absolute, relative, or ~)." },
      { name: "handler", type: "function | object", description: "Catch-all callback or handler-map keyed by fs.FileType." },
    ],
    examples: [
      "fs.walk('~/samples', (filePath, type) => {\n  if (type === fs.FileType.File) return sn.read(filePath);\n})",
      "fs.walk('~/samples', {\n  [fs.FileType.File]: (p) => sn.read(p),\n  [fs.FileType.Directory]: (p) => { console.log(p); },\n})",
    ],
  },
];

export function buildFsNamespace(_deps: NamespaceDeps) {
  const fs = {
    FileType,

    help: () => renderNamespaceHelp("fs", "Filesystem utilities", fsCommands),

    ls: withHelp(
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
      async function cd(dirPath: string): Promise<BounceResult> {
        const newCwd = await window.electron.fsCd(dirPath);
        return new BounceResult(`\x1b[32m${newCwd}\x1b[0m`);
      },
      fsCommands[2],
    ),

    pwd: withHelp(
      async function pwd(): Promise<BounceResult> {
        const cwd = await window.electron.fsPwd();
        return new BounceResult(cwd);
      },
      fsCommands[3],
    ),

    glob: withHelp(
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
