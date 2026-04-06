import type {
  SampleRecord,
  SampleListRecord,
  RawSampleMetadata,
  ProjectRecord,
} from "../../../shared/rpc/state.rpc";

/**
 * Abstract storage interface for StateService.
 *
 * Separates the business contract of StateService from its persistence
 * implementation. Two implementations exist:
 *
 *   DatabaseStateStorage  — backed by SQLite (DatabaseManager) and a JSON
 *                           settings file (SettingsStore). Used in production
 *                           and in Electron-based integration tests.
 *
 *   InMemoryStateStorage  — backed by plain Maps. Used in workflow tests
 *                           that run under system Node (tsx). No native
 *                           addons, no Electron dependency.
 *
 * This boundary is also what enables future persistence backends (e.g. a
 * remote state server for the CLI) without changing any service logic.
 */
export interface IStateStorage {
  storeRawSample(
    hash: string,
    filePath: string,
    sampleRate: number,
    channels: number,
    duration: number,
  ): void;
  getSampleByHash(hash: string): SampleRecord | null;
  getRawMetadata(hash: string): RawSampleMetadata | null;
  listSamples(): SampleListRecord[];
  getCwd(): string;
  getCurrentProject(): ProjectRecord;
  close(): void;
}
