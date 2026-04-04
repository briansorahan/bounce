import type { NamespaceDeps } from "./types.js";
import { namespace, describe, param } from "../../shared/repl-registry.js";
import { parsePattern } from "../pattern-parser.js";
import { PatternResult } from "../results/pattern.js";
import { patCommands } from "./pat-commands.generated.js";
export { patCommands } from "./pat-commands.generated.js";

@namespace("pat", { summary: "PatternResult DSL for rhythmic sequencing" })
export class PatNamespace {
  /** Namespace summary — used by the globals help() function. */
  readonly description = "PatternResult DSL for rhythmic sequencing";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_deps: NamespaceDeps) {}

  // ── Injected by @namespace decorator — do not implement manually ──────────

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  help(): unknown {
    // Replaced at class definition time by the @namespace decorator.
    return undefined;
  }

  toString(): string {
    return String(this.help());
  }

  // ── Public REPL-facing methods ────────────────────────────────────────────

  @describe({
    summary: "Compile an X0X step pattern for live-coding",
    returns: "Pattern",
  })
  @param("notation", {
    summary: "Multi-line X0X notation string. Each line: NOTE = STEPS (16 non-whitespace step chars). NOTE: c4, a4, etc. STEPS: . = rest, a-z = soft, A-Z = loud.",
    kind: "plain",
  })
  xox(notation: string): PatternResult {
    const compiled = parsePattern(notation);
    return new PatternResult(notation, compiled);
  }
}

/** @deprecated Use `new PatNamespace(deps)` directly. Kept for backward compatibility. */
export function buildPatNamespace(deps: NamespaceDeps): { pat: PatNamespace } {
  return { pat: new PatNamespace(deps) };
}

// Re-export commands array for any consumers of the old JSDoc-generated metadata.
export { patCommands as patNamespaceCommands };
