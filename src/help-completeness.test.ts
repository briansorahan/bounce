/**
 * Completeness validation for the Bounce REPL help system.
 *
 * Checks that every registered namespace and type has documentation.
 * Fails fast with a clear message identifying the gap.
 */

import assert from "node:assert/strict";
import { test } from "vitest";
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

// ---------------------------------------------------------------------------
// Test 1: Every registered namespace has a non-empty summary
// ---------------------------------------------------------------------------

test("namespace summaries", () => {
  const namespaces = listNamespaces();
  for (const ns of namespaces) {
    assert.ok(
      ns.summary.trim().length > 0,
      `${ns.name}: namespace missing summary`,
    );
  }
});

// ---------------------------------------------------------------------------
// Test 2: Every registered replType has a non-empty summary
// ---------------------------------------------------------------------------

test("type summaries", () => {
  const types = listTypes();
  for (const td of types) {
    assert.ok(
      td.summary.trim().length > 0,
      `${td.name}: type missing summary`,
    );
  }
});

// ---------------------------------------------------------------------------
// Test 3: Every registered type method has a non-empty summary
// ---------------------------------------------------------------------------

test("type method summaries", () => {
  const types = listTypes();
  for (const td of types) {
    for (const [methodName, m] of Object.entries(td.methods)) {
      assert.ok(
        m.summary.trim().length > 0,
        `${td.name}.${methodName}: method missing summary`,
      );
      for (const p of m.params) {
        assert.ok(
          p.summary.trim().length > 0,
          `${td.name}.${methodName} param '${p.name}': missing summary`,
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Test 4: Every registered namespace method has a non-empty summary and params
// ---------------------------------------------------------------------------

test("namespace method summaries", () => {
  const namespaces = listNamespaces();
  for (const ns of namespaces) {
    for (const [methodName, m] of Object.entries(ns.methods)) {
      assert.ok(
        m.summary.trim().length > 0,
        `${ns.name}.${methodName}: method missing summary`,
      );
      for (const p of m.params) {
        assert.ok(
          p.summary.trim().length > 0,
          `${ns.name}.${methodName} param '${p.name}': missing summary`,
        );
      }
    }
  }
});
