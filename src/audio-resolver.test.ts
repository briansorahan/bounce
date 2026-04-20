/**
 * Unit tests for src/electron/audio-resolver.ts
 *
 * Covers the resolveAudioData function for all sample types except "raw"
 * (which requires fs.readFileSync + audio-decode and is skipped here).
 * Special focus on the derived sample resolution paths, including slice/grain
 * index boundary conditions.
 */

import { test } from "vitest";
import assert from "node:assert/strict";
import type { DatabaseManager } from "./electron/database";
import { resolveAudioData } from "./electron/audio-resolver";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a Float32Array from an ordinary number array, packed into a Buffer. */
function makeAudioBuffer(samples: number[]): Buffer {
  const f32 = new Float32Array(samples);
  return Buffer.from(f32.buffer);
}

/** Sample-rate used across all tests. */
const SR = 44100;

/** Short synthetic audio: 10 samples, values 0–9. */
const RAW_SAMPLES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

// ---------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // resolveAudioData — sample not found
  // -------------------------------------------------------------------------


test("resolveAudioData — sample not found", async () => {

  const db = {
    getSampleByHash: (_hash: string) => undefined,
  } as unknown as DatabaseManager;

  await assert.rejects(
    () => resolveAudioData(db, "deadbeef"),
    /Sample not found: deadbeef/,
    "throws when getSampleByHash returns undefined",
  );

});

  // -------------------------------------------------------------------------
  // resolveAudioData — unknown sample type
  // -------------------------------------------------------------------------


test("resolveAudioData — unknown sample type", async () => {

  const db = {
    getSampleByHash: (_hash: string) => ({
      id: 1,
      hash: "aabbccdd",
      sample_type: "mystery" as never,
      sample_rate: SR,
      channels: 1,
      duration: 1.0,
    }),
  } as unknown as DatabaseManager;

  await assert.rejects(
    () => resolveAudioData(db, "aabbccdd"),
    /Unknown sample type: mystery/,
    "throws on unrecognised sample_type",
  );

});

  // -------------------------------------------------------------------------
  // resolveAudioData — recorded sample
  // -------------------------------------------------------------------------


test("resolveAudioData — recorded sample", async () => {

  const audioBuf = makeAudioBuffer(RAW_SAMPLES);

  const db = {
    getSampleByHash: (_hash: string) => ({
      id: 2,
      hash: "rec00001",
      sample_type: "recorded",
      sample_rate: SR,
      channels: 1,
      duration: RAW_SAMPLES.length / SR,
    }),
    getRecordedMetadata: (_hash: string) => ({
      sample_id: 2,
      name: "test-recording",
      audio_data: audioBuf,
    }),
  } as unknown as DatabaseManager;

  const result = await resolveAudioData(db, "rec00001");

  assert.equal(result.sampleRate, SR, "sampleRate matches the sample record");
  assert.equal(result.audioData.length, RAW_SAMPLES.length, "audioData has expected length");
  for (let i = 0; i < RAW_SAMPLES.length; i++) {
    assert.ok(
      Math.abs(result.audioData[i] - RAW_SAMPLES[i]) < 1e-6,
      `audioData[${i}] equals ${RAW_SAMPLES[i]}`,
    );
  }

});

  // -------------------------------------------------------------------------
  // resolveAudioData — freesound sample
  // -------------------------------------------------------------------------


test("resolveAudioData — freesound sample", async () => {

  const audioBuf = makeAudioBuffer(RAW_SAMPLES);

  const db = {
    getSampleByHash: (_hash: string) => ({
      id: 3,
      hash: "fs000001",
      sample_type: "freesound",
      sample_rate: SR,
      channels: 1,
      duration: RAW_SAMPLES.length / SR,
    }),
    getFreesoundMetadata: (_hash: string) => ({
      sample_id: 3,
      url: "https://freesound.org/s/1/",
      audio_data: audioBuf,
    }),
  } as unknown as DatabaseManager;

  const result = await resolveAudioData(db, "fs000001");

  assert.equal(result.sampleRate, SR, "sampleRate matches the sample record");
  assert.equal(result.audioData.length, RAW_SAMPLES.length, "audioData has expected length");
  for (let i = 0; i < RAW_SAMPLES.length; i++) {
    assert.ok(
      Math.abs(result.audioData[i] - RAW_SAMPLES[i]) < 1e-6,
      `freesound audioData[${i}] equals ${RAW_SAMPLES[i]}`,
    );
  }

});

  // -------------------------------------------------------------------------
  // resolveAudioData — derived + onset-slice feature (slices correctly)
  // -------------------------------------------------------------------------


