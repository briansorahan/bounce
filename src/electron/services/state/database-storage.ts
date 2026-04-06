import * as path from "path";
import { DatabaseManager } from "../../database";
import { SettingsStore } from "../../settings-store";
import type { IStateStorage } from "./storage";

/**
 * Production IStateStorage implementation backed by SQLite (DatabaseManager)
 * and a JSON settings file (SettingsStore).
 *
 * This is the only file in the state service that imports from `electron` or
 * uses native addons. It must never be imported by workflow tests — use
 * InMemoryStateStorage (tests/workflows/in-memory-storage.ts) instead.
 */
export class DatabaseStateStorage implements IStateStorage {
  private db: DatabaseManager;
  private settings: SettingsStore;

  constructor(dataDir: string) {
    this.db = new DatabaseManager(path.join(dataDir, "bounce.db"));
    this.settings = new SettingsStore(path.join(dataDir, "settings.json"));
  }

  storeRawSample(
    hash: string,
    filePath: string,
    sampleRate: number,
    channels: number,
    duration: number,
  ): void {
    this.db.storeRawSample(hash, filePath, sampleRate, channels, duration);
  }

  getSampleByHash(hash: string) {
    return this.db.getSampleByHash(hash) ?? null;
  }

  getRawMetadata(hash: string) {
    return this.db.getRawMetadata(hash) ?? null;
  }

  listSamples() {
    return this.db.listSamples();
  }

  getCwd() {
    return this.settings.getCwd();
  }

  setCwd(cwd: string): void {
    this.settings.setCwd(cwd);
  }

  getCurrentProject() {
    return this.db.getCurrentProject();
  }

  listProjects() {
    const current = this.db.getCurrentProjectName();
    return this.db.listProjects().map((p) => ({
      ...p,
      current: p.name === current,
    }));
  }

  loadProject(name: string) {
    const project = this.db.loadOrCreateProject(name);
    return { ...project, current: true };
  }

  removeProject(name: string) {
    const currentProject = this.db.removeProject(name);
    const current = this.db.getCurrentProjectName();
    return {
      removedName: name,
      currentProject: { ...currentProject, current: currentProject.name === current },
    };
  }

  close() {
    this.db.close();
  }

  /** Exposed for callers that need direct database access (e.g. IPC handlers
   *  that have not yet been migrated to use StateService). */
  get dbManager(): DatabaseManager {
    return this.db;
  }
}
