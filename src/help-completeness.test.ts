/**
 * Completeness validation for the Bounce REPL help system.
 *
 * Checks that every registered namespace and type has documentation.
 * Fails fast with a clear message identifying the gap.
 *
 * Run with: tsx src/help-completeness.test.ts
 */

import assert from "node:assert/strict";
import { listNamespaces, listTypes } from "./shared/repl-registration.js";

// Force registration of all namespaces and replTypes by importing their modules.
import "./renderer/namespaces/sample-namespace.js";
import "./renderer/namespaces/env-namespace.js";
import "./renderer/namespaces/vis-namespace.js";
import "./renderer/namespaces/project-namespace.js";
import "./renderer/namespaces/corpus-namespace.js";
import "./renderer/namespaces/fs-namespace.js";
import "./renderer/namespaces/instrument-namespace.js";
import "./renderer/namespaces/mixer-namespace.js";
import "./renderer/namespaces/midi-namespace.js";
import "./renderer/namespaces/transport-namespace.js";
import "./renderer/namespaces/pat-namespace.js";
import "./renderer/results/sample.js";
import "./renderer/results/features.js";
import "./renderer/results/visualization.js";
import "./renderer/results/instrument.js";
import "./renderer/results/recording.js";
import "./renderer/results/pattern.js";
import "./renderer/results/midi.js";

let totalChecks = 0;
const failures: string[] = [];

function check(condition: boolean, message: string): void {
  totalChecks++;
  if (!condition) failures.push(message);
}

// ---------------------------------------------------------------------------
// Test 1: Every registered namespace has a non-empty summary
// ---------------------------------------------------------------------------

console.log("Test 1: Namespace summaries...");
const namespaces = listNamespaces();
for (const ns of namespaces) {
  check(
    ns.summary.trim().length > 0,
    `${ns.name}: namespace missing summary`,
  );
}
console.log(`  checked ${namespaces.length} namespaces`);

// ---------------------------------------------------------------------------
// Test 2: Every registered replType has a non-empty summary
// ---------------------------------------------------------------------------

console.log("Test 2: Type summaries...");
const types = listTypes();
for (const td of types) {
  check(
    td.summary.trim().length > 0,
    `${td.name}: type missing summary`,
  );
}
console.log(`  checked ${types.length} types`);

// ---------------------------------------------------------------------------
// Test 3: Every registered type method has a non-empty summary
// ---------------------------------------------------------------------------

console.log("Test 3: Type method summaries...");
for (const td of types) {
  for (const [methodName, m] of Object.entries(td.methods)) {
    check(
      m.summary.trim().length > 0,
      `${td.name}.${methodName}: method missing summary`,
    );
    for (const p of m.params) {
      check(
        p.summary.trim().length > 0,
        `${td.name}.${methodName} param '${p.name}': missing summary`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Test 4: Every registered namespace method has a non-empty summary and params
// ---------------------------------------------------------------------------

console.log("Test 4: Namespace method summaries...");
for (const ns of namespaces) {
  for (const [methodName, m] of Object.entries(ns.methods)) {
    check(
      m.summary.trim().length > 0,
      `${ns.name}.${methodName}: method missing summary`,
    );
    for (const p of m.params) {
      check(
        p.summary.trim().length > 0,
        `${ns.name}.${methodName} param '${p.name}': missing summary`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`\nhelp-completeness.test.ts: ${failures.length} gap(s) found:\n`);
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  process.exit(1);
}

console.log(`\nhelp-completeness.test.ts: all ${totalChecks} completeness checks passed ✓`);
