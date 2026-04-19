import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import { bootServices } from "./helpers";
import type { WorkflowServices } from "./helpers";
import { PropertyCompleter } from "../../src/electron/completers/property-completer";
import { IdentifierCompleter } from "../../src/electron/completers/identifier-completer";
import type { PropertyAccessContext, IdentifierContext, SessionVariable } from "../../src/shared/completion-context";

function propCtx(objectName: string, prefix: string, sessionVariables: SessionVariable[] = []): PropertyAccessContext {
  return {
    buffer: `${objectName}.${prefix}`,
    cursor: objectName.length + 1 + prefix.length,
    sessionVariables,
    position: { kind: "propertyAccess", objectName, prefix },
  };
}

function identCtx(prefix: string, sessionVariables: SessionVariable[] = []): IdentifierContext {
  return {
    buffer: prefix,
    cursor: prefix.length,
    sessionVariables,
    position: { kind: "identifier", prefix },
  };
}

describe("tab-completion", () => {
  let services: WorkflowServices;
  let cleanup: () => void;

  beforeAll(() => {
    const booted = bootServices();
    services = booted.ctx;
    cleanup = booted.cleanup;
  });

  afterAll(() => cleanup?.());

  it("sn-rea-matches-only-read", () => {
    const results = new PropertyCompleter().predict(propCtx("sn", "rea"));
    assert.ok(results.length >= 1, "should have at least one result for 'sn.rea'");
    const labels = results.map((r) => r.label);
    assert.ok(labels.includes("read"), `expected "read" in ${JSON.stringify(labels)}`);
    for (const r of results) {
      assert.ok(
        r.label.startsWith("rea"),
        `unexpected result "${r.label}" for prefix "rea"`,
      );
    }
  });

  it("sn-empty-prefix-returns-multiple-methods", () => {
    const results = new PropertyCompleter().predict(propCtx("sn", ""));
    assert.ok(results.length >= 2, `expected >= 2 methods for sn., got ${results.length}`);
    const labels = results.map((r) => r.label);
    assert.ok(labels.includes("read"), `expected "read" in ${JSON.stringify(labels)}`);
    assert.ok(labels.includes("list"), `expected "list" in ${JSON.stringify(labels)}`);
  });

  it("all-sn-results-are-method-kind", () => {
    const results = new PropertyCompleter().predict(propCtx("sn", ""));
    for (const r of results) {
      assert.equal(r.kind, "method", `expected kind "method" for ${r.label}`);
    }
  });

  it("vis-empty-prefix-returns-methods", () => {
    const results = new PropertyCompleter().predict(propCtx("vis", ""));
    assert.ok(results.length >= 1, `expected >= 1 method for vis., got ${results.length}`);
    for (const r of results) {
      assert.equal(r.kind, "method");
    }
  });

  it("unknown-object-returns-empty", () => {
    const results = new PropertyCompleter().predict(propCtx("__no_such_obj__", ""));
    assert.deepEqual(results, []);
  });

  it("session-var-with-inferred-type-returns-type-methods", () => {
    const ctx = propCtx("s", "", [{ name: "s", inferredType: "SampleResult" }]);
    const results = new PropertyCompleter().predict(ctx);
    assert.ok(Array.isArray(results));
  });

  it("prefix-s-includes-sn-namespace", () => {
    const results = new IdentifierCompleter().predict(identCtx("s"));
    const labels = results.map((r) => r.label);
    assert.ok(labels.includes("sn"), `expected "sn" in ${JSON.stringify(labels)}`);
  });

  it("prefix-vi-includes-vis-namespace", () => {
    const results = new IdentifierCompleter().predict(identCtx("vi"));
    const labels = results.map((r) => r.label);
    assert.ok(labels.includes("vis"), `expected "vis" in ${JSON.stringify(labels)}`);
  });

  it("empty-prefix-returns-namespaces-and-types", () => {
    const results = new IdentifierCompleter().predict(identCtx(""));
    const namespaces = results.filter((r) => r.kind === "namespace");
    const types = results.filter((r) => r.kind === "type");
    assert.ok(namespaces.length >= 2, `expected >= 2 namespaces, got ${namespaces.length}`);
    assert.ok(types.length >= 1, `expected >= 1 type, got ${types.length}`);
  });

  it("session-variables-appear-in-identifier-completions", () => {
    const ctx = identCtx("my", [{ name: "myVar", inferredType: "number" }]);
    const results = new IdentifierCompleter().predict(ctx);
    const labels = results.map((r) => r.label);
    assert.ok(labels.includes("myVar"), `expected "myVar" in ${JSON.stringify(labels)}`);
    const v = results.find((r) => r.label === "myVar");
    assert.equal(v?.kind, "variable");
  });
});
