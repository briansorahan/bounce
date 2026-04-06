import * as os from "os";
import type { IStateStorage } from "../../src/electron/services/state/storage";
import type {
  SampleRecord,
  SampleListRecord,
  RawSampleMetadata,
  ProjectRecord,
} from "../../src/shared/rpc/state.rpc";

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
  private nextId = 1;
  private cwd: string = os.homedir();
  private project: ProjectRecord = {
    id: 1,
    name: "default",
    created_at: new Date().toISOString(),
  };

  storeRawSample(
    hash: string,
    filePath: string,
    sampleRate: number,
    channels: number,
    duration: number,
  ): void {
    if (this.samples.has(hash)) return; // idempotent
    const id = this.nextId++;
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

  getSampleByHash(hash: string): SampleRecord | null {
    return this.samples.get(hash) ?? null;
  }

  getRawMetadata(hash: string): RawSampleMetadata | null {
    return this.rawMeta.get(hash) ?? null;
  }

  listSamples(): SampleListRecord[] {
    return [...this.samples.values()].map((s) => ({
      ...s,
      display_name: this.rawMeta.get(s.hash)?.file_path ?? null,
      created_at: new Date().toISOString(),
    }));
  }

  getCwd(): string {
    return this.cwd;
  }

  setCwd(cwd: string): void {
    this.cwd = cwd;
  }

  getCurrentProject(): ProjectRecord {
    return this.project;
  }

  close(): void {
    // nothing to close
  }
}
