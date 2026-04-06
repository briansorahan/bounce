/**
 * Workflow: runtime-persistence
 *
 * Tests the ReplEnvService save/load IPC contract.
 * Corresponds to the persistence-side of tests/runtime-persistence.spec.ts
 * (the renderer-side scope restoration is not testable here).
 *
 * Checks:
 *   - getReplEnv() on empty store returns []
 *   - saveReplEnv() stores entries retrievable via getReplEnv()
 *   - JSON and function kinds are both persisted correctly
 *   - saveReplEnv() replaces all previous entries (not append)
 *   - saveReplEnv([]) clears all entries
 */

import * as assert from "assert/strict";
import { createWorkflow } from "./types";
import type { WorkflowServices } from "./helpers";
import type { ReplEnvEntry } from "../../src/shared/domain-types";

interface Ctx extends WorkflowServices, Record<string, unknown> {}

export function buildWorkflow() {
  const wf = createWorkflow("runtime-persistence");

  wf.check("empty-store-returns-empty-array", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const entries = await ctx.replEnvClient.invoke("getReplEnv", {});
    assert.deepEqual(entries, []);
  });

  const saveEntries = wf.action("save-repl-env", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const entries: ReplEnvEntry[] = [
      { name: "x", kind: "json", value: "42" },
      { name: "cfg", kind: "json", value: '{"rate":44100}' },
      { name: "double", kind: "function", value: "function double(n) { return n * 2; }" },
    ];
    await ctx.replEnvClient.invoke("saveReplEnv", { entries });
    return { savedEntries: entries };
  }, { after: ["empty-store-returns-empty-array"] });

  const readBack = wf.action("read-back-repl-env", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const entries = await ctx.replEnvClient.invoke("getReplEnv", {});
    return { readBackEntries: entries };
  }, { after: [saveEntries] });

  wf.check("saved-entries-are-returned", (rawCtx) => {
    const ctx = rawCtx as Ctx & {
      savedEntries: ReplEnvEntry[];
      readBackEntries: ReplEnvEntry[];
    };
    assert.deepEqual(ctx.readBackEntries, ctx.savedEntries);
  }, { after: [readBack] });

  wf.check("json-kind-is-preserved", (rawCtx) => {
    const ctx = rawCtx as Ctx & { readBackEntries: ReplEnvEntry[] };
    const x = ctx.readBackEntries.find((e) => e.name === "x");
    assert.ok(x, "entry 'x' should exist");
    assert.equal(x!.kind, "json");
    assert.equal(x!.value, "42");
  }, { after: [readBack] });

  wf.check("function-kind-is-preserved", (rawCtx) => {
    const ctx = rawCtx as Ctx & { readBackEntries: ReplEnvEntry[] };
    const fn = ctx.readBackEntries.find((e) => e.name === "double");
    assert.ok(fn, "entry 'double' should exist");
    assert.equal(fn!.kind, "function");
    assert.ok(fn!.value.includes("n * 2"));
  }, { after: [readBack] });

  // Save a new set — should REPLACE, not append.
  const overwrite = wf.action("overwrite-repl-env", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.replEnvClient.invoke("saveReplEnv", {
      entries: [{ name: "y", kind: "json", value: "99" }],
    });
    const entries = await ctx.replEnvClient.invoke("getReplEnv", {});
    return { afterOverwrite: entries };
  }, { after: [readBack] });

  wf.check("overwrite-replaces-previous-entries", (rawCtx) => {
    const ctx = rawCtx as Ctx & { afterOverwrite: ReplEnvEntry[] };
    assert.equal(ctx.afterOverwrite.length, 1, "should have exactly 1 entry after overwrite");
    assert.equal(ctx.afterOverwrite[0].name, "y");
  }, { after: [overwrite] });

  wf.check("overwritten-entries-are-gone", (rawCtx) => {
    const ctx = rawCtx as Ctx & { afterOverwrite: ReplEnvEntry[] };
    const x = ctx.afterOverwrite.find((e) => e.name === "x");
    assert.equal(x, undefined, "'x' should no longer exist after overwrite");
  }, { after: [overwrite] });

  // Clear all entries.
  const clearEntries = wf.action("clear-repl-env", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.replEnvClient.invoke("saveReplEnv", { entries: [] });
    const entries = await ctx.replEnvClient.invoke("getReplEnv", {});
    return { afterClear: entries };
  }, { after: [overwrite] });

  wf.check("clear-returns-empty-array", (rawCtx) => {
    const ctx = rawCtx as Ctx & { afterClear: ReplEnvEntry[] };
    assert.deepEqual(ctx.afterClear, []);
  }, { after: [clearEntries] });

  return wf.build();
}
