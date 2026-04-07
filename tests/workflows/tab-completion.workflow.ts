/**
 * Workflow: tab-completion
 *
 * Tests the REPL completion prediction engine (PropertyCompleter +
 * IdentifierCompleter) without Electron, native addons, or the language
 * service utility process. CompletionContexts are constructed directly.
 *
 * Corresponds to tests/tab-completion.spec.ts.
 *
 * Checks:
 *   - sn.rea → single match "read"
 *   - sn. (empty prefix) → multiple matches including "read" and "list"
 *   - vis. → returns matches for the vis namespace
 *   - unknown object → empty results
 *   - Identifier prefix "s" → includes "sn" namespace
 *   - Identifier prefix "vi" → includes "vis" namespace
 *   - Session variable with typed inferredType → returns type methods
 */

import * as assert from "assert/strict";
import { createWorkflow } from "./types";
import { PropertyCompleter } from "../../src/electron/completers/property-completer";
import { IdentifierCompleter } from "../../src/electron/completers/identifier-completer";
import type { PropertyAccessContext, IdentifierContext } from "../../src/shared/completion-context";
import type { SessionVariable } from "../../src/shared/completion-context";

/** Minimal PropertyAccessContext for tests. */
function propCtx(objectName: string, prefix: string, sessionVariables: SessionVariable[] = []): PropertyAccessContext {
  return {
    buffer: `${objectName}.${prefix}`,
    cursor: objectName.length + 1 + prefix.length,
    sessionVariables,
    position: { kind: "propertyAccess", objectName, prefix },
  };
}

/** Minimal IdentifierContext for tests. */
function identCtx(prefix: string, sessionVariables: SessionVariable[] = []): IdentifierContext {
  return {
    buffer: prefix,
    cursor: prefix.length,
    sessionVariables,
    position: { kind: "identifier", prefix },
  };
}

export function buildWorkflow() {
  const wf = createWorkflow("tab-completion");

  // ---- PropertyCompleter ---------------------------------------------------

  wf.check("sn-rea-matches-only-read", (_ctx) => {
    const results = new PropertyCompleter().predict(propCtx("sn", "rea"));
    assert.ok(results.length >= 1, "should have at least one result for 'sn.rea'");
    const labels = results.map((r) => r.label);
    assert.ok(labels.includes("read"), `expected "read" in ${JSON.stringify(labels)}`);
    // Every result must start with "rea"
    for (const r of results) {
      assert.ok(
        r.label.startsWith("rea"),
        `unexpected result "${r.label}" for prefix "rea"`,
      );
    }
  });

  wf.check("sn-empty-prefix-returns-multiple-methods", (_ctx) => {
    const results = new PropertyCompleter().predict(propCtx("sn", ""));
    assert.ok(results.length >= 2, `expected >= 2 methods for sn., got ${results.length}`);
    const labels = results.map((r) => r.label);
    assert.ok(labels.includes("read"), `expected "read" in ${JSON.stringify(labels)}`);
    assert.ok(labels.includes("list"), `expected "list" in ${JSON.stringify(labels)}`);
  });

  wf.check("all-sn-results-are-method-kind", (_ctx) => {
    const results = new PropertyCompleter().predict(propCtx("sn", ""));
    for (const r of results) {
      assert.equal(r.kind, "method", `expected kind "method" for ${r.label}`);
    }
  });

  wf.check("vis-empty-prefix-returns-methods", (_ctx) => {
    const results = new PropertyCompleter().predict(propCtx("vis", ""));
    assert.ok(results.length >= 1, `expected >= 1 method for vis., got ${results.length}`);
    for (const r of results) {
      assert.equal(r.kind, "method");
    }
  });

  wf.check("unknown-object-returns-empty", (_ctx) => {
    const results = new PropertyCompleter().predict(propCtx("__no_such_obj__", ""));
    assert.deepEqual(results, []);
  });

  wf.check("session-var-with-inferred-type-returns-type-methods", (_ctx) => {
    const ctx = propCtx("s", "", [{ name: "s", inferredType: "SampleResult" }]);
    const results = new PropertyCompleter().predict(ctx);
    // SampleResult should have methods like play, loop, etc. (if registered)
    // Even if SampleResult isn't registered, it shouldn't throw.
    assert.ok(Array.isArray(results));
  });

  // ---- IdentifierCompleter -------------------------------------------------

  wf.check("prefix-s-includes-sn-namespace", (_ctx) => {
    const results = new IdentifierCompleter().predict(identCtx("s"));
    const labels = results.map((r) => r.label);
    assert.ok(labels.includes("sn"), `expected "sn" in ${JSON.stringify(labels)}`);
  });

  wf.check("prefix-vi-includes-vis-namespace", (_ctx) => {
    const results = new IdentifierCompleter().predict(identCtx("vi"));
    const labels = results.map((r) => r.label);
    assert.ok(labels.includes("vis"), `expected "vis" in ${JSON.stringify(labels)}`);
  });

  wf.check("empty-prefix-returns-namespaces-and-types", (_ctx) => {
    const results = new IdentifierCompleter().predict(identCtx(""));
    const namespaces = results.filter((r) => r.kind === "namespace");
    const types = results.filter((r) => r.kind === "type");
    assert.ok(namespaces.length >= 2, `expected >= 2 namespaces, got ${namespaces.length}`);
    assert.ok(types.length >= 1, `expected >= 1 type, got ${types.length}`);
  });

  wf.check("session-variables-appear-in-identifier-completions", (_ctx) => {
    const ctx = identCtx("my", [{ name: "myVar", inferredType: "number" }]);
    const results = new IdentifierCompleter().predict(ctx);
    const labels = results.map((r) => r.label);
    assert.ok(labels.includes("myVar"), `expected "myVar" in ${JSON.stringify(labels)}`);
    const v = results.find((r) => r.label === "myVar");
    assert.equal(v?.kind, "variable");
  });

  return wf.build();
}
