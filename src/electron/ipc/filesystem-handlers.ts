import { ipcMain } from "electron";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { SettingsStore } from "../settings-store";
import { AUDIO_EXTENSIONS } from "../audio-extensions";
import type { HandlerDeps } from "./register";

export type FileType =
  | "file"
  | "directory"
  | "symlink"
  | "blockDevice"
  | "charDevice"
  | "fifo"
  | "socket"
  | "unknown";

export interface FsEntry {
  name: string;
  path: string;
  type: FileType;
  isAudio: boolean;
}

export interface WalkEntry {
  path: string;
  type: FileType;
}

type FsCompletionMethod = "ls" | "la" | "cd" | "walk";

function direntToFileType(d: fs.Dirent): FileType {
  if (d.isFile()) return "file";
  if (d.isDirectory()) return "directory";
  if (d.isSymbolicLink()) return "symlink";
  if (d.isBlockDevice()) return "blockDevice";
  if (d.isCharacterDevice()) return "charDevice";
  if (d.isFIFO()) return "fifo";
  if (d.isSocket()) return "socket";
  return "unknown";
}

function normalizeCompletionPath(inputPath: string): string {
  return inputPath.replace(/\\/g, "/");
}

function splitCompletionInput(inputPath: string): { parentPath: string; namePrefix: string } {
  if (inputPath === "~") {
    return { parentPath: "~/", namePrefix: "" };
  }

  const lastSlash = Math.max(inputPath.lastIndexOf("/"), inputPath.lastIndexOf("\\"));
  if (lastSlash === -1) {
    return { parentPath: "", namePrefix: inputPath };
  }

  return {
    parentPath: inputPath.slice(0, lastSlash + 1),
    namePrefix: inputPath.slice(lastSlash + 1),
  };
}

/** Resolve a path against the stored cwd, expanding ~ and handling relative paths. */
function resolvePath(settingsStore: SettingsStore | undefined, inputPath: string): string {
  const expanded = SettingsStore.expandHome(inputPath);
  if (path.isAbsolute(expanded)) return expanded;
  const cwd = settingsStore?.getCwd() ?? os.homedir();
  return path.resolve(cwd, expanded);
}

async function completeFsPath(
  settingsStore: SettingsStore | undefined,
  method: FsCompletionMethod,
  inputPath: string,
): Promise<string[]> {
  const normalizedInput = normalizeCompletionPath(inputPath);
  const { parentPath, namePrefix } = splitCompletionInput(normalizedInput);
  const resolvedParent = parentPath
    ? resolvePath(settingsStore, parentPath)
    : (settingsStore?.getCwd() ?? os.homedir());
  const includeHidden =
    method === "la" ||
    method === "cd" ||
    method === "walk" ||
    namePrefix.startsWith(".");
  const dirents = await fs.promises.readdir(resolvedParent, { withFileTypes: true });

  return dirents
    .filter((d) => d.isDirectory())
    .filter((d) => includeHidden || !d.name.startsWith("."))
    .filter((d) => d.name.startsWith(namePrefix))
    .map((d) => `${parentPath}${d.name}/`)
    .sort((a, b) => a.localeCompare(b));
}

export function registerFilesystemHandlers(deps: HandlerDeps): void {
  ipcMain.handle(
    "fs-ls",
    async (_event, dirPath: string | undefined, showHidden: boolean) => {
      const resolved = dirPath ? resolvePath(deps.settingsStore, dirPath) : (deps.settingsStore?.getCwd() ?? os.homedir());
      const dirents = await fs.promises.readdir(resolved, { withFileTypes: true });
      const entries: FsEntry[] = [];
      for (const d of dirents) {
        if (!showHidden && d.name.startsWith(".")) continue;
        const type = direntToFileType(d);
        const ext = path.extname(d.name).toLowerCase();
        entries.push({
          name: d.name,
          path: path.join(resolved, d.name),
          type,
          isAudio: type === "file" && (AUDIO_EXTENSIONS as readonly string[]).includes(ext),
        });
        if (entries.length >= 200) break;
      }
      const total = dirents.filter((d) => showHidden || !d.name.startsWith(".")).length;
      return { entries, total, truncated: total > 200 };
    },
  );

  ipcMain.handle("fs-cd", async (_event, dirPath: string) => {
    const resolved = resolvePath(deps.settingsStore, dirPath);
    const stat = await fs.promises.stat(resolved);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${resolved}`);
    }
    deps.settingsStore?.setCwd(resolved);
    return resolved;
  });

  ipcMain.handle("fs-pwd", () => deps.settingsStore?.getCwd() ?? os.homedir());

  ipcMain.handle("fs-complete-path", async (_event, method: FsCompletionMethod, inputPath: string) => {
    return completeFsPath(deps.settingsStore, method, inputPath);
  });

  ipcMain.handle("fs-glob", async (_event, pattern: string) => {
    const cwd = deps.settingsStore?.getCwd() ?? os.homedir();
    const results: string[] = [];
    // fs.promises.glob is available in Node.js 22+
    const globFn = (fs.promises as Record<string, unknown>)["glob"] as
      | ((pattern: string, opts: { cwd: string }) => AsyncIterable<string>)
      | undefined;
    if (globFn) {
      for await (const p of globFn(pattern, { cwd })) {
        results.push(path.resolve(cwd, p));
      }
    } else {
      throw new Error("fs.promises.glob is not available in this Node.js version (requires Node 22+).");
    }
    return results.sort();
  });

  ipcMain.handle("fs-walk", async (_event, dirPath: string) => {
    const resolved = resolvePath(deps.settingsStore, dirPath);
    const dirents = await fs.promises.readdir(resolved, {
      recursive: true,
      withFileTypes: true,
    });
    const entries: WalkEntry[] = [];
    for (const d of dirents) {
      if (entries.length >= 10_000) break;
      const parentPath = typeof d.parentPath === "string" ? d.parentPath : (d as unknown as { path: string }).path ?? resolved;
      entries.push({
        path: path.join(parentPath, d.name),
        type: direntToFileType(d),
      });
    }
    return { entries, truncated: dirents.length > 10_000 };
  });
}
