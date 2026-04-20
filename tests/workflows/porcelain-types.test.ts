import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import { bootServices } from "./helpers";
import type { WorkflowServices } from "./helpers";
import { getType } from "../../src/shared/repl-registration";

// Import result classes to trigger @replType decorator registration.
import "../../src/renderer/results/sample";
import "../../src/renderer/results/features";
import "../../src/renderer/results/pattern";

describe("porcelain-types", () => {
  let services: WorkflowServices;
  let cleanup: () => void;

  beforeAll(() => {
    const booted = bootServices();
    services = booted.ctx;
    cleanup = booted.cleanup;
  });

  afterAll(() => cleanup?.());

  it("Sample-is-registered", () => {
    const t = getType("Sample");
    assert.ok(t, "Sample should be registered in the type registry");
    assert.ok(t.summary.length > 0, "Sample should have a non-empty summary");
  });

  it("Sample-has-loop-method", () => {
    const methods = getType("Sample")?.methods ?? {};
    assert.ok("loop" in methods, `Sample.methods should include "loop", got: ${Object.keys(methods).join(", ")}`);
  });

  it("SliceFeature-is-registered", () => {
    const t = getType("SliceFeature");
    assert.ok(t, "SliceFeature should be registered in the type registry");
    assert.ok(t.summary.length > 0, "SliceFeature should have a non-empty summary");
  });

  it("NmfFeature-is-registered", () => {
    const t = getType("NmfFeature");
    assert.ok(t, "NmfFeature should be registered in the type registry");
    assert.ok(t.summary.length > 0, "NmfFeature should have a non-empty summary");
  });

  it("Pattern-is-registered", () => {
    const t = getType("Pattern");
    assert.ok(t, "Pattern should be registered in the type registry");
    assert.ok(t.summary.length > 0, "Pattern should have a non-empty summary");
  });
});
