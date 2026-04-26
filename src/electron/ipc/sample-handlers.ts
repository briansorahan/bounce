import { ipcMain } from "electron";
import { GrainsOptions } from "../database";
import { BounceError } from "../../shared/bounce-error.js";
import { resolveAudioData } from "../audio-resolver";
import type { HandlerDeps } from "./register";

export function registerSampleHandlers(deps: HandlerDeps): void {
  ipcMain.handle("list-samples", async () => {
    try {
      if (!deps.dbManager) {
        throw new BounceError("SAMPLE_DB_NOT_READY", "Database not initialized");
      }
      return deps.dbManager.listSamples();
    } catch (error) {
      if (error instanceof BounceError) throw error;
      console.error("Failed to list samples:", error);
      throw new BounceError("SAMPLE_LIST_FAILED", `Failed to list samples: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle("get-sample-by-hash", async (_event, hash: string) => {
    try {
      if (!deps.dbManager) {
        throw new BounceError("SAMPLE_DB_NOT_READY", "Database not initialized");
      }
      const sample = deps.dbManager.getSampleByHash(hash);
      if (!sample) return undefined;
      // Include display_name for renderer convenience
      const rawMeta = deps.dbManager.getRawMetadata(sample.hash);
      const recMeta = rawMeta ? undefined : deps.dbManager.getRecordedMetadata(sample.hash);
      const display_name = rawMeta?.file_path ?? recMeta?.name ?? null;
      return { ...sample, display_name };
    } catch (error) {
      if (error instanceof BounceError) throw error;
      console.error("Failed to get sample:", error);
      throw new BounceError("SAMPLE_LOOKUP_FAILED", `Failed to get sample: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle("complete-sample-hash", async (_event, prefix: string) => {
    try {
      if (!deps.dbManager) {
        return [];
      }
      const samples = deps.dbManager.listSamples();
      return samples
        .filter((s) => s.hash.startsWith(prefix))
        .map((s) => ({
          hash: s.hash.substring(0, 8),
          filePath: s.display_name,
        }));
    } catch {
      return [];
    }
  });

  ipcMain.handle("get-sample-by-name", async (_event, name: string) => {
    if (!deps.dbManager) return null;
    // Try recording name first, then file path
    const sample =
      deps.dbManager.getSampleByRecordingName(name) ??
      deps.dbManager.getSampleByFilePath(name);
    if (!sample) return null;
    return {
      id: sample.id,
      hash: sample.hash,
      sample_type: sample.sample_type,
      sample_rate: sample.sample_rate,
      channels: sample.channels,
      duration: sample.duration,
    };
  });

  ipcMain.handle(
    "create-slice-samples",
    async (_event, sampleHash: string, featureHash: string) => {
      try {
        if (!deps.dbManager) {
          throw new BounceError("SAMPLE_DB_NOT_READY", "Database not initialized");
        }
        const resolved = await resolveAudioData(deps.dbManager, sampleHash);
        return deps.dbManager.createSliceSamples(sampleHash, featureHash, resolved.audioData);
      } catch (error) {
        if (error instanceof BounceError) throw error;
        throw new BounceError("SAMPLE_SLICE_FAILED", `Failed to create slice samples: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );

  ipcMain.handle(
    "get-derived-samples",
    async (_event, sourceHash: string, featureHash: string) => {
      try {
        if (!deps.dbManager) {
          throw new BounceError("SAMPLE_DB_NOT_READY", "Database not initialized");
        }
        return deps.dbManager.getDerivedSamples(sourceHash, featureHash);
      } catch (error) {
        if (error instanceof BounceError) throw error;
        console.error("Failed to get derived samples:", error);
        throw new BounceError("SAMPLE_DERIVED_LOOKUP_FAILED", `Failed to get derived samples: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );

  ipcMain.handle(
    "get-derived-sample-by-index",
    async (
      _event,
      sourceHash: string,
      featureHash: string,
      index: number,
    ) => {
      try {
        if (!deps.dbManager) {
          throw new BounceError("SAMPLE_DB_NOT_READY", "Database not initialized");
        }
        const sample = deps.dbManager.getDerivedSampleByIndex(sourceHash, featureHash, index);
        if (!sample) return null;
        // Resolve audio on the fly so the renderer gets it in the response
        const resolved = await resolveAudioData(deps.dbManager, sample.hash);
        return {
          ...sample,
          audio_data: Buffer.from(resolved.audioData.buffer, resolved.audioData.byteOffset, resolved.audioData.byteLength),
        };
      } catch (error) {
        if (error instanceof BounceError) throw error;
        console.error("Failed to get derived sample by index:", error);
        throw new BounceError("SAMPLE_DERIVED_INDEX_FAILED", `Failed to get derived sample by index: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );

  ipcMain.handle("list-derived-samples-summary", async () => {
    try {
      if (!deps.dbManager) {
        throw new BounceError("SAMPLE_DB_NOT_READY", "Database not initialized");
      }
      return deps.dbManager.listDerivedSamplesSummary();
    } catch (error) {
      if (error instanceof BounceError) throw error;
      console.error("Failed to list derived samples summary:", error);
      throw new BounceError("SAMPLE_DERIVED_LIST_FAILED", `Failed to list derived samples summary: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ipcMain.handle(
    "grains-sample",
    async (_event, sourceHash: string, options?: GrainsOptions) => {
      try {
        if (!deps.dbManager) {
          throw new BounceError("SAMPLE_DB_NOT_READY", "Database not initialized");
        }
        const resolved = await resolveAudioData(deps.dbManager, sourceHash);
        return deps.dbManager.grains(sourceHash, options ?? {}, resolved.audioData);
      } catch (error) {
        if (error instanceof BounceError) throw error;
        throw new BounceError("SAMPLE_GRAINS_FAILED", `Failed to grains sample: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );
}
