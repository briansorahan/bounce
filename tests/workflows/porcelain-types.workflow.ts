/**
 * Workflow: porcelain-types
 *
 * Verifies that the REPL-facing result types (Sample, SliceFeature, NmfFeature,
 * Pattern) are correctly registered in the repl-registration type registry via
 * their @replType decorators, and that each exposes the expected methods.
 *
 * This is achieved by importing the renderer result classes (which triggers
 * decorator registration) and then querying the registry directly.
 * No Electron, no window, no IPC — decorators run at class-definition time
 * and are pure in-memory writes.
 *
 * Corresponds to the registry-level assertions in tests/porcelain-types.spec.ts.
 * The Playwright spec additionally verifies rendered terminal output; that
 * remains covered there.
 *
 * Note on method checks: tsx/esbuild passes the class constructor (not prototype)
 * to method decorators, breaking WeakMap-keyed metadata for @describe-decorated
 * prototype methods. Only methods registered via registerMethod() inside a class
 * decorator (e.g. SampleResult's @withLoopMeta → loop) survive in this env.
 * The Playwright spec (tests/porcelain-types.spec.ts) covers method-level output
 * in the full Electron+tsc environment where @describe works correctly.
 *
 * Checks:
 *   - Sample is registered with a non-empty summary
 *   - Sample has the `loop` method in the registry (registered via registerMethod)
 *   - SliceFeature is registered with a non-empty summary
 *   - NmfFeature is registered with a non-empty summary
 *   - Pattern is registered with a non-empty summary
 */

import * as assert from "assert/strict";
import { createWorkflow } from "./types";
import { getType } from "../../src/shared/repl-registration";

// Import result classes to trigger @replType decorator registration.
// No constructors are called — decorators run at class-definition time.
import "../../src/renderer/results/sample";
import "../../src/renderer/results/features";
import "../../src/renderer/results/pattern";

export function buildWorkflow() {
  const wf = createWorkflow("porcelain-types");

  // ---- Sample ---------------------------------------------------------------

  wf.check("Sample-is-registered", () => {
    const t = getType("Sample");
    assert.ok(t, "Sample should be registered in the type registry");
    assert.ok(t.summary.length > 0, "Sample should have a non-empty summary");
  });

  wf.check("Sample-has-loop-method", () => {
    const methods = getType("Sample")?.methods ?? {};
    // loop is registered via registerMethod() inside @withLoopMeta (a class decorator),
    // so it survives the tsx/esbuild environment where @describe method decorators do not.
    assert.ok("loop" in methods, `Sample.methods should include "loop", got: ${Object.keys(methods).join(", ")}`);
  });

  // ---- SliceFeature ---------------------------------------------------------

  wf.check("SliceFeature-is-registered", () => {
    const t = getType("SliceFeature");
    assert.ok(t, "SliceFeature should be registered in the type registry");
    assert.ok(t.summary.length > 0, "SliceFeature should have a non-empty summary");
  });

  // ---- NmfFeature -----------------------------------------------------------

  wf.check("NmfFeature-is-registered", () => {
    const t = getType("NmfFeature");
    assert.ok(t, "NmfFeature should be registered in the type registry");
    assert.ok(t.summary.length > 0, "NmfFeature should have a non-empty summary");
  });

  // ---- Pattern --------------------------------------------------------------

  wf.check("Pattern-is-registered", () => {
    const t = getType("Pattern");
    assert.ok(t, "Pattern should be registered in the type registry");
    assert.ok(t.summary.length > 0, "Pattern should have a non-empty summary");
  });

  return wf.build();
}
