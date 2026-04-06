import * as path from "path";
import * as fs from "fs";
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
import type { EventBus } from "../../../shared/event-bus";
import type { ICwdQuery } from "../../../shared/query-interfaces";

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
 * Writes a CwdChangedEvent to the bus on cd(). Reads the current cwd via
 * ICwdQuery (InMemoryPersistenceService applies changes synchronously, so
 * getCwd() immediately reflects the new path after cd()).
 */
export class FilesystemService implements FilesystemHandlers {
  constructor(
    private bus: EventBus,
    private cwdQuery: ICwdQuery,
  ) {}

  async pwd(_params: Record<string, never>): Promise<string> {
    return this.cwdQuery.getCwd();
  }

  async cd(params: { dirPath: string }): Promise<string> {
    const resolved = SettingsStore.expandHome(params.dirPath);
    const cwd = await this.cwdQuery.getCwd();
    const abs = path.isAbsolute(resolved) ? resolved : path.resolve(cwd, resolved);
    const stat = await fs.promises.stat(abs);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${abs}`);
    }
    this.bus.emit({ type: "CwdChanged", cwd: abs });
    return abs;
  }

  async ls(params: { dirPath?: string; showHidden?: boolean }): Promise<LsResult> {
    const showHidden = params.showHidden ?? false;
    const cwd = await this.cwdQuery.getCwd();
    const base = params.dirPath ? SettingsStore.expandHome(params.dirPath) : cwd;
    const resolved = path.isAbsolute(base) ? base : path.resolve(cwd, base);
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
    const cwd = await this.cwdQuery.getCwd();
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
    const cwd = await this.cwdQuery.getCwd();
    const resolved = path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
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
