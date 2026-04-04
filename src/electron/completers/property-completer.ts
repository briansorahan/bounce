import type { CompletionContext } from "../../shared/completion-context.js";
import type { Completer, PredictionResult } from "../../shared/completer.js";
import { getNamespace, getType } from "../../shared/repl-registration.js";

/**
 * Suggests methods / properties after a `.` on a known object.
 *
 * Active when: position.kind === "propertyAccess"
 *
 * Resolution order:
 *   1. objectName matches a registered namespace → list its methods
 *   2. objectName is a session variable → use its inferredType to look up a
 *      registered replType → list its methods
 *   3. No match → empty (language service type info used in Phase 4)
 */
export class PropertyCompleter implements Completer {
  constructor(private readonly devMode = false) {}

  predict(context: CompletionContext): PredictionResult[] {
    if (context.position.kind !== "propertyAccess") return [];
    const { objectName, prefix } = context.position;

    const methods = this.resolveMethodDescriptors(context, objectName);
    const results: PredictionResult[] = [];

    for (const [methodName, desc] of Object.entries(methods)) {
      if (this.devMode || desc.visibility === "porcelain") {
        if (!prefix || methodName.startsWith(prefix)) {
          const paramList = desc.params.map((p) => p.name).join(", ");
          results.push({
            label: methodName,
            kind: "method",
            detail: desc.returns ? `(${paramList}) → ${desc.returns}` : `(${paramList})`,
          });
        }
      }
    }

    return results;
  }

  private resolveMethodDescriptors(
    context: CompletionContext,
    objectName: string,
  ): Record<string, { summary: string; visibility: string; returns?: string; params: Array<{ name: string }> }> {
    // 1. Check registered namespaces
    const ns = getNamespace(objectName);
    if (ns) return ns.methods;

    // 2. Resolve via session variable inferredType
    const sessionVar = context.sessionVariables.find((v) => v.name === objectName);
    if (sessionVar?.inferredType) {
      const type = getType(sessionVar.inferredType);
      if (type) return type.methods;

      // Handle Promise<T> — unwrap the T
      const promiseMatch = /^Promise<(.+)>$/.exec(sessionVar.inferredType);
      if (promiseMatch) {
        const inner = getType(promiseMatch[1]);
        if (inner) return inner.methods;
      }
    }

    // 3. Check resolvedType from context (provided by language service)
    const resolved = context.position.kind === "propertyAccess"
      ? context.position.resolvedType
      : undefined;
    if (resolved?.name) {
      const type = getType(resolved.name);
      if (type) return type.methods;
    }

    return {};
  }
}