test("resolveAudioData — derived + onset-slice", async () => {

  // Source: 10 samples [0..9], recorded type
  // Feature: onset-slice positions [0, 4, 8, 10] → 3 slices
  // We resolve index 1 → samples [4, 5, 6, 7]
  const sourceAudio = makeAudioBuffer(RAW_SAMPLES);
  const positions = [0, 4, 8, 10];
  const targetIndex = 1;

  const db = {
    getSampleByHash: (hash: string) => {
      if (hash === "derived01") {
        return { id: 10, hash: "derived01", sample_type: "derived", sample_rate: SR, channels: 1, duration: 0 };
      }
      if (hash === "source001") {
        return { id: 11, hash: "source001", sample_type: "recorded", sample_rate: SR, channels: 1, duration: 0 };
      }
      return undefined;
    },
    getDerivedSampleLink: (_hash: string) => ({
      sample_hash: "derived01",
      source_hash: "source001",
      feature_hash: "feat0001",
      index_order: targetIndex,
    }),
    getFeatureByHash: (_src: string, _feat: string) => ({
      id: 20,
      sample_hash: "source001",
      feature_hash: "feat0001",
      feature_type: "onset-slice",
      feature_data: JSON.stringify(positions),
      options: null,
    }),
    getRecordedMetadata: (_hash: string) => ({
      sample_id: 11,
      name: "source",
      audio_data: sourceAudio,
    }),
  } as unknown as DatabaseManager;

  const result = await resolveAudioData(db, "derived01");

  // Slice 1: positions[1]=4 to positions[2]=8 → 4 samples: [4, 5, 6, 7]
  const expectedSlice = [4, 5, 6, 7];
  assert.equal(result.audioData.length, expectedSlice.length, "onset-slice has correct length");
  for (let i = 0; i < expectedSlice.length; i++) {
    assert.ok(
      Math.abs(result.audioData[i] - expectedSlice[i]) < 1e-6,
      `onset-slice audioData[${i}] = ${expectedSlice[i]}`,
    );
  }
  assert.equal(result.sampleRate, SR, "onset-slice sampleRate is source sampleRate");

});

  // -------------------------------------------------------------------------
  // resolveAudioData — derived + onset feature (legacy type, slices correctly)
  // -------------------------------------------------------------------------


test("resolveAudioData — derived + onset (legacy)", async () => {

  // positions [0, 5, 10], index 0 → samples [0..4]
  const sourceAudio = makeAudioBuffer(RAW_SAMPLES);
  const positions = [0, 5, 10];

  const db = {
    getSampleByHash: (hash: string) => {
      if (hash === "derived02") {
        return { id: 12, hash: "derived02", sample_type: "derived", sample_rate: SR, channels: 1, duration: 0 };
      }
      if (hash === "source002") {
        return { id: 13, hash: "source002", sample_type: "recorded", sample_rate: SR, channels: 1, duration: 0 };
      }
      return undefined;
    },
    getDerivedSampleLink: (_hash: string) => ({
      sample_hash: "derived02",
      source_hash: "source002",
      feature_hash: "feat0002",
      index_order: 0,
    }),
    getFeatureByHash: (_src: string, _feat: string) => ({
      id: 21,
      sample_hash: "source002",
      feature_hash: "feat0002",
      feature_type: "onset",
      feature_data: JSON.stringify(positions),
      options: null,
    }),
    getRecordedMetadata: (_hash: string) => ({
      sample_id: 13,
      name: "source2",
      audio_data: sourceAudio,
    }),
  } as unknown as DatabaseManager;

  const result = await resolveAudioData(db, "derived02");

  // Slice 0: positions[0]=0 to positions[1]=5 → 5 samples: [0, 1, 2, 3, 4]
  assert.equal(result.audioData.length, 5, "onset slice has 5 samples");
  for (let i = 0; i < 5; i++) {
    assert.ok(Math.abs(result.audioData[i] - i) < 1e-6, `onset audioData[${i}] = ${i}`);
  }

});

  // -------------------------------------------------------------------------
  // resolveAudioData — derived + granularize (grains correct, last extends to end)
  // -------------------------------------------------------------------------


