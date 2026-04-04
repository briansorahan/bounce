/**
 * Completer interface and PredictionResult type for the REPL Intelligence Layer.
 *
 * All completers implement Completer.predict() and return PredictionResult[].
 * Completers are synchronous — the main process IPC handler awaits the full
 * pipeline once, including the async language service parse.
 */

import type { CompletionContext } from "./completion-context.js";

export interface PredictionResult {
  /** The text shown in ghost text / completion UI. */
  label: string;
  /** The text inserted on accept. Defaults to label if omitted. */
  insertText?: string;
  /** Category used for icon/styling in the completion UI. */
  kind: "namespace" | "method" | "type" | "variable" | "filePath" | "sampleHash" | "key";
  /** One-line description shown alongside the label (return type, summary, etc.). */
  detail?: string;
}

export interface Completer {
  predict(context: CompletionContext): PredictionResult[];
}
