/**
 * Workflow: runtime-introspection
 *
 * Tests the EnvNamespace service logic (env.globals(), env.vars(),
 * env.inspect(), env.functions()) by instantiating the namespace directly
 * with a hand-crafted NamespaceDeps mock.
 *
 * No Electron, no IPC, no window. EnvNamespace only reads:
 *   - this.deps.sharedState.api  (the globals object)
 *   - this.deps.runtime          (the live REPL scope)
 * The remaining NamespaceDeps fields (terminal, audioManager, getSceneManager)
 * are unused by EnvNamespace and are stubbed with null casts.
 *
 * Corresponds to tests/runtime-introspection.spec.ts.
 *
 * Checks:
 *   - env.globals() lists known Bounce globals (sn, env, proj)
 *   - env.vars() shows empty message when no user variables defined
 *   - env.vars() lists user-defined variables
 *   - env.inspect() shows scope: global for Bounce globals
 *   - env.inspect() shows scope: user for user-defined variables
 *   - env.functions() lists callable members of a global
 *   - env.functions() with no argument lists user-defined functions
 *   - env.vars.help(), env.globals.help(), env.inspect.help(),
 *     env.functions.help() each return a non-empty description
 *     → replaced by envCommands pre-generated array checks (tsx/esbuild breaks
 *       @describe method decorator registration; attachNamespaceMethodHelp is
 *       called at app boot, not constructor time)
 */

import * as assert from "assert/strict";
import { createWorkflow } from "./types";
import { EnvNamespace } from "../../src/renderer/namespaces/env-namespace";
import type { NamespaceDeps } from "../../src/renderer/namespaces/types";
import type { RuntimeScopeEntry } from "../../src/renderer/runtime-introspection";
import { envCommands } from "../../src/renderer/namespaces/env-commands.generated";

/** Minimal stub that satisfies NamespaceDeps for EnvNamespace. */
function makeEnvDeps(
  globals: Record<string, unknown>,
  scopeEntries: RuntimeScopeEntry[] = [],
): NamespaceDeps {
  return {
    sharedState: { api: globals, visualizationScenes: null },
    runtime: {
      listScopeEntries: () => scopeEntries,
      hasScopeValue: (name) => scopeEntries.some((e) => e.name === name),
      getScopeValue: (name) => scopeEntries.find((e) => e.name === name)?.value,
      serializeScope: () => scopeEntries.map((e) => ({
        name: e.name,
        kind: "json" as const,
        value: JSON.stringify(e.value),
      })),
    },
    // EnvNamespace does not use these — stub with null casts.
    terminal: null as unknown as NamespaceDeps["terminal"],
    audioManager: null as unknown as NamespaceDeps["audioManager"],
    getSceneManager: () => { throw new Error("getSceneManager not available in workflow test"); },
  };
}

/** Pull the string content out of a BounceResult (or any object with toString). */
function str(result: unknown): string {
  return String(result);
}

