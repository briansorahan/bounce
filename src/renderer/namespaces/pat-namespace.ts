import { BounceResult } from "../bounce-result.js";
import { renderNamespaceHelp, withHelp } from "../help.js";
import type { NamespaceDeps } from "./types.js";
import { parsePattern } from "../pattern-parser.js";
import { PatternResult } from "../results/pattern.js";
import { patCommands, patDescription } from "./pat-commands.generated.js";
export { patCommands } from "./pat-commands.generated.js";

export interface PatNamespace {
  description: string;
  xox: ((notation: string) => PatternResult) & { help: () => BounceResult };
  help(): BounceResult;
}

/**
 * PatternResult DSL for rhythmic sequencing
 * @namespace pat
 */
export function buildPatNamespace(_deps: NamespaceDeps): { pat: PatNamespace } {
  const pat: PatNamespace = {
    description: patDescription,
    help: () => renderNamespaceHelp("pat", patDescription, patCommands),

    xox: withHelp(
      /**
       * Compile an X0X step pattern for live-coding
       *
       * Compile an X0X step-sequencer pattern from a multi-line notation string.
       * Returns a PatternResult object that can be played with .play(channel).
       *
       * X0X notation rules:
       *   Each line:  NOTE = STEPS   (16 non-whitespace step characters)
       *   NOTE:       c4, c'4 (sharp/flat one semitone up), a4, etc.
       *   STEPS:      . = rest,  a-z = soft velocity,  A-Z = loud velocity
       *
       * @param notation Multi-line X0X notation string.
       * @example pat.xox(`\n  c4 = a . . . a . . . a . . . a . . .\n  e4 = . a . . . a . . . a . . . a . .\n`).play(1)
       */
      function xox(notation: string): PatternResult {
        const compiled = parsePattern(notation);
        return new PatternResult(notation, compiled);
      },
      patCommands[0],
    ),
  };

  return { pat };
}
