import type { CompletionContext } from "../../shared/completion-context.js";
import type { Completer, PredictionResult } from "../../shared/completer.js";
import type { DatabaseManager } from "../database.js";

/**
 * Suggests sample hashes from the database for string literal arguments with
 * @param kind "sampleHash".
 *
 * Active when: position.kind === "stringLiteral" and the registered @param for
 * this argument has kind "sampleHash" (checked by ReplIntelligence before dispatch).
 */
export class SampleHashCompleter implements Completer {
  constructor(private readonly dbManager: DatabaseManager) {}

  predict(context: CompletionContext): PredictionResult[] {
    if (context.position.kind !== "stringLiteral") return [];
    const { prefix } = context.position;
    return this.completeHash(prefix);
  }

  completeHash(prefix: string): PredictionResult[] {
    try {
      const samples = this.dbManager.listSamples();
      return samples
        .filter((s) => s.hash.startsWith(prefix))
        .map((s) => ({
          label: s.hash.substring(0, 8),
          kind: "sampleHash" as const,
          detail: s.display_name ?? undefined,
        }));
    } catch {
      return [];
    }
  }
}
