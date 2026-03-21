/// <reference path="../types.d.ts" />
/// <reference path="../bounce-globals.d.ts" />
import {
  BounceResult,
  EnvScopeResult,
  EnvInspectionResult,
  EnvFunctionListResult,
  type EnvEntrySummary,
  type EnvEntryScope,
  type EnvInspectScope,
} from "../bounce-result.js";
import {
  getCallablePropertyNames,
  getRuntimePreview,
  getRuntimeTypeLabel,
} from "../runtime-introspection.js";
import type { NamespaceDeps } from "./types.js";

export function buildEnvNamespace(deps: NamespaceDeps) {
  function getApiEntries(): Array<[string, unknown]> {
    return Object.entries(deps.sharedState.api ?? {});
  }

  function makeEnvEntry(
    name: string,
    scope: EnvEntryScope,
    value: unknown,
  ): EnvEntrySummary {
    return {
      name,
      scope,
      typeLabel: getRuntimeTypeLabel(value),
      callable: typeof value === "function",
      preview: getRuntimePreview(value),
    };
  }

  function formatEnvScopeTable(
    title: string,
    entries: EnvEntrySummary[],
    emptyMessage: string,
  ): string {
    if (entries.length === 0) {
      return [`\x1b[1;36m${title}\x1b[0m`, "", `\x1b[90m${emptyMessage}\x1b[0m`].join("\n");
    }

    const nameWidth = Math.max("Name".length, ...entries.map((entry) => entry.name.length));
    const typeWidth = Math.max("Type".length, ...entries.map((entry) => entry.typeLabel.length));
    const header =
      `${"Name".padEnd(nameWidth + 2)}` +
      `${"Type".padEnd(typeWidth + 2)}` +
      `${"Callable".padEnd(10)}` +
      "Preview";

    const rows = entries.map((entry) =>
      `${entry.name.padEnd(nameWidth + 2)}` +
      `${entry.typeLabel.padEnd(typeWidth + 2)}` +
      `${(entry.callable ? "yes" : "no").padEnd(10)}` +
      entry.preview,
    );

    return [
      `\x1b[1;36m${title}\x1b[0m`,
      "",
      header,
      "─".repeat(header.length),
      ...rows,
    ].join("\n");
  }

  function envHelpText(): BounceResult {
    return new BounceResult([
      "\x1b[1;36menv\x1b[0m — runtime introspection namespace",
      "",
      "  Inspect the current REPL environment, including user-defined variables,",
      "  built-in Bounce globals, callable members, and runtime value summaries.",
      "",
      "  env.vars()                List user-defined variables in scope",
      "  env.globals()             List built-in Bounce globals",
      "  env.inspect(nameOrValue)  Show details for one binding or value",
      "  env.functions(value)      List callable members on a value",
      "",
      "  \x1b[90mExamples:\x1b[0m  env.vars()",
      "            env.globals()",
      "            env.inspect(\"samp\")",
      "            env.functions(sn)",
    ].join("\n"));
  }

  function envScopeHelpText(label: "vars" | "globals"): BounceResult {
    return new BounceResult([
      `\x1b[1;36menv.${label}()\x1b[0m`,
      "",
      label === "vars"
        ? "  List user-defined bindings that persist across REPL evaluations."
        : "  List Bounce-provided globals exposed in the current REPL session.",
      "",
      "  Each entry shows a name, runtime type label, callable flag, and short preview.",
      "",
      `  \x1b[90mExample:\x1b[0m  env.${label}()`,
    ].join("\n"));
  }

  function envInspectHelpText(): BounceResult {
    return new BounceResult([
      "\x1b[1;36menv.inspect(nameOrValue)\x1b[0m",
      "",
      "  Inspect one runtime binding or direct value. If you pass a string that",
      "  matches a user variable or Bounce global, Bounce resolves it by name first.",
      "",
      "  \x1b[90mExamples:\x1b[0m  env.inspect(\"sn\")",
      "            env.inspect(\"samp\")",
      "            env.inspect(sn.current())",
    ].join("\n"));
  }

  function envFunctionsHelpText(): BounceResult {
    return new BounceResult([
      "\x1b[1;36menv.functions([value])\x1b[0m",
      "",
      "  With no argument: list all user-defined functions in scope.",
      "  With an argument: list callable members on that value using the same",
      "  callable-property rules as tab completion.",
      "",
      "  \x1b[90mExamples:\x1b[0m  env.functions()",
      "            env.functions(sn)",
      "            env.functions(\"samp\")",
    ].join("\n"));
  }

  function formatEnvInspection(
    name: string | undefined,
    scope: EnvInspectScope,
    value: unknown,
  ): EnvInspectionResult {
    const callableMembers =
      value && (typeof value === "object" || typeof value === "function")
        ? getCallablePropertyNames(value).sort()
        : [];
    const typeLabel = getRuntimeTypeLabel(value);
    const callable = typeof value === "function";
    const preview = getRuntimePreview(value);
    const lines = [
      `\x1b[1;36m${name ? `env.inspect(${name})` : "env.inspect(value)"}\x1b[0m`,
      "",
      name ? `  name:      ${name}` : "",
      `  scope:     ${scope}`,
      `  type:      ${typeLabel}`,
      `  callable:  ${callable ? "yes" : "no"}`,
      `  preview:   ${preview}`,
      callableMembers.length > 0
        ? `  methods:   ${callableMembers.slice(0, 8).join(", ")}${callableMembers.length > 8 ? ` … (+${callableMembers.length - 8})` : ""}`
        : "  methods:   none",
    ].filter(Boolean);

    return new EnvInspectionResult(
      lines.join("\n"),
      name,
      scope,
      typeLabel,
      callable,
      preview,
      callableMembers,
      envInspectHelpText,
    );
  }

  function resolveEnvTarget(nameOrValue: unknown): {
    name: string | undefined;
    scope: EnvInspectScope;
    value: unknown;
  } {
    if (typeof nameOrValue === "string") {
      if (deps.runtime?.hasScopeValue(nameOrValue)) {
        return {
          name: nameOrValue,
          scope: "user",
          value: deps.runtime.getScopeValue(nameOrValue),
        };
      }
      const globalEntry = getApiEntries().find(([name]) => name === nameOrValue);
      if (globalEntry) {
        return {
          name: nameOrValue,
          scope: "global",
          value: globalEntry[1],
        };
      }
    }

    return {
      name: undefined,
      scope: "value",
      value: nameOrValue,
    };
  }

  const env = {
    help(): BounceResult {
      return envHelpText();
    },

    vars: Object.assign(
      function vars(): EnvScopeResult {
        const entries = (deps.runtime?.listScopeEntries() ?? [])
          .map((entry) => makeEnvEntry(entry.name, "user", entry.value))
          .sort((left, right) => left.name.localeCompare(right.name));

        return new EnvScopeResult(
          formatEnvScopeTable("Runtime Variables", entries, "No user-defined variables in scope."),
          entries,
          () => envScopeHelpText("vars"),
        );
      },
      {
        help: (): BounceResult => envScopeHelpText("vars"),
      },
    ),

    globals: Object.assign(
      function globals(): EnvScopeResult {
        const entries = getApiEntries()
          .map(([name, value]) => makeEnvEntry(name, "global", value))
          .sort((left, right) => left.name.localeCompare(right.name));

        return new EnvScopeResult(
          formatEnvScopeTable("Bounce Globals", entries, "No globals available."),
          entries,
          () => envScopeHelpText("globals"),
        );
      },
      {
        help: (): BounceResult => envScopeHelpText("globals"),
      },
    ),

    inspect: Object.assign(
      function inspect(nameOrValue: unknown): EnvInspectionResult {
        const target = resolveEnvTarget(nameOrValue);
        return formatEnvInspection(target.name, target.scope, target.value);
      },
      {
        help: (): BounceResult => envInspectHelpText(),
      },
    ),

    functions: Object.assign(
      function functions(nameOrValue?: unknown): EnvFunctionListResult {
        if (nameOrValue === undefined) {
          const names = (deps.runtime?.listScopeEntries() ?? [])
            .filter(({ value }) => typeof value === "function")
            .map(({ name }) => name)
            .sort();
          const display =
            names.length === 0
              ? [
                  "\x1b[1;36mUser-Defined Functions\x1b[0m",
                  "",
                  "\x1b[90mNo user-defined functions in scope.\x1b[0m",
                ].join("\n")
              : [
                  "\x1b[1;36mUser-Defined Functions\x1b[0m",
                  "",
                  ...names.map((name) => `  ${name}()`),
                ].join("\n");
          return new EnvFunctionListResult(display, "function", names, envFunctionsHelpText);
        }

        const target = resolveEnvTarget(nameOrValue);
        const callableMembers =
          target.value && (typeof target.value === "object" || typeof target.value === "function")
            ? getCallablePropertyNames(target.value).sort()
            : [];
        const targetLabel = target.name ?? getRuntimeTypeLabel(target.value);
        const display =
          callableMembers.length === 0
            ? [
                `\x1b[1;36mCallable Members: ${targetLabel}\x1b[0m`,
                "",
                "\x1b[90mNo callable members found.\x1b[0m",
              ].join("\n")
            : [
                `\x1b[1;36mCallable Members: ${targetLabel}\x1b[0m`,
                "",
                ...callableMembers.map((name) => `  ${name}()`),
              ].join("\n");

        return new EnvFunctionListResult(
          display,
          getRuntimeTypeLabel(target.value),
          callableMembers,
          envFunctionsHelpText,
        );
      },
      {
        help: (): BounceResult => envFunctionsHelpText(),
      },
    ),
  };

  return env;
}