test("resolveAudioData — derived + granularize", async () => {

  // Source: 10 samples [0..9]
  // Grain positions: [0, 3, 7] — 3 grains
  //   grain 0: [0..2]  (3 samples)
  //   grain 1: [3..6]  (4 samples)
  //   grain 2: [7..9]  (3 samples — last grain extends to end of audio)
  const sourceAudio = makeAudioBuffer(RAW_SAMPLES);
  const positions = [0, 3, 7];

  const makeDb = (index: number) => ({
    getSampleByHash: (hash: string) => {
      if (hash === "derived03") {
        return { id: 14, hash: "derived03", sample_type: "derived", sample_rate: SR, channels: 1, duration: 0 };
      }
      if (hash === "source003") {
        return { id: 15, hash: "source003", sample_type: "recorded", sample_rate: SR, channels: 1, duration: 0 };
      }
      return undefined;
    },
    getDerivedSampleLink: (_hash: string) => ({
      sample_hash: "derived03",
      source_hash: "source003",
      feature_hash: "feat0003",
      index_order: index,
    }),
    getFeatureByHash: (_src: string, _feat: string) => ({
      id: 22,
      sample_hash: "source003",
      feature_hash: "feat0003",
      feature_type: "granularize",
      feature_data: JSON.stringify(positions),
      options: null,
    }),
    getRecordedMetadata: (_hash: string) => ({
      sample_id: 15,
      name: "source3",
      audio_data: sourceAudio,
    }),
  } as unknown as DatabaseManager);

  // Grain 0: samples 0, 1, 2
  const g0 = await resolveAudioData(makeDb(0), "derived03");
  assert.equal(g0.audioData.length, 3, "grain 0 has 3 samples");
  assert.ok(Math.abs(g0.audioData[0] - 0) < 1e-6, "grain 0 starts at sample 0");
  assert.ok(Math.abs(g0.audioData[2] - 2) < 1e-6, "grain 0 ends at sample 2");

  // Grain 1: samples 3, 4, 5, 6
  const g1 = await resolveAudioData(makeDb(1), "derived03");
  assert.equal(g1.audioData.length, 4, "grain 1 has 4 samples");
  assert.ok(Math.abs(g1.audioData[0] - 3) < 1e-6, "grain 1 starts at sample 3");
  assert.ok(Math.abs(g1.audioData[3] - 6) < 1e-6, "grain 1 ends at sample 6");

  // Grain 2 (last): samples 7, 8, 9 — end extends to source.audioData.length
  const g2 = await resolveAudioData(makeDb(2), "derived03");
  assert.equal(g2.audioData.length, 3, "last grain extends to end of audio (3 samples)");
  assert.ok(Math.abs(g2.audioData[0] - 7) < 1e-6, "last grain starts at sample 7");
  assert.ok(Math.abs(g2.audioData[2] - 9) < 1e-6, "last grain ends at sample 9");

});

  // -------------------------------------------------------------------------
  // resolveAudioData — derived + nmf-sep → throws recomputation error
  // -------------------------------------------------------------------------


test("resolveAudioData — derived + nmf-sep", async () => {

  const sourceAudio = makeAudioBuffer(RAW_SAMPLES);

  const db = {
    getSampleByHash: (hash: string) => {
      if (hash === "derived04") {
        return { id: 16, hash: "derived04", sample_type: "derived", sample_rate: SR, channels: 1, duration: 0 };
      }
      if (hash === "source004") {
        return { id: 17, hash: "source004", sample_type: "recorded", sample_rate: SR, channels: 1, duration: 0 };
      }
      return undefined;
    },
    getDerivedSampleLink: (_hash: string) => ({
      sample_hash: "derived04",
      source_hash: "source004",
      feature_hash: "feat0004",
      index_order: 0,
    }),
    getFeatureByHash: (_src: string, _feat: string) => ({
      id: 23,
      sample_hash: "source004",
      feature_hash: "feat0004",
      feature_type: "nmf-sep",
      feature_data: "[]",
      options: null,
    }),
    getRecordedMetadata: (_hash: string) => ({
      sample_id: 17,
      name: "source4",
      audio_data: sourceAudio,
    }),
  } as unknown as DatabaseManager;

  await assert.rejects(
    () => resolveAudioData(db, "derived04"),
    /NMF component audio must be recomputed/,
    "nmf-sep throws recomputation error",
  );

});

  // -------------------------------------------------------------------------
  // resolveAudioData — derived + nmf-cross → same recomputation error
  // -------------------------------------------------------------------------


