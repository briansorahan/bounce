/**
 * Unit tests for src/normalization.ts (Normalization wrapper)
 *
 * Requires the native flucoma_native addon — runs as part of npm test.
 */

import { test } from "vitest";
import assert from "node:assert/strict";
import { Normalization } from "./normalization";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMatrix(rows: number[][]): number[][] {
  return rows;
}

// ---------------------------------------------------------------------------
// fit() + transform()
// ---------------------------------------------------------------------------

test("fit + transform", () => {
  const norm = new Normalization();

  // 3 samples × 2 features
  const data = makeMatrix([
    [0, 10],
    [5, 30],
    [10, 20],
  ]);

  norm.fit(data); // default range [0, 1]

  const result = norm.transform(data);

  assert.equal(result.length, 3, "output has same number of rows as input");
  assert.equal(result[0].length, 2, "output has same number of columns as input");

  // Column 0: min=0, max=10 → 0→0, 5→0.5, 10→1
  assert.ok(Math.abs(result[0][0] - 0.0) < 1e-6, "col0 row0 → 0.0");
  assert.ok(Math.abs(result[1][0] - 0.5) < 1e-6, "col0 row1 → 0.5");
  assert.ok(Math.abs(result[2][0] - 1.0) < 1e-6, "col0 row2 → 1.0");

  // Column 1: min=10, max=30 → 10→0, 30→1, 20→0.5
  assert.ok(Math.abs(result[0][1] - 0.0) < 1e-6, "col1 row0 → 0.0");
  assert.ok(Math.abs(result[2][1] - 0.5) < 1e-6, "col1 row2 → 0.5");
  assert.ok(Math.abs(result[1][1] - 1.0) < 1e-6, "col1 row1 → 1.0");
});

// ---------------------------------------------------------------------------
// Custom target range
// ---------------------------------------------------------------------------

test("custom range", () => {
  const norm = new Normalization();
  norm.fit([[0], [100]], -1, 1);
  const result = norm.transform([[0], [50], [100]]);

  assert.ok(Math.abs(result[0][0] - (-1.0)) < 1e-6, "0 → -1 in [-1,1] range");
  assert.ok(Math.abs(result[1][0] - 0.0)   < 1e-6, "50 → 0 in [-1,1] range");
  assert.ok(Math.abs(result[2][0] - 1.0)   < 1e-6, "100 → 1 in [-1,1] range");
});

// ---------------------------------------------------------------------------
// transformFrame()
// ---------------------------------------------------------------------------

test("transformFrame", () => {
  const norm = new Normalization();
  norm.fit([[0, 0], [10, 100]]);

  const frame = norm.transformFrame([5, 50]);
  assert.equal(frame.length, 2, "transformFrame returns vector of same length");
  assert.ok(Math.abs(frame[0] - 0.5) < 1e-6, "col0 midpoint → 0.5");
  assert.ok(Math.abs(frame[1] - 0.5) < 1e-6, "col1 midpoint → 0.5");
});

// ---------------------------------------------------------------------------
// clear() resets state
// ---------------------------------------------------------------------------

test("clear", () => {
  const norm = new Normalization();
  norm.fit([[0], [10]]);

  // transformFrame works after fit
  const before = norm.transformFrame([5]);
  assert.ok(Math.abs(before[0] - 0.5) < 1e-6, "works before clear");

  norm.clear();

  // After clear, re-fit with different data
  norm.fit([[0], [20]]);
  const after = norm.transformFrame([10]);
  assert.ok(Math.abs(after[0] - 0.5) < 1e-6, "re-fitted correctly after clear");
});
