/**
 * AnalysisService — JSON-RPC server backed by the pure dispatch function.
 *
 * No Electron dependencies. Used by workflow tests via createInProcessPair().
 * The Electron utility process variant (index.ts) remains the production path.
 */

import type { MessageConnection } from "vscode-jsonrpc";
import { dispatch } from "./dispatch";
import {
  registerAnalysisHandlers,
  type AnalysisHandlers,
  type OnsetSliceResult,
  type BufNMFResult,
  type BufNMFCrossResult,
  type MFCCResult,
} from "../../../shared/rpc/analysis.rpc";
import type { AnalysisRpc } from "../../../shared/rpc/analysis.rpc";

export class AnalysisService implements AnalysisHandlers {
  async onsetSlice(params: AnalysisRpc["onsetSlice"]["params"]): Promise<OnsetSliceResult> {
    return dispatch("onsetSlice", params) as OnsetSliceResult;
  }

  async ampSlice(params: AnalysisRpc["ampSlice"]["params"]): Promise<OnsetSliceResult> {
    return dispatch("ampSlice", params) as OnsetSliceResult;
  }

  async noveltySlice(params: AnalysisRpc["noveltySlice"]["params"]): Promise<OnsetSliceResult> {
    return dispatch("noveltySlice", params) as OnsetSliceResult;
  }

  async transientSlice(params: AnalysisRpc["transientSlice"]["params"]): Promise<OnsetSliceResult> {
    return dispatch("transientSlice", params) as OnsetSliceResult;
  }

  async bufNMF(params: AnalysisRpc["bufNMF"]["params"]): Promise<BufNMFResult> {
    return dispatch("bufNMF", params) as BufNMFResult;
  }

  async mfcc(params: AnalysisRpc["mfcc"]["params"]): Promise<MFCCResult> {
    return dispatch("mfcc", params) as MFCCResult;
  }

  async resynthesize(params: AnalysisRpc["resynthesize"]["params"]): Promise<{ componentAudio: number[] }> {
    return dispatch("resynthesize", params) as { componentAudio: number[] };
  }

  async bufNMFCross(params: AnalysisRpc["bufNMFCross"]["params"]): Promise<BufNMFCrossResult> {
    return dispatch("bufNMFCross", params) as BufNMFCrossResult;
  }

  listen(connection: MessageConnection): void {
    registerAnalysisHandlers(connection, this);
  }
}