test("resolveAudioData — derived + nmf-cross", async () => {

  const sourceAudio = makeAudioBuffer(RAW_SAMPLES);

  const db = {
    getSampleByHash: (hash: string) => {
      if (hash === "derived05") {
        return { id: 18, hash: "derived05", sample_type: "derived", sample_rate: SR, channels: 1, duration: 0 };
      }
      if (hash === "source005") {
        return { id: 19, hash: "source005", sample_type: "recorded", sample_rate: SR, channels: 1, duration: 0 };
      }
      return undefined;
    },
    getDerivedSampleLink: (_hash: string) => ({
      sample_hash: "derived05",
      source_hash: "source005",
      feature_hash: "feat0005",
      index_order: 0,
    }),
    getFeatureByHash: (_src: string, _feat: string) => ({
      id: 24,
      sample_hash: "source005",
      feature_hash: "feat0005",
      feature_type: "nmf-cross",
      feature_data: "[]",
      options: null,
    }),
    getRecordedMetadata: (_hash: string) => ({
      sample_id: 19,
      name: "source5",
      audio_data: sourceAudio,
    }),
  } as unknown as DatabaseManager;

  await assert.rejects(
    () => resolveAudioData(db, "derived05"),
    /NMF component audio must be recomputed/,
    "nmf-cross throws recomputation error",
  );

});

  // -------------------------------------------------------------------------
  // resolveAudioData — derived + unknown feature type
  // -------------------------------------------------------------------------


test("resolveAudioData — derived + unknown feature type", async () => {

  const sourceAudio = makeAudioBuffer(RAW_SAMPLES);

  const db = {
    getSampleByHash: (hash: string) => {
      if (hash === "derived06") {
        return { id: 20, hash: "derived06", sample_type: "derived", sample_rate: SR, channels: 1, duration: 0 };
      }
      if (hash === "source006") {
        return { id: 21, hash: "source006", sample_type: "recorded", sample_rate: SR, channels: 1, duration: 0 };
      }
      return undefined;
    },
    getDerivedSampleLink: (_hash: string) => ({
      sample_hash: "derived06",
      source_hash: "source006",
      feature_hash: "feat0006",
      index_order: 0,
    }),
    getFeatureByHash: (_src: string, _feat: string) => ({
      id: 25,
      sample_hash: "source006",
      feature_hash: "feat0006",
      feature_type: "spectral-warp", // unknown type
      feature_data: "[]",
      options: null,
    }),
    getRecordedMetadata: (_hash: string) => ({
      sample_id: 21,
      name: "source6",
      audio_data: sourceAudio,
    }),
  } as unknown as DatabaseManager;

  await assert.rejects(
    () => resolveAudioData(db, "derived06"),
    /Unknown feature type for derived sample: spectral-warp/,
    "unknown feature_type throws descriptive error",
  );

});

  // -------------------------------------------------------------------------
  // resolveAudioData — derived + no derivation link
  // -------------------------------------------------------------------------


test("resolveAudioData — derived + no link", async () => {

  const db = {
    getSampleByHash: (_hash: string) => ({
      id: 22,
      hash: "derived07",
      sample_type: "derived",
      sample_rate: SR,
      channels: 1,
      duration: 0,
    }),
    getDerivedSampleLink: (_hash: string) => undefined,
  } as unknown as DatabaseManager;

  await assert.rejects(
    () => resolveAudioData(db, "derived07"),
    /No derivation link found for sample: derived0/,
    "throws when getDerivedSampleLink returns undefined",
  );

});

  // -------------------------------------------------------------------------
  // resolveAudioData — derived + no feature record
  // -------------------------------------------------------------------------


