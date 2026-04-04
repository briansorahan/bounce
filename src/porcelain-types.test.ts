/**
 * Tests for the registry-based type help system.
 *
 * Verifies:
 *   1. Every registered replType has valid shape
 *   2. renderDescriptorHelp() returns non-empty BounceResult for every type
 *   3. Known types produce output containing expected method names
 */

import assert from "node:assert/strict";
import { listTypes } from "./shared/repl-registration.js";
import { renderDescriptorHelp } from "./renderer/help.js";

// Force registration of all replTypes by importing their modules.
import "./renderer/results/sample.js";
import "./renderer/results/features.js";
import "./renderer/results/visualization.js";
import "./renderer/results/instrument.js";
import "./renderer/results/recording.js";
import "./renderer/results/pattern.js";
import "./renderer/results/midi.js";

const types = listTypes();

// ---------------------------------------------------------------------------
// Test 1: Every registered type has a valid TypeDescriptor shape
// ---------------------------------------------------------------------------

{
  console.log("Test 1: TypeDescriptor shape invariants...");
  assert.ok(types.length > 0, "listTypes() must return at least one type");

  for (const td of types) {
    assert.ok(td.name && td.name.length > 0, `Type has empty name`);
    assert.ok(td.summary && td.summary.length > 0, `${td.name}: summary must be non-empty`);
    for (const [methodName, m] of Object.entries(td.methods)) {
      assert.ok(m.summary && m.summary.length > 0, `${td.name}.${methodName}: method summary must be non-empty`);
    }
  }
  console.log(`  ✓ ${types.length} types all have valid shape`);
}

// ---------------------------------------------------------------------------
// Test 2: renderDescriptorHelp() produces non-empty output for every type
// ---------------------------------------------------------------------------

{
  console.log("Test 2: renderDescriptorHelp() output...");
  for (const td of types) {
    const result = renderDescriptorHelp(td);
    const text = result.toString();
    assert.ok(text.length > 0, `${td.name}: renderDescriptorHelp returned empty string`);
    assert.ok(text.includes(td.name), `${td.name}: output must contain the type name`);
    assert.ok(text.includes(td.summary), `${td.name}: output must contain the summary`);
  }
  console.log(`  ✓ All ${types.length} types render non-empty output`);
}

// ---------------------------------------------------------------------------
// Test 3: Spot-check known types for expected content
// ---------------------------------------------------------------------------

{
  console.log("Test 3: Spot-check known type content...");

  function findType(name: string) {
    const t = types.find((td) => td.name === name);
    assert.ok(t, `Expected type '${name}' not found in registry`);
    return t!;
  }

  // Sample
  const sample = findType("Sample");
  const sampleOutput = renderDescriptorHelp(sample).toString();
  for (const method of ["play", "onsetSlice", "nmf", "mfcc"]) {
    assert.ok(sampleOutput.includes(method), `Sample output must include method '${method}'`);
  }
  console.log("  ✓ Sample");

  // SliceFeature
  const sf = findType("SliceFeature");
  const sfOutput = renderDescriptorHelp(sf).toString();
  assert.ok(sfOutput.includes("playSlice"), "SliceFeature output must include 'playSlice'");
  console.log("  ✓ SliceFeature");

  // NmfFeature
  const nmf = findType("NmfFeature");
  const nmfOutput = renderDescriptorHelp(nmf).toString();
  assert.ok(nmfOutput.includes("playComponent"), "NmfFeature output must include 'playComponent'");
  console.log("  ✓ NmfFeature");

  // VisScene
  const vs = findType("VisScene");
  const vsOutput = renderDescriptorHelp(vs).toString();
  assert.ok(vsOutput.includes("show"), "VisScene output must include 'show'");
  assert.ok(vsOutput.includes("overlay"), "VisScene output must include 'overlay'");
  console.log("  ✓ VisScene");

  // Pattern
  const pat = findType("Pattern");
  const patOutput = renderDescriptorHelp(pat).toString();
  assert.ok(patOutput.includes("play"), "Pattern output must include 'play'");
  assert.ok(patOutput.includes("stop"), "Pattern output must include 'stop'");
  console.log("  ✓ Pattern");
}

console.log("\nAll porcelain-types tests passed ✓");
