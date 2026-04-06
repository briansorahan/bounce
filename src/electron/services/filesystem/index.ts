import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import type { MessageConnection } from "vscode-jsonrpc";
import { SettingsStore } from "../../settings-store";
import { AUDIO_EXTENSIONS } from "../../audio-extensions";
import {
  registerFilesystemHandlers,
  createFilesystemClient,
} from "../../../shared/rpc/filesystem.rpc";
import type {
  FilesystemHandlers,
  FilesystemRpc,
  FsEntry,
  FileType,
  LsResult,
  WalkResult,
} from "../../../shared/rpc/filesystem.rpc";
import type { ServiceClient } from "../../../shared/rpc/types";
import type { StateRpc } from "../../../shared/rpc/state.rpc";

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

/**
 * FilesystemService — pwd, cd, ls, glob, walk operations.
 *
 * Uses StateService for cwd persistence so cwd survives across all services
 * that depend on it (e.g. AudioFileService relative path resolution).
 *
 * Constructor dependency: StateService (via ServiceClient<StateRpc>).
 */
export class FilesystemService implements FilesystemHandlers {
  constructor(private state: ServiceClient<StateRpc>) {}

  async pwd(_params: Record<string, never>): Promise<string> {
    return this.state.invoke("getCwd", {});
  }

  async cd(params: { dirPath: string }): Promise<string> {
    const resolved = SettingsStore.expandHome(params.dirPath);
    const abs = path.isAbsolute(resolved)
      ? resolved
      : path.resolve(await this.state.invoke("getCwd", {}), resolved);
    const stat = await fs.promises.stat(abs);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${abs}`);
    }
    return this.state.invoke("setCwd", { cwd: abs });
  }

  async ls(params: { dirPath?: string; showHidden?: boolean }): Promise<LsResult> {
    const showHidden = params.showHidden ?? false;
    const base = params.dirPath
      ? SettingsStore.expandHome(params.dirPath)
      : await this.state.invoke("getCwd", {});
    const resolved = path.isAbsolute(base)
      ? base
      : path.resolve(await this.state.invoke("getCwd", {}), base);
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
  }

  async glob(params: { pattern: string }): Promise<string[]> {
    const cwd = await this.state.invoke("getCwd", {});
    const results: string[] = [];
    const globFn = (fs.promises as Record<string, unknown>)["glob"] as
      | ((pattern: string, opts: { cwd: string }) => AsyncIterable<string>)
      | undefined;
    if (!globFn) {
      throw new Error("fs.promises.glob is not available in this Node.js version (requires Node 22+).");
    }
    for await (const p of globFn(params.pattern, { cwd })) {
      results.push(path.resolve(cwd, p));
    }
    return results.sort();
  }

  async walk(params: { dirPath: string }): Promise<WalkResult> {
    const expanded = SettingsStore.expandHome(params.dirPath);
    const resolved = path.isAbsolute(expanded)
      ? expanded
      : path.resolve(await this.state.invoke("getCwd", {}), expanded);
    const dirents = await fs.promises.readdir(resolved, {
      recursive: true,
      withFileTypes: true,
    });
    const entries = [];
    for (const d of dirents) {
      if (entries.length >= 10_000) break;
      const parentPath = typeof d.parentPath === "string"
        ? d.parentPath
        : (d as unknown as { path: string }).path ?? resolved;
      entries.push({
        path: path.join(parentPath, d.name),
        type: direntToFileType(d),
      });
    }
    return { entries, truncated: dirents.length > 10_000 };
  }

  listen(connection: MessageConnection): void {
    registerFilesystemHandlers(connection, this);
  }

  asClient(clientConnection: MessageConnection): ReturnType<typeof createFilesystemClient> {
    return createFilesystemClient(clientConnection);
  }
}
