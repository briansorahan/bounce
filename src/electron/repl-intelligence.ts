/**
 * REPL Intelligence Layer — orchestrates completers based on CompletionContext.
 *
 * Receives a CompletionContext from the Language Service utility process,
 * dispatches to the appropriate completer(s), and returns PredictionResult[].
 *
 * Request ID tracking: callers pass a requestId; stale responses with IDs
 * lower than the latest processed ID are discarded in Phase 4.
 */

import type { CompletionContext, StringLiteralContext } from "../shared/completion-context.js";
import type { PredictionResult } from "../shared/completer.js";
import { replRegistry } from "../shared/repl-registry.generated.js";
import type { DatabaseManager } from "./database.js";

import { IdentifierCompleter } from "./completers/identifier-completer.js";
import { PropertyCompleter } from "./completers/property-completer.js";
import { FilePathCompleter } from "./completers/file-path-completer.js";
import { SampleHashCompleter } from "./completers/sample-hash-completer.js";
import { OptionsCompleter } from "./completers/options-completer.js";
import { TypedValueCompleter } from "./completers/typed-value-completer.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntelligenceDeps {
  /** Access to the database for SampleHashCompleter. */
  dbManager: DatabaseManager;
  /** Working directory for FilePathCompleter. */
  cwd?: string;
  /** If true, plumbing-visibility items are included in completions. */
  devMode?: boolean;
}

// ---------------------------------------------------------------------------
// ReplIntelligence
// ---------------------------------------------------------------------------

export class ReplIntelligence {
  private devMode: boolean;

  constructor(private readonly deps: IntelligenceDeps) {
    this.devMode = deps.devMode ?? false;
  }

  /** Toggle porcelain/plumbing visibility at runtime (driven by env.dev()). */
  setDevMode(enabled: boolean): void {
    this.devMode = enabled;
  }

  /**
   * Given a CompletionContext, dispatch to the appropriate completer(s) and
   * return a deduplicated list of PredictionResult candidates.
   */
  predict(context: CompletionContext): PredictionResult[] {
    const pos = context.position;

    switch (pos.kind) {
      case "identifier":
        return new IdentifierCompleter(this.devMode).predict(context);

      case "propertyAccess":
        return new PropertyCompleter(this.devMode).predict(context);

      case "callArgument": {
        const { callee } = pos;
        const paramMeta = this.getParamMeta(callee.parentName, callee.name, callee.paramIndex);
        if (paramMeta?.kind === "typed") {
          return new TypedValueCompleter(this.devMode).predict(context);
        }
        // No completion for plain / unknown param kinds at this position
        return [];
      }

      case "objectLiteralKey":
        return new OptionsCompleter(this.devMode).predict(context);

      case "stringLiteral": {
        const { callee } = pos;
        const paramMeta = this.getParamMeta(callee.parentName, callee.name, callee.paramIndex);
        if (paramMeta?.kind === "filePath") {
          return new FilePathCompleter(this.deps.cwd).predict(context as StringLiteralContext);
        }
        if (paramMeta?.kind === "sampleHash") {
          return new SampleHashCompleter(this.deps.dbManager).predict(context as StringLiteralContext);
        }
        return [];
      }

      case "none":
        return [];
    }
  }

  private getParamMeta(
    parentName: string | undefined,
    methodName: string,
    paramIndex: number,
  ): { kind: string; expectedType?: string } | undefined {
    const key = parentName ? `${parentName}.${methodName}` : methodName;
    const entry = replRegistry[key];
    return entry?.params[paramIndex];
  }
}
