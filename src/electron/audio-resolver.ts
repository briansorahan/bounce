import * as fs from "fs";
import decode from "audio-decode";
import type { DatabaseManager } from "./database";

export interface ResolvedAudio {
  audioData: Float32Array;
  sampleRate: number;
}

/**
 * Resolves sample audio data on demand based on sample_type.
 * - raw: reads from filesystem
 * - recorded/freesound: reads from metadata table
 * - derived: recomputes from source sample + feature data
 */
export async function resolveAudioData(
  dbManager: DatabaseManager,
  hash: string,
): Promise<ResolvedAudio> {
  const sample = dbManager.getSampleByHash(hash);
  if (!sample) {
    throw new Error(`Sample not found: ${hash}`);
  }

  switch (sample.sample_type) {
    case "raw":
      return resolveRaw(dbManager, sample.hash, sample.sample_rate);
    case "recorded":
      return resolveRecorded(dbManager, sample.hash, sample.sample_rate);
    case "freesound":
      return resolveFreesound(dbManager, sample.hash, sample.sample_rate);
    case "derived":
      return resolveDerived(dbManager, sample.hash, sample.sample_rate);
    default:
      throw new Error(`Unknown sample type: ${sample.sample_type}`);
  }
}

async function resolveRaw(
  dbManager: DatabaseManager,
  hash: string,
  _sampleRate: number,
): Promise<ResolvedAudio> {
  const meta = dbManager.getRawMetadata(hash);
  if (!meta) {
    throw new Error(`Raw metadata not found for sample: ${hash.substring(0, 8)}`);
  }
  const fileBuffer = fs.readFileSync(meta.file_path);
  const audioBuffer = await decode(fileBuffer);
  const channelData = audioBuffer.getChannelData(0);
  return { audioData: channelData, sampleRate: audioBuffer.sampleRate };
}

function resolveRecorded(
  dbManager: DatabaseManager,
  hash: string,
  sampleRate: number,
): Promise<ResolvedAudio> {
  const meta = dbManager.getRecordedMetadata(hash);
  if (!meta) {
    throw new Error(`Recorded metadata not found for sample: ${hash.substring(0, 8)}`);
  }
  const audioData = new Float32Array(
    meta.audio_data.buffer,
    meta.audio_data.byteOffset,
    meta.audio_data.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
  return Promise.resolve({ audioData, sampleRate });
}

function resolveFreesound(
  dbManager: DatabaseManager,
  hash: string,
  sampleRate: number,
): Promise<ResolvedAudio> {
  const meta = dbManager.getFreesoundMetadata(hash);
  if (!meta) {
    throw new Error(`Freesound metadata not found for sample: ${hash.substring(0, 8)}`);
  }
  const audioData = new Float32Array(
    meta.audio_data.buffer,
    meta.audio_data.byteOffset,
    meta.audio_data.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
  return Promise.resolve({ audioData, sampleRate });
}

async function resolveDerived(
  dbManager: DatabaseManager,
  hash: string,
  sampleRate: number,
): Promise<ResolvedAudio> {
  const link = dbManager.getDerivedSampleLink(hash);
  if (!link) {
    throw new Error(`No derivation link found for sample: ${hash.substring(0, 8)}`);
  }

  const feature = dbManager.getFeatureByHash(link.source_hash, link.feature_hash);
  if (!feature) {
    throw new Error(
      `Feature not found: source=${link.source_hash.substring(0, 8)} feature=${link.feature_hash.substring(0, 8)}`,
    );
  }

  // Resolve source audio (recursive — source may itself be derived)
  const source = await resolveAudioData(dbManager, link.source_hash);

  switch (feature.feature_type) {
    case "onset":
    case "onset-slice":
    case "grains": {
      const positions = JSON.parse(feature.feature_data) as number[];
      return resolveSliceOrGrain(source, positions, link.index_order, feature.feature_type, sampleRate);
    }
    case "nmf-sep":
    case "nmf-cross": {
      // NMF recomputation requires the native addon — this is handled by the
      // NMF IPC handlers which cache component audio in memory during the session.
      // If cache is cold (e.g. app restart), we can't cheaply recompute here.
      throw new Error(
        `NMF component audio must be recomputed. Run sep() or nx() again on the source sample.`,
      );
    }
    default:
      throw new Error(`Unknown feature type for derived sample: ${feature.feature_type}`);
  }
}

function resolveSliceOrGrain(
  source: ResolvedAudio,
  positions: number[],
  index: number,
  featureType: string,
  _sampleRate: number,
): Promise<ResolvedAudio> {
  if (featureType === "onset" || featureType === "onset-slice") {
    if (index >= positions.length - 1) {
      throw new Error(`Slice index ${index} out of range (${positions.length - 1} slices)`);
    }
    const start = positions[index];
    const end = positions[index + 1];
    const sliceAudio = source.audioData.slice(start, end);
    return Promise.resolve({ audioData: sliceAudio, sampleRate: source.sampleRate });
  }

  // grains: positions are grain start positions, need grain size from options
  // For grains, the duration is stored in the derived sample metadata, so we compute
  // the grain size from that.
  if (featureType === "grains") {
    if (index >= positions.length) {
      throw new Error(`Grain index ${index} out of range (${positions.length} grains)`);
    }
    const start = positions[index];
    // Grain end: use next position or end of audio if last grain
    const end = index + 1 < positions.length
      ? positions[index + 1]
      : source.audioData.length;
    // Use a fixed grain size based on the gap between adjacent positions as approximation
    const grainAudio = source.audioData.slice(start, end);
    return Promise.resolve({ audioData: grainAudio, sampleRate: source.sampleRate });
  }

  throw new Error(`Unsupported feature type: ${featureType}`);
}
