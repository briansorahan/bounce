import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { CompletionContext } from "../../shared/completion-context.js";
import type { Completer, PredictionResult } from "../../shared/completer.js";
import { AUDIO_EXTENSIONS } from "../audio-extensions.js";

/**
 * Suggests filesystem paths for string literal arguments with @param kind "filePath".
 *
 * Active when: position.kind === "stringLiteral" and the registered @param for
 * this argument has kind "filePath" (checked by ReplIntelligence before dispatch).
 */
export class FilePathCompleter implements Completer {
  constructor(private readonly cwd?: string) {}

  predict(context: CompletionContext): PredictionResult[] {
    if (context.position.kind !== "stringLiteral") return [];
    const { prefix } = context.position;
    return this.completePath(prefix);
  }

  completePath(inputPath: string): PredictionResult[] {
    try {
      const { parentPath, namePrefix } = splitCompletionInput(inputPath);
      const resolvedParent = this.resolveParent(parentPath);
      const includeHidden = namePrefix.startsWith(".");

      const dirents = fs.readdirSync(resolvedParent, { withFileTypes: true });
      const results: PredictionResult[] = [];

      for (const d of dirents) {
        if (!includeHidden && d.name.startsWith(".")) continue;
        if (!d.name.startsWith(namePrefix)) continue;

        if (d.isDirectory()) {
          const label = `${parentPath}${d.name}/`;
          results.push({ label, kind: "filePath" });
        } else if (d.isFile()) {
          const ext = path.extname(d.name).toLowerCase();
          if ((AUDIO_EXTENSIONS as readonly string[]).includes(ext)) {
            const label = `${parentPath}${d.name}`;
            results.push({ label, kind: "filePath" });
          }
        }
      }

      return results.sort((a, b) => a.label.localeCompare(b.label)).slice(0, 50);
    } catch {
      return [];
    }
  }

  private resolveParent(parentPath: string): string {
    if (!parentPath) return this.cwd ?? os.homedir();
    const expanded = parentPath.replace(/^~/, os.homedir());
    if (path.isAbsolute(expanded)) return expanded;
    return path.resolve(this.cwd ?? os.homedir(), expanded);
  }
}

function splitCompletionInput(inputPath: string): { parentPath: string; namePrefix: string } {
  if (inputPath === "~") return { parentPath: "~/", namePrefix: "" };
  const norm = inputPath.replace(/\\/g, "/");
  const lastSlash = norm.lastIndexOf("/");
  if (lastSlash === -1) return { parentPath: "", namePrefix: norm };
  return {
    parentPath: norm.slice(0, lastSlash + 1),
    namePrefix: norm.slice(lastSlash + 1),
  };
}
