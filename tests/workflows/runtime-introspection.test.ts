import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import { bootServices } from "./helpers";
import type { WorkflowServices } from "./helpers";
import { EnvNamespace } from "../../src/renderer/namespaces/env-namespace";
import type { NamespaceDeps } from "../../src/renderer/namespaces/types";
import type { RuntimeScopeEntry } from "../../src/renderer/runtime-introspection";
import { envCommands } from "../../src/renderer/namespaces/env-commands.generated";

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
    terminal: null as unknown as NamespaceDeps["terminal"],
    audioManager: null as unknown as NamespaceDeps["audioManager"],
    getSceneManager: () => { throw new Error("getSceneManager not available in workflow test"); },
  };
}

function str(result: unknown): string {
  return String(result);
}

const fakeGlobals: Record<string, unknown> = {
  sn: { read: () => {}, list: () => {}, current: () => {} },
  env: {},
  proj: { load: () => {}, list: () => {} },
};

describe("runtime-introspection", () => {
  let services: WorkflowServices;
  let cleanup: () => void;

  beforeAll(() => {
    const booted = bootServices();
    services = booted.ctx;
    cleanup = booted.cleanup;
  });

  afterAll(() => cleanup?.());

  it("globals-lists-known-globals", () => {
    const env = new EnvNamespace(makeEnvDeps(fakeGlobals));
    const result = str(env.globals());
    assert.ok(result.includes("sn"), `expected "sn" in globals output:\n${result}`);
    assert.ok(result.includes("env"), `expected "env" in globals output:\n${result}`);
    assert.ok(result.includes("proj"), `expected "proj" in globals output:\n${result}`);
  });

  it("globals-contains-bounce-globals-heading", () => {
    const env = new EnvNamespace(makeEnvDeps(fakeGlobals));
    const result = str(env.globals());
    assert.ok(result.includes("Bounce Globals"), `expected "Bounce Globals" heading:\n${result}`);
  });

  it("vars-empty-when-no-user-variables", () => {
    const env = new EnvNamespace(makeEnvDeps(fakeGlobals, []));
    const result = str(env.vars());
    assert.ok(
      result.includes("No user-defined variables"),
      `expected empty-scope message:\n${result}`,
    );
  });

  it("vars-lists-user-defined-variables", () => {
    const entries: RuntimeScopeEntry[] = [{ name: "answer", value: 42 }];
    const env = new EnvNamespace(makeEnvDeps(fakeGlobals, entries));
    const result = str(env.vars());
    assert.ok(result.includes("answer"), `expected "answer" in vars output:\n${result}`);
  });

  it("vars-shows-type-for-user-variable", () => {
    const entries: RuntimeScopeEntry[] = [{ name: "myNum", value: 99 }];
    const env = new EnvNamespace(makeEnvDeps(fakeGlobals, entries));
    const result = str(env.vars());
    assert.ok(result.includes("number"), `expected type "number" in vars output:\n${result}`);
  });

  it("inspect-shows-global-scope-for-bounce-globals", () => {
    const env = new EnvNamespace(makeEnvDeps(fakeGlobals));
    const result = str(env.inspect("sn"));
    assert.ok(result.includes("global"), `expected "global" scope in inspect output:\n${result}`);
  });

  it("inspect-shows-user-scope-for-user-variables", () => {
    const entries: RuntimeScopeEntry[] = [{ name: "myNum", value: 99 }];
    const env = new EnvNamespace(makeEnvDeps(fakeGlobals, entries));
    const result = str(env.inspect("myNum"));
    assert.ok(result.includes("user"), `expected "user" scope in inspect output:\n${result}`);
    assert.ok(result.includes("number"), `expected type "number" in inspect output:\n${result}`);
  });

  it("functions-lists-callable-members-of-global", () => {
    const env = new EnvNamespace(makeEnvDeps(fakeGlobals));
    const result = str(env.functions("sn"));
    assert.ok(result.includes("read"), `expected "read" in functions("sn") output:\n${result}`);
    assert.ok(result.includes("list"), `expected "list" in functions("sn") output:\n${result}`);
  });

  it("functions-no-arg-lists-user-defined-functions", () => {
    const greetFn = function greet() { return "hi"; };
    const entries: RuntimeScopeEntry[] = [{ name: "greet", value: greetFn }];
    const env = new EnvNamespace(makeEnvDeps(fakeGlobals, entries));
    const result = str(env.functions());
    assert.ok(result.includes("greet"), `expected "greet" in functions() output:\n${result}`);
  });

  it("envCommands-has-vars-entry", () => {
    const entry = envCommands.find((c) => c.name === "vars");
    assert.ok(entry, "envCommands should contain a 'vars' entry");
    assert.ok(entry.summary.length > 0, "envCommands['vars'].summary should be non-empty");
  });

  it("envCommands-has-globals-entry", () => {
    const entry = envCommands.find((c) => c.name === "globals");
    assert.ok(entry, "envCommands should contain a 'globals' entry");
    assert.ok(entry.summary.length > 0, "envCommands['globals'].summary should be non-empty");
  });

  it("envCommands-has-inspect-entry", () => {
    const entry = envCommands.find((c) => c.name === "inspect");
    assert.ok(entry, "envCommands should contain an 'inspect' entry");
    assert.ok(entry.summary.length > 0, "envCommands['inspect'].summary should be non-empty");
  });

  it("envCommands-has-functions-entry", () => {
    const entry = envCommands.find((c) => c.name === "functions");
    assert.ok(entry, "envCommands should contain a 'functions' entry");
    assert.ok(entry.summary.length > 0, "envCommands['functions'].summary should be non-empty");
  });
});
