import type { CompletionContext } from "../../shared/completion-context.js";
import type { Completer, PredictionResult } from "../../shared/completer.js";
import { replRegistry } from "../../shared/repl-registry.generated.js";

/**
 * Suggests session variables whose inferred type matches the expected type for
 * the current call argument.
 *
 * Active when: position.kind === "callArgument" and the @param for this
 * argument has kind "typed" (checked by ReplIntelligence before dispatch).
 *
 * For union expected types (e.g. "SliceFeature | NmfFeature"), dispatches once
 * per type member and merges results — deduplicating by variable name.
 */
export class TypedValueCompleter implements Completer {
  constructor(private readonly devMode = false) {}

  predict(context: CompletionContext): PredictionResult[] {
    if (context.position.kind !== "callArgument") return [];
    const { callee, prefix } = context.position;

    const expectedType = this.resolveExpectedType(callee.parentName, callee.name, callee.paramIndex);
    if (!expectedType) return [];

    // Handle union types
    const members = expectedType.split("|").map((t) => t.trim()).filter(Boolean);

    const seen = new Set<string>();
    const results: PredictionResult[] = [];

    for (const typeMember of members) {
      for (const v of context.sessionVariables) {
        if (seen.has(v.name)) continue;
        if (this.typeMatches(v.inferredType, typeMember)) {
          if (!prefix || v.name.startsWith(prefix)) {
            seen.add(v.name);
            results.push({
              label: v.name,
              kind: "variable",
              detail: v.inferredType,
            });
          }
        }
      }
    }

    return results;
  }

  private resolveExpectedType(
    parentName: string | undefined,
    methodName: string,
    paramIndex: number,
  ): string | undefined {
    const registryKey = parentName ? `${parentName}.${methodName}` : methodName;
    const entry = replRegistry[registryKey];
    if (!entry) return undefined;
    const paramMeta = entry.params[paramIndex];
    if (!paramMeta || paramMeta.kind !== "typed") return undefined;
    return paramMeta.expectedType;
  }

  private typeMatches(
    inferredType: string | undefined,
    expectedType: string,
  ): boolean {
    if (!inferredType) return false;
    // Direct match
    if (inferredType === expectedType) return true;
    // Promise<T> — unwrap
    const promiseMatch = /^Promise<(.+)>$/.exec(inferredType);
    if (promiseMatch) return this.typeMatches(promiseMatch[1], expectedType);
    return false;
  }
}
