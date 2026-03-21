import { MFCCFeature, SpectralShapeFeature, Normalization, KDTree } from "../index";
import type { DatabaseManager } from "./database";
import { resolveAudioData } from "./audio-resolver";

export interface CorpusSegment {
  hash: string;
  audio: Float32Array;
  sampleRate: number;
  features: number[];
}

export interface CorpusQueryResult {
  id: string;
  index: number;
  distance: number;
}

export interface CorpusBuildResult {
  segmentCount: number;
  featureDims: number;
}

function averageFrames(frames: number[][]): number[] {
  if (frames.length === 0) return [];
  const n = frames[0].length;
  const avg = new Array<number>(n).fill(0);
  for (const frame of frames) {
    for (let i = 0; i < n; i++) avg[i] += frame[i];
  }
  return avg.map((v) => v / frames.length);
}

export class CorpusManager {
  private segments: CorpusSegment[] = [];
  private normalization = new Normalization();
  private kdtree = new KDTree();
  private mfcc = new MFCCFeature();
  private spectralShape = new SpectralShapeFeature();
  private _built = false;

  get size(): number {
    return this.segments.length;
  }

  get built(): boolean {
    return this._built;
  }

  /**
   * Build the corpus from derived samples stored in the database.
   * Fetches all slices for (sourceHash, featureHash), extracts 20-dim features
   * (13 MFCCs + 7 SpectralShape), normalises, and inserts into the KDTree.
   */
  async build(
    dbManager: DatabaseManager,
    sourceHash: string,
    featureHash: string,
  ): Promise<CorpusBuildResult> {
    const links = dbManager.getDerivedSamples(sourceHash, featureHash);

    if (links.length === 0) {
      throw new Error(
        `No derived samples found for source=${sourceHash.substring(0, 8)} feature=${featureHash.substring(0, 8)}. ` +
        `Run slice() first.`,
      );
    }

    this.segments = [];
    this.normalization.clear();
    this.kdtree.clear();
    this._built = false;

    const rawFeatures: number[][] = [];

    for (const link of links) {
      const record = dbManager.getSampleByHash(link.sample_hash);
      if (!record) continue;

      const resolved = await resolveAudioData(dbManager, link.sample_hash);
      const audio = resolved.audioData;

      // 13 averaged MFCC coefficients
      const mfccFrames = this.mfcc.process(audio);
      const avgMfcc = mfccFrames.length > 0 ? averageFrames(mfccFrames) : new Array(13).fill(0);

      // 7 averaged SpectralShape descriptors
      const spectral = this.spectralShape.process(audio);
      const spectralVec = [
        spectral.centroid, spectral.spread, spectral.skewness, spectral.kurtosis,
        spectral.rolloff, spectral.flatness, spectral.crest,
      ];

      const features = [...avgMfcc, ...spectralVec];

      this.segments.push({ hash: link.sample_hash, audio, sampleRate: record.sample_rate, features });
      rawFeatures.push(features);
    }

    if (this.segments.length === 0) {
      throw new Error("Could not load audio data for any derived samples.");
    }

    // Fit normalisation on the full feature matrix, then insert normalised points
    this.normalization.fit(rawFeatures);
    const normalizedFeatures = this.normalization.transform(rawFeatures);

    for (let i = 0; i < normalizedFeatures.length; i++) {
      this.kdtree.addPoint(String(i), normalizedFeatures[i]);
    }

    this._built = true;
    return { segmentCount: this.segments.length, featureDims: rawFeatures[0]?.length ?? 0 };
  }

  /**
   * Find the k nearest corpus segments to the segment at segmentIndex.
   */
  query(segmentIndex: number, k = 5): CorpusQueryResult[] {
    if (!this._built) throw new Error("Corpus not built; call corpus.build() first.");
    if (segmentIndex < 0 || segmentIndex >= this.segments.length) {
      throw new Error(`Segment index ${segmentIndex} out of range [0, ${this.segments.length - 1}].`);
    }

    const rawFeature = this.segments[segmentIndex].features;
    const normalizedFeature = this.normalization.transformFrame(rawFeature);
    const knnResults = this.kdtree.kNearest(normalizedFeature, k);

    return knnResults.map((r) => ({
      id: r.id,
      index: parseInt(r.id, 10),
      distance: r.distance,
    }));
  }

  /**
   * Concatenate the audio buffers for the given segment indices.
   * Returns a plain Float32Array safe for IPC transfer.
   * Also returns the sample rate of the first segment.
   */
  resynthesize(indices: number[]): { audio: Float32Array; sampleRate: number } {
    if (!this._built) throw new Error("Corpus not built; call corpus.build() first.");

    const segs = indices.map((i) => {
      if (i < 0 || i >= this.segments.length) {
        throw new Error(`Segment index ${i} out of range [0, ${this.segments.length - 1}].`);
      }
      return this.segments[i];
    });

    const sampleRate = segs[0]?.sampleRate ?? 44100;
    const totalLength = segs.reduce((sum, s) => sum + s.audio.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const seg of segs) {
      result.set(seg.audio, offset);
      offset += seg.audio.length;
    }

    return { audio: result, sampleRate };
  }
}
