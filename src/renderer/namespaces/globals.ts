/// <reference path="../types.d.ts" />
/// <reference path="../bounce-globals.d.ts" />
import { BounceResult } from "../bounce-result.js";
import type { NamespaceDeps } from "./types.js";

export function buildGlobals(deps: NamespaceDeps) {
  const { terminal } = deps;

  const help = Object.assign(
    function help(): BounceResult {
      return new BounceResult([
        "\x1b[1;36mBounce REPL\x1b[0m",
        "",
        "  \x1b[33msn\x1b[0m                               Sample namespace: .read() .load() .list() .current() .stop() .help()",
        "  \x1b[33menv\x1b[0m                              Runtime introspection: .vars() .globals() .inspect() .functions()",
        "  \x1b[33mproj\x1b[0m                             Project namespace: .current() .list() .load() .rm() .help()",
        "  \x1b[33mvis\x1b[0m                              Visualization namespace: .waveform() .list() .remove() .clear()",
        "  \x1b[33mcorpus\x1b[0m                           KDTree corpus: .build() .query() .resynthesize()",
        "  \x1b[33mfs\x1b[0m                               Filesystem: .ls .la .cd .pwd .glob .walk",
        "  \x1b[33mhelp()\x1b[0m                           Show this help message",
        "  \x1b[33mclear()\x1b[0m                          Clear the terminal screen",
        "  \x1b[33merrors()\x1b[0m                         Show background errors (status line red = errors pending)",
        "",
        "\x1b[90mCompose commands:\x1b[0m",
        "  const samp = sn.read(\"path\")                           \x1b[90m# load sample\x1b[0m",
        "  env.inspect(\"samp\")                                   \x1b[90m# inspect a binding\x1b[0m",
        "  proj.load(\"drums\")                                    \x1b[90m# switch project context\x1b[0m",
        "  const onsets = samp.onsets(); onsets.slice()            \x1b[90m# onset workflow\x1b[0m",
        "  const feature = samp.nmf(); feature.sep()               \x1b[90m# NMF separation\x1b[0m",
        "  vis.waveform(samp).overlay(onsets).show()               \x1b[90m# visualize onsets\x1b[0m",
        "  vis.waveform(samp).overlay(samp.nmf()).show()           \x1b[90m# visualize NMF\x1b[0m",
        "  vis.waveform(samp1).overlay(samp1.nx(samp2)).show()    \x1b[90m# NMF cross-synthesis\x1b[0m",
        "  corpus.build(samp) → corpus.query(0, 5)                 \x1b[90m# corpus search\x1b[0m",
        "",
        "\x1b[90mFor detailed usage:\x1b[0m \x1b[33mobj.help()\x1b[0m  \x1b[90me.g. sn.help(), vis.help(), const samp = sn.read(\"x\"); samp.help(), fs.help()\x1b[0m",
      ].join("\n"));
    },
    {
      help: (): BounceResult => new BounceResult([
        "\x1b[1;36mhelp()\x1b[0m",
        "",
        "  Show the organized command reference. For detailed usage of a specific",
        "  command or object, call its .help() method directly.",
        "",
        "  \x1b[90mExample:\x1b[0m  help()",
        "           sn.help()",
        "           corpus.help()",
      ].join("\n")),
    },
  );

  const clear = Object.assign(
    function clear(): void {
      terminal.clear();
    },
    {
      help: (): BounceResult => new BounceResult([
        "\x1b[1;36mclear()\x1b[0m",
        "",
        "  Clear the terminal screen.",
        "",
        "  \x1b[90mExample:\x1b[0m  clear()",
      ].join("\n")),
    },
  );

  const debug = Object.assign(
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
    {
      help: (): BounceResult => new BounceResult([
        "\x1b[1;36mdebug(limit?)\x1b[0m",
        "",
        "  Show the most recent entries from the SQLite debug log store.",
        "  Useful for diagnosing issues with audio processing or IPC.",
        "",
        "  \x1b[33mlimit\x1b[0m  Number of entries to show (default 20)",
        "",
        "  \x1b[90mExample:\x1b[0m  debug()",
        "           debug(50)",
      ].join("\n")),
    },
  );

  const clearDebug = Object.assign(
    async function clearDebug(): Promise<BounceResult> {
      await window.electron.clearDebugLogs();
      return new BounceResult("\x1b[32mDebug logs cleared\x1b[0m");
    },
    {
      help: (): BounceResult => new BounceResult([
        "\x1b[1;36mclearDebug()\x1b[0m",
        "",
        "  Clear all entries from the debug log store.",
        "",
        "  \x1b[90mExample:\x1b[0m  clearDebug()",
      ].join("\n")),
    },
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
      dismiss: Object.assign(
        async function dismiss(id: number): Promise<BounceResult> {
          const ok = await window.electron.dismissBackgroundError(id);
          return ok
            ? new BounceResult(`\x1b[32mDismissed error ${id}\x1b[0m`)
            : new BounceResult(`\x1b[33mNo active error with id ${id}\x1b[0m`);
        },
        {
          help: (): BounceResult => new BounceResult([
            "\x1b[1;36merrors.dismiss(id)\x1b[0m",
            "",
            "  Dismiss a specific background error by its numeric id.",
            "",
            "  \x1b[90mExample:\x1b[0m  errors.dismiss(3)",
          ].join("\n")),
        },
      ),
      dismissAll: Object.assign(
        async function dismissAll(): Promise<BounceResult> {
          const count = await window.electron.dismissAllBackgroundErrors();
          return count > 0
            ? new BounceResult(`\x1b[32mDismissed ${count} error${count === 1 ? "" : "s"}\x1b[0m`)
            : new BounceResult("\x1b[32mNo active errors to dismiss\x1b[0m");
        },
        {
          help: (): BounceResult => new BounceResult([
            "\x1b[1;36merrors.dismissAll()\x1b[0m",
            "",
            "  Dismiss all active background errors.",
            "",
            "  \x1b[90mExample:\x1b[0m  errors.dismissAll()",
          ].join("\n")),
        },
      ),
      help: (): BounceResult => new BounceResult([
        "\x1b[1;36merrors()\x1b[0m",
        "",
        "  Show active background errors from main or utility processes.",
        "  When the status line shows a red indicator, use this to see details.",
        "",
        "  \x1b[33merrors.dismiss(id)\x1b[0m   Dismiss a single error by id",
        "  \x1b[33merrors.dismissAll()\x1b[0m  Dismiss all active errors",
        "",
        "  \x1b[90mExample:\x1b[0m  errors()",
        "           errors.dismiss(3)",
        "           errors.dismissAll()",
      ].join("\n")),
    },
  );

  return { help, clear, debug, clearDebug, errors };
}
