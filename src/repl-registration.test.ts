/**
 * Unit tests for src/shared/repl-registration.ts
 *
 * Each tsx process starts with empty module-level maps, so tests can
 * register fixtures freely without cross-file pollution.
 */

import assert from "node:assert/strict";
import {
  registerNamespace,
  registerType,
  getNamespace,
  getType,
  listNamespaces,
  listTypes,
  getNamespaceNames,
  setDevMode,
  getDevMode,
} from "./shared/repl-registration.js";
import type { NamespaceDescriptor, TypeDescriptor } from "./shared/repl-registry.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fsSuffix: NamespaceDescriptor = {
  name: "fs",
  summary: "Filesystem operations",
  visibility: "porcelain",
  methods: {
    ls: { summary: "List files", params: [], examples: [] },
  },
};

const snNs: NamespaceDescriptor = {
  name: "sn",
  summary: "Sample namespace",
  visibility: "porcelain",
  methods: {
    read: { summary: "Read a sample", params: [], examples: [] },
  },
};

const internalNs: NamespaceDescriptor = {
  name: "_internal",
  summary: "Internal plumbing",
  visibility: "plumbing",
  methods: {},
};

const sampleType: TypeDescriptor = {
  name: "SampleResult",
  summary: "An audio sample",
  methods: {
    play: { summary: "Play the sample", params: [], examples: [] },
  },
};

const featureType: TypeDescriptor = {
  name: "FeatureResult",
  summary: "Audio features",
  methods: {},
};

// Register fixtures once for all tests below.
registerNamespace(fsSuffix);
registerNamespace(snNs);
registerNamespace(internalNs);
registerType(sampleType);
registerType(featureType);

// ---------------------------------------------------------------------------
// getNamespace
// ---------------------------------------------------------------------------

{
  console.log("getNamespace...");
  const ns = getNamespace("fs");
  assert.ok(ns !== undefined, "getNamespace returns registered namespace");
  assert.equal(ns!.name, "fs", "name matches");
  assert.equal(ns!.summary, "Filesystem operations", "summary matches");
  assert.equal(getNamespace("nonexistent"), undefined, "returns undefined for unknown name");
  console.log("  ✓ getNamespace");
}

// ---------------------------------------------------------------------------
// getType
// ---------------------------------------------------------------------------

{
  console.log("getType...");
  const t = getType("SampleResult");
  assert.ok(t !== undefined, "getType returns registered type");
  assert.equal(t!.name, "SampleResult", "name matches");
  assert.equal(getType("Unknown"), undefined, "returns undefined for unknown type");
  console.log("  ✓ getType");
}

// ---------------------------------------------------------------------------
// listNamespaces
// ---------------------------------------------------------------------------

{
  console.log("listNamespaces...");

  const all = listNamespaces();
  const names = all.map(n => n.name);
  assert.ok(names.includes("fs"), "listNamespaces includes fs");
  assert.ok(names.includes("sn"), "listNamespaces includes sn");
  assert.ok(names.includes("_internal"), "listNamespaces includes plumbing ns");

  const porcelain = listNamespaces("porcelain");
  assert.ok(porcelain.every(n => n.visibility === "porcelain"), "filtered to porcelain only");
  assert.ok(porcelain.some(n => n.name === "fs"), "porcelain includes fs");
  assert.ok(!porcelain.some(n => n.name === "_internal"), "porcelain excludes _internal");

  const plumbing = listNamespaces("plumbing");
  assert.ok(plumbing.every(n => n.visibility === "plumbing"), "filtered to plumbing only");
  assert.ok(plumbing.some(n => n.name === "_internal"), "plumbing includes _internal");

  console.log("  ✓ listNamespaces");
}

// ---------------------------------------------------------------------------
// listTypes
// ---------------------------------------------------------------------------

{
  console.log("listTypes...");
  const types = listTypes();
  const names = types.map(t => t.name);
  assert.ok(names.includes("SampleResult"), "listTypes includes SampleResult");
  assert.ok(names.includes("FeatureResult"), "listTypes includes FeatureResult");
  console.log("  ✓ listTypes");
}

// ---------------------------------------------------------------------------
// getNamespaceNames
// ---------------------------------------------------------------------------

{
  console.log("getNamespaceNames...");

  // Default: porcelain only
  const porcelainNames = getNamespaceNames();
  assert.ok(porcelainNames.includes("fs"), "includes fs");
  assert.ok(porcelainNames.includes("sn"), "includes sn");
  assert.ok(!porcelainNames.includes("_internal"), "excludes plumbing by default");

  // includePlumbing = true
  const allNames = getNamespaceNames(true);
  assert.ok(allNames.includes("_internal"), "includes plumbing when requested");

  console.log("  ✓ getNamespaceNames");
}

// ---------------------------------------------------------------------------
// setDevMode / getDevMode
// ---------------------------------------------------------------------------

{
  console.log("setDevMode / getDevMode...");

  assert.equal(getDevMode(), false, "devMode starts false");
  setDevMode(true);
  assert.equal(getDevMode(), true, "setDevMode(true) is reflected");
  setDevMode(false);
  assert.equal(getDevMode(), false, "setDevMode(false) resets");

  console.log("  ✓ setDevMode / getDevMode");
}

console.log("\nAll repl-registration tests passed.");
