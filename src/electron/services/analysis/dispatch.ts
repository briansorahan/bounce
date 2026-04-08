/**
 * Pure FluCoMa dispatch — no Electron, no process.parentPort.
 *
 * Imported by both the utility process entry point (process.ts) and the
 * JSON-RPC AnalysisService (service.ts), so workflow tests can call the
 * same logic without spawning a child process.
 */

import { OnsetSlice, AmpSlice, NoveltySlice, TransientSlice, BufNMF, BufNMFCross, MFCCFeature } from "../../../index";
import type { AnalysisRpc } from "../../../shared/rpc/analysis.rpc";

export function dispatch(method: keyof AnalysisRpc, params: unknown): unknown {
  switch (method) {
    case "onsetSlice": {
      const { audioData, options } = params as AnalysisRpc["onsetSlice"]["params"];
      const slicer = new OnsetSlice(options ?? {});
      return { onsets: Array.from(slicer.process(new Float32Array(audioData))) };
    }
    case "ampSlice": {
      const { audioData, options } = params as AnalysisRpc["ampSlice"]["params"];
      const slicer = new AmpSlice(options ?? {});
      return { onsets: Array.from(slicer.process(new Float32Array(audioData))) };
    }
    case "noveltySlice": {
      const { audioData, options } = params as AnalysisRpc["noveltySlice"]["params"];
      const slicer = new NoveltySlice(options ?? {});
      return { onsets: Array.from(slicer.process(new Float32Array(audioData))) };
    }
    case "transientSlice": {
      const { audioData, options } = params as AnalysisRpc["transientSlice"]["params"];
      const slicer = new TransientSlice(options ?? {});
      return { onsets: Array.from(slicer.process(new Float32Array(audioData))) };
    }
    case "bufNMF": {
      const { audioData, sampleRate, options } = params as AnalysisRpc["bufNMF"]["params"];
      const nmf = new BufNMF(options ?? {});
      return nmf.process(new Float32Array(audioData), sampleRate);
    }
    case "mfcc": {
      const { audioData, options } = params as AnalysisRpc["mfcc"]["params"];
      const analyzer = new MFCCFeature(options ?? {});
      return { coefficients: analyzer.process(new Float32Array(audioData)) };
    }
    case "resynthesize": {
      const { audioData, sampleRate, bases, activations, componentIndex } = params as AnalysisRpc["resynthesize"]["params"];
      const nmf = new BufNMF({});
      const componentAudio = nmf.resynthesize(new Float32Array(audioData), sampleRate, bases, activations, componentIndex);
      return { componentAudio: Array.from(componentAudio) };
    }
    case "bufNMFCross": {
      const { targetAudioData, sampleRate, sourceBases, sourceActivations, options } = params as AnalysisRpc["bufNMFCross"]["params"];
      const nx = new BufNMFCross(options ?? {});
      return nx.process(new Float32Array(targetAudioData), sampleRate, sourceBases, sourceActivations);
    }
    default:
      throw new Error(`Unknown analysis method: ${String(method)}`);
  }
}