export function buildWorkflow() {
  const wf = createWorkflow("runtime-introspection");

  // Shared globals object used across checks.
  const fakeGlobals: Record<string, unknown> = {
    sn: { read: () => {}, list: () => {}, current: () => {} },
    env: {},
    proj: { load: () => {}, list: () => {} },
  };

  // ---- env.globals() -------------------------------------------------------

  wf.check("globals-lists-known-globals", () => {
    const env = new EnvNamespace(makeEnvDeps(fakeGlobals));
    const result = str(env.globals());
    assert.ok(result.includes("sn"), `expected "sn" in globals output:\n${result}`);
    assert.ok(result.includes("env"), `expected "env" in globals output:\n${result}`);
    assert.ok(result.includes("proj"), `expected "proj" in globals output:\n${result}`);
  });

  wf.check("globals-contains-bounce-globals-heading", () => {
    const env = new EnvNamespace(makeEnvDeps(fakeGlobals));
    const result = str(env.globals());
    assert.ok(result.includes("Bounce Globals"), `expected "Bounce Globals" heading:\n${result}`);
  });

  // ---- env.vars() ----------------------------------------------------------

  wf.check("vars-empty-when-no-user-variables", () => {
    const env = new EnvNamespace(makeEnvDeps(fakeGlobals, []));
    const result = str(env.vars());
    assert.ok(
      result.includes("No user-defined variables"),
      `expected empty-scope message:\n${result}`,
    );
  });

  wf.check("vars-lists-user-defined-variables", () => {
    const entries: RuntimeScopeEntry[] = [{ name: "answer", value: 42 }];
    const env = new EnvNamespace(makeEnvDeps(fakeGlobals, entries));
    const result = str(env.vars());
    assert.ok(result.includes("answer"), `expected "answer" in vars output:\n${result}`);
  });

  wf.check("vars-shows-type-for-user-variable", () => {
    const entries: RuntimeScopeEntry[] = [{ name: "myNum", value: 99 }];
    const env = new EnvNamespace(makeEnvDeps(fakeGlobals, entries));
    const result = str(env.vars());
    assert.ok(result.includes("number"), `expected type "number" in vars output:\n${result}`);
  });

  // ---- env.inspect() -------------------------------------------------------

  wf.check("inspect-shows-global-scope-for-bounce-globals", () => {
    const env = new EnvNamespace(makeEnvDeps(fakeGlobals));
    const result = str(env.inspect("sn"));
    assert.ok(result.includes("global"), `expected "global" scope in inspect output:\n${result}`);
  });

  wf.check("inspect-shows-user-scope-for-user-variables", () => {
    const entries: RuntimeScopeEntry[] = [{ name: "myNum", value: 99 }];
    const env = new EnvNamespace(makeEnvDeps(fakeGlobals, entries));
    const result = str(env.inspect("myNum"));
    assert.ok(result.includes("user"), `expected "user" scope in inspect output:\n${result}`);
    assert.ok(result.includes("number"), `expected type "number" in inspect output:\n${result}`);
  });

  // ---- env.functions() -----------------------------------------------------

  wf.check("functions-lists-callable-members-of-global", () => {
    const env = new EnvNamespace(makeEnvDeps(fakeGlobals));
    const result = str(env.functions("sn"));
    assert.ok(result.includes("read"), `expected "read" in functions("sn") output:\n${result}`);
    assert.ok(result.includes("list"), `expected "list" in functions("sn") output:\n${result}`);
  });

  wf.check("functions-no-arg-lists-user-defined-functions", () => {
    const greetFn = function greet() { return "hi"; };
    const entries: RuntimeScopeEntry[] = [{ name: "greet", value: greetFn }];
    const env = new EnvNamespace(makeEnvDeps(fakeGlobals, entries));
    const result = str(env.functions());
    assert.ok(result.includes("greet"), `expected "greet" in functions() output:\n${result}`);
  });

  // ---- help() metadata via pre-generated commands array -------------------
  // Note: env.vars.help() is attached by attachNamespaceMethodHelp() at app boot
  // (not at constructor time), and @describe method decorators are broken in the
  // tsx/esbuild environment (esbuild passes constructor, not prototype, to method
  // decorators, so the method registry is empty at runtime). Instead, we verify
  // the statically pre-generated envCommands array — the same source of truth
  // used by the help system — contains descriptions for each sub-command.

  wf.check("envCommands-has-vars-entry", () => {
    const entry = envCommands.find((c) => c.name === "vars");
    assert.ok(entry, "envCommands should contain a 'vars' entry");
    assert.ok(entry.summary.length > 0, "envCommands['vars'].summary should be non-empty");
  });

  wf.check("envCommands-has-globals-entry", () => {
    const entry = envCommands.find((c) => c.name === "globals");
    assert.ok(entry, "envCommands should contain a 'globals' entry");
    assert.ok(entry.summary.length > 0, "envCommands['globals'].summary should be non-empty");
  });

  wf.check("envCommands-has-inspect-entry", () => {
    const entry = envCommands.find((c) => c.name === "inspect");
    assert.ok(entry, "envCommands should contain an 'inspect' entry");
    assert.ok(entry.summary.length > 0, "envCommands['inspect'].summary should be non-empty");
  });

  wf.check("envCommands-has-functions-entry", () => {
    const entry = envCommands.find((c) => c.name === "functions");
    assert.ok(entry, "envCommands should contain a 'functions' entry");
    assert.ok(entry.summary.length > 0, "envCommands['functions'].summary should be non-empty");
  });

  return wf.build();
}
