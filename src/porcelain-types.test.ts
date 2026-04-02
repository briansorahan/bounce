/**
 * Tests for the porcelain type help system.
 *
 * Verifies:
 *   1. Every type in porcelain-types.generated.ts has required shape
 *   2. renderTypeHelp() returns non-empty BounceResult for every type
 *   3. Known types produce output containing expected method/property names
 *   4. processPorcelainFile() and generatePorcelainFile() round-trip correctly
 *   5. Generated file is not stale relative to porcelain.ts source
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { porcelainTypeHelps } from "./renderer/results/porcelain-types.generated.js";
import { renderTypeHelp, type TypeHelp } from "./renderer/help.js";
import { processPorcelainFile, generatePorcelainFile, processOptsFile } from "./help-generator.js";

const PORCELAIN_SRC = join(process.cwd(), "src/renderer/results/porcelain.ts");
const PORCELAIN_GENERATED = join(process.cwd(), "src/renderer/results/porcelain-types.generated.ts");
const OPTS_DOCS_PATH = join(process.cwd(), "src/renderer/opts-docs.ts");

// ---------------------------------------------------------------------------
// Test 1: Shape invariants for every generated type
// ---------------------------------------------------------------------------

{
  console.log("Test 1: TypeHelp shape invariants...");
  assert.ok(porcelainTypeHelps.length > 0, "porcelainTypeHelps must be non-empty");

  for (const th of porcelainTypeHelps) {
    assert.ok(th.name && th.name.length > 0, `Type at index has empty name`);
    assert.ok(th.summary && th.summary.length > 0, `${th.name}: summary must be non-empty`);

    if (th.properties) {
      for (const p of th.properties) {
        assert.ok(p.name, `${th.name}: property has empty name`);
        assert.ok(p.type, `${th.name}.${p.name}: property has empty type`);
        assert.ok(p.description, `${th.name}.${p.name}: property has empty description`);
      }
    }

    if (th.methods) {
      for (const m of th.methods) {
        assert.ok(m.signature, `${th.name}: method has empty signature`);
        assert.ok(m.summary, `${th.name}.${m.signature}: method has empty summary`);
      }
    }
  }
  console.log(`  ✓ ${porcelainTypeHelps.length} types all have valid shape`);
}

// ---------------------------------------------------------------------------
// Test 2: renderTypeHelp() produces non-empty output for every type
// ---------------------------------------------------------------------------

{
  console.log("Test 2: renderTypeHelp() output...");
  for (const th of porcelainTypeHelps) {
    const result = renderTypeHelp(th);
    const text = result.toString();
    assert.ok(text.length > 0, `${th.name}: renderTypeHelp returned empty string`);
    assert.ok(text.includes(th.name), `${th.name}: output must contain the type name`);
    assert.ok(text.includes(th.summary), `${th.name}: output must contain the summary`);
  }
  console.log(`  ✓ All ${porcelainTypeHelps.length} types render non-empty output`);
}

// ---------------------------------------------------------------------------
// Test 3: Spot-check known types for expected content
// ---------------------------------------------------------------------------

{
  console.log("Test 3: Spot-check known type content...");

  function findType(name: string): TypeHelp {
    const t = porcelainTypeHelps.find((th) => th.name === name);
    assert.ok(t, `Expected type '${name}' not found in porcelainTypeHelps`);
    return t;
  }

  // Sample
  const sample = findType("Sample");
  const sampleOutput = renderTypeHelp(sample).toString();
  for (const method of ["play()", "loop(opts?)", "onsetSlice(opts?)", "nmf(opts?)", "mfcc(opts?)"]) {
    assert.ok(sampleOutput.includes(method), `Sample output must include method '${method}'`);
  }
  for (const prop of ["hash", "duration", "channels", "sampleRate"]) {
    assert.ok(sampleOutput.includes(prop), `Sample output must include property '${prop}'`);
  }
  console.log("  ✓ Sample");

  // SliceFeature
  const sf = findType("SliceFeature");
  const sfOutput = renderTypeHelp(sf).toString();
  assert.ok(sfOutput.includes("slices"), "SliceFeature output must include 'slices'");
  assert.ok(sfOutput.includes("playSlice(index?)"), "SliceFeature output must include 'playSlice'");
  assert.ok(sfOutput.includes("count"), "SliceFeature output must include 'count'");
  console.log("  ✓ SliceFeature");

  // NmfFeature
  const nmf = findType("NmfFeature");
  const nmfOutput = renderTypeHelp(nmf).toString();
  assert.ok(nmfOutput.includes("components"), "NmfFeature output must include 'components'");
  assert.ok(nmfOutput.includes("playComponent(index?)"), "NmfFeature output must include 'playComponent'");
  assert.ok(nmfOutput.includes("sep(opts?)"), "NmfFeature output must include 'sep'");
  console.log("  ✓ NmfFeature");

  // VisScene
  const vs = findType("VisScene");
  const vsOutput = renderTypeHelp(vs).toString();
  assert.ok(vsOutput.includes("show()"), "VisScene output must include 'show'");
  assert.ok(vsOutput.includes("overlay(feature)"), "VisScene output must include 'overlay'");
  assert.ok(vsOutput.includes("sample"), "VisScene output must include 'sample' property");
  console.log("  ✓ VisScene");

  // Pattern
  const pat = findType("Pattern");
  const patOutput = renderTypeHelp(pat).toString();
  assert.ok(patOutput.includes("play(channel)"), "Pattern output must include 'play'");
  assert.ok(patOutput.includes("stop()"), "Pattern output must include 'stop'");
  console.log("  ✓ Pattern");
}

// ---------------------------------------------------------------------------
// Test 4: processPorcelainFile round-trip
// ---------------------------------------------------------------------------

{
  console.log("Test 4: processPorcelainFile round-trip...");
  const types = processPorcelainFile(PORCELAIN_SRC);
  assert.strictEqual(
    types.length,
    porcelainTypeHelps.length,
    `processPorcelainFile found ${types.length} types but generated file has ${porcelainTypeHelps.length}`,
  );

  const names = types.map((t) => t.name);
  for (const expected of ["Sample", "SliceFeature", "NmfFeature", "MfccFeature", "NxFeature", "VisScene", "Pattern"]) {
    assert.ok(names.includes(expected), `Expected type '${expected}' not found by parser`);
  }
  console.log(`  ✓ processPorcelainFile found ${types.length} types matching generated file`);
}

// ---------------------------------------------------------------------------
// Test 5: Generated file is not stale
// ---------------------------------------------------------------------------

{
  console.log("Test 5: Staleness check...");
  const types = processPorcelainFile(PORCELAIN_SRC);
  const { methodRegistry: methodOptsRegistry } = processOptsFile(OPTS_DOCS_PATH);
  const freshOutput = generatePorcelainFile(types, methodOptsRegistry);
  const onDisk = readFileSync(PORCELAIN_GENERATED, "utf8");
  assert.strictEqual(
    freshOutput,
    onDisk,
    "porcelain-types.generated.ts is stale — run npm run generate:help to regenerate",
  );
  console.log("  ✓ porcelain-types.generated.ts is up to date");
}

console.log("\nAll porcelain-types tests passed ✓");
