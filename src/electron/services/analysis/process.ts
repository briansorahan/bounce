/**
 * AnalysisService utility process entry point.
 *
 * Spawned by AnalysisService (index.ts) via utilityProcess.fork().
 * Receives JSON-RPC requests over process.parentPort, calls FluCoMa native
 * functions synchronously, and posts typed responses back.
 *
 * This process is intentionally CPU-bound — it is isolated from the main
 * process precisely so that long analyses do not block the event loop or
 * the IPC router.
 */

import { OnsetSlice, AmpSlice, NoveltySlice, TransientSlice, BufNMF, MFCCFeature } from "../../../index";
import type { AnalysisRpc } from "../../../shared/rpc/analysis.rpc";

type AnalysisRequest = {
  id: string;
  method: keyof AnalysisRpc;
  params: unknown;
};

type AnalysisResponse =
  | { id: string; result: unknown }
  | { id: string; error: string };

process.parentPort.on("message", (event: Electron.MessageEvent) => {
  const req = event.data as AnalysisRequest;
  handleRequest(req).then((response) => {
    process.parentPort.postMessage(response);
  });
});

async function handleRequest(req: AnalysisRequest): Promise<AnalysisResponse> {
  try {
    const result = await dispatch(req.method, req.params);
    return { id: req.id, result };
  } catch (error) {
    return {
      id: req.id,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function dispatch(method: keyof AnalysisRpc, params: unknown): unknown {
  switch (method) {
    case "onsetSlice": {
      const { audioData, options } = params as AnalysisRpc["onsetSlice"]["params"];
      const slicer = new OnsetSlice(options ?? {});
      const onsets = Array.from(slicer.process(new Float32Array(audioData)));
      return { onsets };
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
    default:
      throw new Error(`Unknown method: ${String(method)}`);
  }
}
