import { ipcMain } from "electron";
import { OnsetSlice, BufNMF, MFCCFeature } from "../../index";
import {
  BufNMFOptions,
  MFCCOptions,
  OnsetSliceOptions,
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
        throw new Error(
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
        throw new Error(
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
        throw new Error(
          `Failed to compute MFCCs: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}
