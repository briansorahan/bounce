import * as os from "os";
import type { IStateStorage } from "../../src/electron/services/state/storage";
import type {
  SampleRecord,
  SampleListRecord,
  RawSampleMetadata,
  ProjectRecord,
  ProjectListEntry,
} from "../../src/shared/rpc/state.rpc";

interface ProjectEntry {
  record: ProjectRecord;
  sampleHashes: Set<string>;
}

/**
 * In-memory IStateStorage for workflow tests.
 *
 * No SQLite, no native addons, no Electron. Backed entirely by plain Maps.
 * This is what lets workflow tests run under plain Node (tsx) rather than
 * requiring Electron as the runtime.
 */
export class InMemoryStateStorage implements IStateStorage {
  private samples = new Map<string, SampleRecord>();
  private rawMeta = new Map<string, RawSampleMetadata>();
  private nextSampleId = 1;
  private cwd: string = os.homedir();

  private projects = new Map<string, ProjectEntry>();
  private currentProjectName = "default";
  private nextProjectId = 2;

  constructor() {
    this.projects.set("default", {
      record: { id: 1, name: "default", created_at: new Date().toISOString() },
      sampleHashes: new Set(),
    });
  }

  storeRawSample(
    hash: string,
    filePath: string,
    sampleRate: number,
    channels: number,
    duration: number,
  ): void {
    if (!this.samples.has(hash)) {
      const id = this.nextSampleId++;
      this.samples.set(hash, {
        id,
        hash,
        sample_type: "raw",
        sample_rate: sampleRate,
        channels,
        duration,
      });
      this.rawMeta.set(hash, { sample_id: id, file_path: filePath });
    }
    // Associate with the current project (idempotent).
    this.projects.get(this.currentProjectName)?.sampleHashes.add(hash);
  }

  getSampleByHash(hash: string): SampleRecord | null {
    return this.samples.get(hash) ?? null;
  }

  getRawMetadata(hash: string): RawSampleMetadata | null {
    return this.rawMeta.get(hash) ?? null;
  }

  listSamples(): SampleListRecord[] {
    const proj = this.projects.get(this.currentProjectName);
    const hashes = proj?.sampleHashes ?? new Set<string>();
    return [...hashes]
      .map((hash) => {
        const s = this.samples.get(hash)!;
        return {
          ...s,
          display_name: this.rawMeta.get(hash)?.file_path ?? null,
          created_at: new Date().toISOString(),
        };
      });
  }

  getCwd(): string {
    return this.cwd;
  }

  setCwd(cwd: string): void {
    this.cwd = cwd;
  }

  getCurrentProject(): ProjectRecord {
    return this.projects.get(this.currentProjectName)!.record;
  }

  listProjects(): ProjectListEntry[] {
    return [...this.projects.values()]
      .map(({ record, sampleHashes }) => ({
        ...record,
        sample_count: sampleHashes.size,
        feature_count: 0,
        command_count: 0,
        current: record.name === this.currentProjectName,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  loadProject(name: string): ProjectListEntry {
    if (!this.projects.has(name)) {
      const id = this.nextProjectId++;
      this.projects.set(name, {
        record: { id, name, created_at: new Date().toISOString() },
        sampleHashes: new Set(),
      });
    }
    this.currentProjectName = name;
    const { record, sampleHashes } = this.projects.get(name)!;
    return { ...record, sample_count: sampleHashes.size, feature_count: 0, command_count: 0, current: true };
  }

  removeProject(name: string): { removedName: string; currentProject: ProjectListEntry } {
    const target = this.projects.get(name);
    if (!target) {
      throw new Error(`Project "${name}" does not exist.`);
    }
    if (this.currentProjectName === name) {
      throw new Error(`Cannot remove the current project "${name}". Load a different project first.`);
    }
    this.projects.delete(name);
    const { record, sampleHashes } = this.projects.get(this.currentProjectName)!;
    return {
      removedName: name,
      currentProject: {
        ...record,
        sample_count: sampleHashes.size,
        feature_count: 0,
        command_count: 0,
        current: true,
      },
    };
  }

  close(): void {
    // nothing to close
  }
}
