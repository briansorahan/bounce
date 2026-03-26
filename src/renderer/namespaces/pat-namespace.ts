import { BounceResult } from "../bounce-result.js";
import type { NamespaceDeps } from "./types.js";
import { parsePattern } from "../pattern-parser.js";
import { Pattern } from "../results/pattern.js";

export interface PatNamespace {
  xox(notation: string): Pattern;
  help(): BounceResult;
}

export function buildPatNamespace(_deps: NamespaceDeps): { pat: PatNamespace } {
  const pat: PatNamespace = {
    xox(notation: string): Pattern {
      const compiled = parsePattern(notation);
      return new Pattern(notation, compiled);
    },

    help(): BounceResult {
      return new BounceResult(
        `pat — pattern creators for live-coding\n` +
        `  pat.xox(notation)    compile an X0X step pattern\n` +
        `  pat.help()           show this message\n` +
        `\nX0X notation:\n` +
        `  Each line: NOTE = STEPS   (16 non-whitespace step characters)\n` +
        `  NOTE: c4, c'4 (sharp/flat semitone up), a4, etc.\n` +
        `  STEPS: . = rest, a-z = soft velocity, A-Z = loud velocity\n` +
        `\nexample:\n` +
        `  pat.xox(\`\n` +
        `    c4 = a . . . a . . . a . . . a . . .\n` +
        `    e4 = . a . . . a . . . a . . . a . .\n` +
        `  \`).play(1)`,
      );
    },
  };

  return { pat };
}
