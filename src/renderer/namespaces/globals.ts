/// <reference path="../types.d.ts" />
/// <reference path="../bounce-globals.d.ts" />
import { BounceResult } from "../bounce-result.js";
import { type CommandHelp, withHelp, renderCommandHelp } from "../help.js";
import type { NamespaceDeps } from "./types.js";
import { globalCommands } from "./globals-commands.generated.js";
export { globalCommands } from "./globals-commands.generated.js";

// Supplemental command entries for errors sub-commands that the generator
// cannot reach (they live inside Object.assign blocks).
const errorsSupplementalCommands: CommandHelp[] = [
  {
    name: "errors",
    signature: "errors()",
    summary: "Show active background errors",
    description:
      "Show active background errors from main or utility processes.\n" +
      "When the status line shows a red indicator, use this to see details.",
    examples: ["errors()", "errors.dismiss(3)", "errors.dismissAll()"],
  },
  {
    name: "errors.dismiss",
    signature: "errors.dismiss(id)",
    summary: "Dismiss a specific background error by its numeric id",
    params: [
      { name: "id", type: "number", description: "Numeric id of the error to dismiss." },
    ],
    examples: ["errors.dismiss(3)"],
  },
  {
    name: "errors.dismissAll",
    signature: "errors.dismissAll()",
    summary: "Dismiss all active background errors",
    examples: ["errors.dismissAll()"],
  },
];

/** @namespace globals */
export function buildGlobals(deps: NamespaceDeps, namespaces: Record<string, { description: string }>) {
  const { terminal } = deps;

  const nsNames = Object.keys(namespaces);
  const maxNsNameLen = nsNames.length > 0 ? Math.max(...nsNames.map((n) => n.length)) : 0;

  const help = withHelp(
    /**
     * Show the organized command reference
     *
     * Show the organized command reference.
     *
     * @example help()
     * @example sn.help()
     * @example corpus.help()
     */
    function help(): BounceResult {
      const nsEntries = Object.entries(namespaces).map(([name, ns]) => {
        const descFirstLine = ns.description.split("\n")[0];
        const pad = " ".repeat(Math.max(1, maxNsNameLen - name.length + 2));
        return `  \x1b[33m${name}\x1b[0m${pad}${descFirstLine}`;
      });

      return new BounceResult([
        "\x1b[1;36mBounce REPL\x1b[0m",
        "",
        ...nsEntries,
        "  \x1b[33mhelp()\x1b[0m      Show this help message",
        "  \x1b[33mclear()\x1b[0m     Clear the terminal screen",
        "  \x1b[33merrors()\x1b[0m    Show background errors",

      ].join("\n"));
    },
    globalCommands[0],
  );

  const clear = withHelp(
    /**
     * Clear the terminal screen
     *
     * @example clear()
     */
    function clear(): void {
      terminal.clear();
    },
    globalCommands[1],
  );

  const debug = withHelp(
    /**
     * Show recent entries from the SQLite debug log store
     *
     * Show the most recent entries from the SQLite debug log store.
     * Useful for diagnosing issues with audio processing or IPC.
     *
     * @param limit Number of entries to show (default 20).
     * @example debug()
     * @example debug(50)
     */
    async function debug(limit = 20): Promise<BounceResult> {
      const logs = await window.electron.getDebugLogs(limit);
      const lines: string[] = [
        `\x1b[1;36mDebug Logs (${logs.length} entries):\x1b[0m`,
        "",
      ];

      for (const log of [...logs].reverse()) {
        const levelColor =
          log.level === "error" ? "\x1b[31m" :
          log.level === "warn" ? "\x1b[33m" : "\x1b[90m";
        const timestamp = new Date(log.timestamp).toISOString();
        const data = log.data ? ` ${log.data}` : "";
        lines.push(
          `${levelColor}[${timestamp}] ${log.level.toUpperCase()}: ${log.message}${data}\x1b[0m`,
        );
      }

      if (logs.length === 0) {
        lines.push("\x1b[90mNo debug logs found\x1b[0m");
      }

      return new BounceResult(lines.join("\n"));
    },
    globalCommands[2],
  );

  const clearDebug = withHelp(
    /**
     * Clear all entries from the debug log store
     *
     * @example clearDebug()
     */
    async function clearDebug(): Promise<BounceResult> {
      await window.electron.clearDebugLogs();
      return new BounceResult("\x1b[32mDebug logs cleared\x1b[0m");
    },
    globalCommands[3],
  );

  const errors = Object.assign(
    async function errors(): Promise<BounceResult> {
      const items = await window.electron.getBackgroundErrors();
      if (items.length === 0) {
        return new BounceResult("\x1b[32m● No background errors\x1b[0m");
      }
      const lines: string[] = [
        `\x1b[1;31m● ${items.length} background error${items.length === 1 ? "" : "s"}:\x1b[0m`,
        "",
      ];
      for (const err of items) {
        lines.push(
          `  \x1b[33mid ${err.id}\x1b[0m  \x1b[90m${err.created_at}\x1b[0m  [\x1b[36m${err.source}\x1b[0m] \x1b[31m${err.code}\x1b[0m`,
        );
        lines.push(`         ${err.message}`);
        lines.push("");
      }
      lines.push(
        "\x1b[90mDismiss:\x1b[0m  errors.dismiss(id)  |  errors.dismissAll()",
      );
      return new BounceResult(lines.join("\n"));
    },
    {
      dismiss: withHelp(
        async function dismiss(id: number): Promise<BounceResult> {
          const ok = await window.electron.dismissBackgroundError(id);
          return ok
            ? new BounceResult(`\x1b[32mDismissed error ${id}\x1b[0m`)
            : new BounceResult(`\x1b[33mNo active error with id ${id}\x1b[0m`);
        },
        errorsSupplementalCommands[1],
      ),
      dismissAll: withHelp(
        async function dismissAll(): Promise<BounceResult> {
          const count = await window.electron.dismissAllBackgroundErrors();
          return count > 0
            ? new BounceResult(`\x1b[32mDismissed ${count} error${count === 1 ? "" : "s"}\x1b[0m`)
            : new BounceResult("\x1b[32mNo active errors to dismiss\x1b[0m");
        },
        errorsSupplementalCommands[2],
      ),
      help: (): BounceResult => renderCommandHelp(errorsSupplementalCommands[0]),
    },
  );

  return { help, clear, debug, clearDebug, errors };
}
