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

import type { AnalysisRpc } from "../../../shared/rpc/analysis.rpc";
import { dispatch } from "./dispatch";

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