test("resolveAudioData — derived + no feature", async () => {

  const db = {
    getSampleByHash: (_hash: string) => ({
      id: 23,
      hash: "derived08",
      sample_type: "derived",
      sample_rate: SR,
      channels: 1,
      duration: 0,
    }),
    getDerivedSampleLink: (_hash: string) => ({
      sample_hash: "derived08",
      source_hash: "source008",
      feature_hash: "feat0008",
      index_order: 0,
    }),
    getFeatureByHash: (_src: string, _feat: string) => undefined,
  } as unknown as DatabaseManager;

  await assert.rejects(
    () => resolveAudioData(db, "derived08"),
    /Feature not found/,
    "throws when getFeatureByHash returns undefined",
  );

});

  // -------------------------------------------------------------------------
  // onset-slice — index out of range
  // -------------------------------------------------------------------------


test("onset-slice — index out of range", async () => {

  // positions has 3 entries → 2 slices (valid indices: 0, 1)
  // index 2 is out of range
  const sourceAudio = makeAudioBuffer(RAW_SAMPLES);
  const positions = [0, 4, 8];

  const db = {
    getSampleByHash: (hash: string) => {
      if (hash === "derived09") {
        return { id: 24, hash: "derived09", sample_type: "derived", sample_rate: SR, channels: 1, duration: 0 };
      }
      if (hash === "source009") {
        return { id: 25, hash: "source009", sample_type: "recorded", sample_rate: SR, channels: 1, duration: 0 };
      }
      return undefined;
    },
    getDerivedSampleLink: (_hash: string) => ({
      sample_hash: "derived09",
      source_hash: "source009",
      feature_hash: "feat0009",
      index_order: 2, // out of range: only 0 and 1 are valid
    }),
    getFeatureByHash: (_src: string, _feat: string) => ({
      id: 26,
      sample_hash: "source009",
      feature_hash: "feat0009",
      feature_type: "onset-slice",
      feature_data: JSON.stringify(positions),
      options: null,
    }),
    getRecordedMetadata: (_hash: string) => ({
      sample_id: 25,
      name: "source9",
      audio_data: sourceAudio,
    }),
  } as unknown as DatabaseManager;

  await assert.rejects(
    () => resolveAudioData(db, "derived09"),
    /Slice index 2 out of range \(2 slices\)/,
    "onset-slice throws when index equals positions.length - 1",
  );

});

  // -------------------------------------------------------------------------
  // granularize — index out of range
  // -------------------------------------------------------------------------


test("granularize — index out of range", async () => {

  // 3 grain positions → valid indices 0, 1, 2; index 3 is out of range
  const sourceAudio = makeAudioBuffer(RAW_SAMPLES);
  const positions = [0, 3, 7];

  const db = {
    getSampleByHash: (hash: string) => {
      if (hash === "derived10") {
        return { id: 26, hash: "derived10", sample_type: "derived", sample_rate: SR, channels: 1, duration: 0 };
      }
      if (hash === "source010") {
        return { id: 27, hash: "source010", sample_type: "recorded", sample_rate: SR, channels: 1, duration: 0 };
      }
      return undefined;
    },
    getDerivedSampleLink: (_hash: string) => ({
      sample_hash: "derived10",
      source_hash: "source010",
      feature_hash: "feat0010",
      index_order: 3, // out of range: positions has 3 entries (indices 0–2)
    }),
    getFeatureByHash: (_src: string, _feat: string) => ({
      id: 27,
      sample_hash: "source010",
      feature_hash: "feat0010",
      feature_type: "granularize",
      feature_data: JSON.stringify(positions),
      options: null,
    }),
    getRecordedMetadata: (_hash: string) => ({
      sample_id: 27,
      name: "source10",
      audio_data: sourceAudio,
    }),
  } as unknown as DatabaseManager;

  await assert.rejects(
    () => resolveAudioData(db, "derived10"),
    /Grain index 3 out of range \(3 grains\)/,
    "granularize throws when index equals positions.length",
  );

});
