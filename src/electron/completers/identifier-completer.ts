import type { CompletionContext } from "../../shared/completion-context.js";
import type { Completer, PredictionResult } from "../../shared/completer.js";
import { listNamespaces, listTypes } from "../../shared/repl-registration.js";

/**
 * Suggests root-level identifiers: registered namespaces, porcelain type names,
 * and user-defined session variables.
 *
 * Active when: position.kind === "identifier"
 */
export class IdentifierCompleter implements Completer {
  constructor(private readonly devMode = false) {}

  predict(context: CompletionContext): PredictionResult[] {
    if (context.position.kind !== "identifier") return [];
    const { prefix } = context.position;
    const results: PredictionResult[] = [];

    // Registered namespaces
    for (const ns of listNamespaces()) {
      if (this.devMode || ns.visibility === "porcelain") {
        if (!prefix || ns.name.startsWith(prefix)) {
          results.push({
            label: ns.name,
            kind: "namespace",
            detail: ns.summary,
          });
        }
      }
    }

    // Registered types (names only — for use as type references)
    for (const type of listTypes()) {
      if (!prefix || type.name.startsWith(prefix)) {
        results.push({
          label: type.name,
          kind: "type",
          detail: type.summary,
        });
      }
    }

    // Session variables inferred by the language service
    for (const v of context.sessionVariables) {
      if (!prefix || v.name.startsWith(prefix)) {
        results.push({
          label: v.name,
          kind: "variable",
          detail: v.inferredType,
        });
      }
    }

    return results;
  }
}
