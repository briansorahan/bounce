import { BounceResult } from "../bounce-result.js";
import { type CommandHelp, renderNamespaceHelp, withHelp } from "../help.js";
import type { NamespaceDeps } from "./types.js";
import { parsePattern } from "../pattern-parser.js";
import { Pattern } from "../results/pattern.js";

export interface PatNamespace {
  xox: ((notation: string) => Pattern) & { help: () => BounceResult };
  help(): BounceResult;
}

export const patCommands: CommandHelp[] = [
  {
    name: "xox",
    signature: "pat.xox(notation)",
    summary: "Compile an X0X step pattern for live-coding",
    description:
      "Compile an X0X step-sequencer pattern from a multi-line notation string.\n" +
      "Returns a Pattern object that can be played with .play(channel).\n" +
      "\n" +
      "X0X notation rules:\n" +
      "  Each line:  NOTE = STEPS   (16 non-whitespace step characters)\n" +
      "  NOTE:       c4, c'4 (sharp/flat one semitone up), a4, etc.\n" +
      "  STEPS:      . = rest,  a-z = soft velocity,  A-Z = loud velocity",
    params: [
      { name: "notation", type: "string", description: "Multi-line X0X notation string." },
    ],
    examples: [
      "pat.xox(`\n  c4 = a . . . a . . . a . . . a . . .\n  e4 = . a . . . a . . . a . . . a . .\n`).play(1)",
    ],
  },
];

export function buildPatNamespace(_deps: NamespaceDeps): { pat: PatNamespace } {
  const pat: PatNamespace = {
    help: () => renderNamespaceHelp("pat", "Pattern creators for live-coding", patCommands),

    xox: withHelp(
      function xox(notation: string): Pattern {
        const compiled = parsePattern(notation);
        return new Pattern(notation, compiled);
      },
      patCommands[0],
    ),
  };

  return { pat };
}
