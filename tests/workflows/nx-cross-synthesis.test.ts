import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { bootServices } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { BufNMFResult, BufNMFCrossResult } from "../../src/shared/rpc/analysis.rpc";

const FFT_SIZE = 1024;
const COMPONENTS = 2;

function writeSineWav(filePath: string, frequencyHz: number, durationSeconds = 0.4): void {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buf.writeUInt16LE(bytesPerSample, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const v = Math.floor(Math.sin(2 * Math.PI * frequencyHz * i / sampleRate) * 32767 * 0.8);
    buf.writeInt16LE(v, 44 + i * 2);
  }

  fs.writeFileSync(filePath, buf);
}

describe("nx-cross-synthesis", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let tmpDir: string;
  let sourceChannelData: number[];
  let targetChannelData: number[];
  let sampleRate: number;
  let sourceNmf: BufNMFResult;
  let crossOnSource: BufNMFCrossResult;
  let crossOnTarget: BufNMFCrossResult;

  beforeAll(() => {
    const booted = bootServices();
    services = booted.ctx;
    cleanup = booted.cleanup;
  });

  afterAll(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    cleanup?.();
  });

  it("setup", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-nxcross-"));
    writeSineWav(path.join(tmpDir, "source.wav"), 440);
    writeSineWav(path.join(tmpDir, "target.wav"), 880);
  });

  it("read-source", async () => {
    const result = await services.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: path.join(tmpDir, "source.wav"),
    });
    sourceChannelData = result.channelData;
    sampleRate = result.sampleRate;
  });

  it("read-target", async () => {
    const result = await services.audioFileClient.invoke("readAudioFile", {
      filePathOrHash: path.join(tmpDir, "target.wav"),
    });
    targetChannelData = result.channelData;
  });

  it("run-source-nmf", async () => {
    sourceNmf = await services.analysisClient.invoke("bufNMF", {
      audioData: sourceChannelData,
      sampleRate,
      options: { components: COMPONENTS, iterations: 10, fftSize: FFT_SIZE },
    }) as BufNMFResult;
  });

  it("cross-on-source", async () => {
    crossOnSource = await services.analysisClient.invoke("bufNMFCross", {
      targetAudioData: sourceChannelData,
      sampleRate,
      sourceBases: sourceNmf.bases,
      sourceActivations: sourceNmf.activations,
      options: { iterations: 10, fftSize: FFT_SIZE },
    }) as BufNMFCrossResult;
  });

  it("cross-on-target", async () => {
    crossOnTarget = await services.analysisClient.invoke("bufNMFCross", {
      targetAudioData: targetChannelData,
      sampleRate,
      sourceBases: sourceNmf.bases,
      sourceActivations: sourceNmf.activations,
      options: { iterations: 10, fftSize: FFT_SIZE },
    }) as BufNMFCrossResult;
  });

  it("cross-on-target-has-valid-structure", () => {
    assert.ok(Array.isArray(crossOnTarget.bases), "bases should be an array");
    assert.ok(Array.isArray(crossOnTarget.activations), "activations should be an array");
    assert.strictEqual(crossOnTarget.components, COMPONENTS);
    assert.strictEqual(crossOnTarget.bases.length, COMPONENTS);
    assert.strictEqual(crossOnTarget.activations.length, COMPONENTS);
  });

  it("target-activations-differ-from-source-activations", () => {
    const srcAct = crossOnSource.activations[0];
    const tgtAct = crossOnTarget.activations[0];
    const len = Math.min(srcAct.length, tgtAct.length);
    let diffCount = 0;
    for (let i = 0; i < len; i++) {
      if (Math.abs(srcAct[i] - tgtAct[i]) > 1e-9) diffCount++;
    }
    assert.ok(diffCount > 0, "cross-synthesis of a different target should produce different activations");
  });

  it("can-resynthesize-target-component", async () => {
    const { componentAudio } = await services.analysisClient.invoke("resynthesize", {
      audioData: targetChannelData,
      sampleRate,
      bases: crossOnTarget.bases,
      activations: crossOnTarget.activations,
      componentIndex: 0,
    });
    assert.ok(componentAudio.length > 0, "resynthesized target component should be non-empty");
    const nonFinite = componentAudio.findIndex((v) => !isFinite(v));
    assert.strictEqual(nonFinite, -1, "resynthesized target component should contain only finite values");
  });

  it("target-component-differs-from-source-component", async () => {
    const srcComp = (await services.analysisClient.invoke("resynthesize", {
      audioData: sourceChannelData,
      sampleRate,
      bases: crossOnSource.bases,
      activations: crossOnSource.activations,
      componentIndex: 0,
    })).componentAudio;
    const tgtComp = (await services.analysisClient.invoke("resynthesize", {
      audioData: targetChannelData,
      sampleRate,
      bases: crossOnTarget.bases,
      activations: crossOnTarget.activations,
      componentIndex: 0,
    })).componentAudio;
    const len = Math.min(srcComp.length, tgtComp.length);
    let diffCount = 0;
    for (let i = 0; i < len; i++) {
      if (Math.abs(srcComp[i] - tgtComp[i]) > 1e-9) diffCount++;
    }
    assert.ok(diffCount > 0, "resynthesized target component should differ from resynthesized source component");
  });
});
