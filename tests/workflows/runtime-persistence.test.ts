import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import { bootServices } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { ReplEnvEntry } from "../../src/shared/domain-types";

describe("runtime-persistence", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let savedEntries: ReplEnvEntry[];
  let readBackEntries: ReplEnvEntry[];
  let afterOverwrite: ReplEnvEntry[];
  let afterClear: ReplEnvEntry[];

  beforeAll(() => {
    const booted = bootServices();
    services = booted.ctx;
    cleanup = booted.cleanup;
  });

  afterAll(() => cleanup?.());

  it("empty-store-returns-empty-array", async () => {
    const entries = await services.replEnvClient.invoke("getReplEnv", {});
    assert.deepEqual(entries, []);
  });

  it("save-repl-env", async () => {
    savedEntries = [
      { name: "x", kind: "json", value: "42" },
      { name: "cfg", kind: "json", value: '{"rate":44100}' },
      { name: "double", kind: "function", value: "function double(n) { return n * 2; }" },
    ];
    await services.replEnvClient.invoke("saveReplEnv", { entries: savedEntries });
  });

  it("read-back-repl-env", async () => {
    readBackEntries = await services.replEnvClient.invoke("getReplEnv", {});
  });

  it("saved-entries-are-returned", () => {
    assert.deepEqual(readBackEntries, savedEntries);
  });

  it("json-kind-is-preserved", () => {
    const x = readBackEntries.find((e) => e.name === "x");
    assert.ok(x, "entry 'x' should exist");
    assert.equal(x!.kind, "json");
    assert.equal(x!.value, "42");
  });

  it("function-kind-is-preserved", () => {
    const fn = readBackEntries.find((e) => e.name === "double");
    assert.ok(fn, "entry 'double' should exist");
    assert.equal(fn!.kind, "function");
    assert.ok(fn!.value.includes("n * 2"));
  });

  it("overwrite-repl-env", async () => {
    await services.replEnvClient.invoke("saveReplEnv", {
      entries: [{ name: "y", kind: "json", value: "99" }],
    });
    afterOverwrite = await services.replEnvClient.invoke("getReplEnv", {});
  });

  it("overwrite-replaces-previous-entries", () => {
    assert.equal(afterOverwrite.length, 1, "should have exactly 1 entry after overwrite");
    assert.equal(afterOverwrite[0].name, "y");
  });

  it("overwritten-entries-are-gone", () => {
    const x = afterOverwrite.find((e) => e.name === "x");
    assert.equal(x, undefined, "'x' should no longer exist after overwrite");
  });

  it("clear-repl-env", async () => {
    await services.replEnvClient.invoke("saveReplEnv", { entries: [] });
    afterClear = await services.replEnvClient.invoke("getReplEnv", {});
  });

  it("clear-returns-empty-array", () => {
    assert.deepEqual(afterClear, []);
  });
});
