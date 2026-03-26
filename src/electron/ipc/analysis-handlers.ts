import { ipcMain } from "electron";
import { OnsetSlice, BufNMF, MFCCFeature, AmpSlice, NoveltySlice, TransientSlice } from "../../index";
import { BounceError } from "../../shared/bounce-error.js";
import {
  BufNMFOptions,
  MFCCOptions,
  OnsetSliceOptions,
  AmpSliceOptions,
  NoveltySliceOptions,
  TransientSliceOptions,
} from "../ipc-types";

export function registerAnalysisHandlers(): void {
  ipcMain.handle(
    "analyze-onset-slice",
    async (_event, audioDataArray: number[], options?: OnsetSliceOptions) => {
      try {
        const audioData = new Float32Array(audioDataArray);

        const slicer = new OnsetSlice(options || {});
        const slices = slicer.process(audioData);

        return Array.from(slices);
      } catch (error) {
        throw new BounceError(
          "ANALYSIS_ONSET_FAILED",
          `Failed to analyze onset slices: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  ipcMain.handle(
    "analyze-buf-nmf",
    async (
      _event,
      audioDataArray: number[],
      sampleRate: number,
      options?: BufNMFOptions,
    ) => {
      try {
        const audioData = new Float32Array(audioDataArray);

        const nmf = new BufNMF(options || {});
        const result = nmf.process(audioData, sampleRate);

        return result;
      } catch (error) {
        throw new BounceError(
          "ANALYSIS_NMF_FAILED",
          `Failed to perform NMF: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  ipcMain.handle(
    "analyze-mfcc",
    async (_event, audioDataArray: number[], options?: MFCCOptions) => {
      try {
        const audioData = new Float32Array(audioDataArray);
        const analyzer = new MFCCFeature(options || {});
        return analyzer.process(audioData);
      } catch (error) {
        throw new BounceError(
          "ANALYSIS_MFCC_FAILED",
          `Failed to compute MFCCs: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  ipcMain.handle(
    "analyze-amp-slice",
    async (_event, audioDataArray: number[], options?: AmpSliceOptions) => {
      try {
        const audioData = new Float32Array(audioDataArray);
        const slicer = new AmpSlice(options || {});
        return Array.from(slicer.process(audioData));
      } catch (error) {
        throw new BounceError(
          "ANALYSIS_AMP_SLICE_FAILED",
          `Failed to analyze amp slices: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  ipcMain.handle(
    "analyze-novelty-slice",
    async (_event, audioDataArray: number[], options?: NoveltySliceOptions) => {
      try {
        const audioData = new Float32Array(audioDataArray);
        const slicer = new NoveltySlice(options || {});
        return Array.from(slicer.process(audioData));
      } catch (error) {
        throw new BounceError(
          "ANALYSIS_NOVELTY_SLICE_FAILED",
          `Failed to analyze novelty slices: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  ipcMain.handle(
    "analyze-transient-slice",
    async (_event, audioDataArray: number[], options?: TransientSliceOptions) => {
      try {
        const audioData = new Float32Array(audioDataArray);
        const slicer = new TransientSlice(options || {});
        return Array.from(slicer.process(audioData));
      } catch (error) {
        throw new BounceError(
          "ANALYSIS_TRANSIENT_SLICE_FAILED",
          `Failed to analyze transient slices: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}
