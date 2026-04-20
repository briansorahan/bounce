/**
 * Unit tests for src/kdtree.ts (KDTree wrapper)
 *
 * Requires the native flucoma_native addon — runs as part of npm test.
 */

import { test } from "vitest";
import assert from "node:assert/strict";
import { KDTree } from "./kdtree";

// ---------------------------------------------------------------------------
// addPoint + size
// ---------------------------------------------------------------------------

test("addPoint + size", () => {
  const tree = new KDTree();
  assert.equal(tree.size(), 0, "empty tree has size 0");

  tree.addPoint("a", [1, 0]);
  assert.equal(tree.size(), 1, "size is 1 after one addPoint");

  tree.addPoint("b", [0, 1]);
  tree.addPoint("c", [1, 1]);
  assert.equal(tree.size(), 3, "size tracks all added points");
});

// ---------------------------------------------------------------------------
// kNearest — basic nearest-neighbour lookup
// ---------------------------------------------------------------------------

test("kNearest basic", () => {
  const tree = new KDTree();
  tree.addPoint("origin",    [0, 0]);
  tree.addPoint("close",     [0.1, 0.1]);
  tree.addPoint("far",       [10, 10]);
  tree.addPoint("very-far",  [100, 100]);

  // Querying near origin — closest should be "origin" then "close"
  const results = tree.kNearest([0, 0], 2);
  assert.equal(results.length, 2, "returns exactly k results");
  assert.equal(results[0].id, "origin", "nearest is origin");
  assert.equal(results[1].id, "close", "second nearest is close");

  // Distances are sorted ascending
  assert.ok(results[0].distance <= results[1].distance, "results are sorted by distance");

  // Distances are non-negative
  for (const r of results) {
    assert.ok(r.distance >= 0, `distance for '${r.id}' is non-negative`);
  }
});

// ---------------------------------------------------------------------------
// kNearest — k larger than number of points returns all points
// ---------------------------------------------------------------------------

test("kNearest k > size", () => {
  const tree = new KDTree();
  tree.addPoint("p1", [1, 0]);
  tree.addPoint("p2", [2, 0]);

  const results = tree.kNearest([0, 0], 10);
  assert.equal(results.length, 2, "returns only as many results as points in tree");
});

// ---------------------------------------------------------------------------
// kNearest — with radius constraint
// ---------------------------------------------------------------------------

test("kNearest with radius", () => {
  const tree = new KDTree();
  tree.addPoint("near",  [1, 0]);   // distance 1 from query
  tree.addPoint("far",   [10, 0]);  // distance 10 from query

  const results = tree.kNearest([0, 0], 10, 2);
  assert.ok(results.every(r => r.distance <= 2), "all results within radius");
  assert.ok(results.some(r => r.id === "near"), "near point included");
  assert.ok(!results.some(r => r.id === "far"), "far point excluded by radius");
});

// ---------------------------------------------------------------------------
// clear() resets tree
// ---------------------------------------------------------------------------

test("clear", () => {
  const tree = new KDTree();
  tree.addPoint("p1", [1, 0]);
  tree.addPoint("p2", [2, 0]);
  assert.equal(tree.size(), 2, "size is 2 before clear");

  tree.clear();
  assert.equal(tree.size(), 0, "size is 0 after clear");

  // Can add new points after clear
  tree.addPoint("new", [0, 0]);
  assert.equal(tree.size(), 1, "can add points after clear");
  const results = tree.kNearest([0, 0], 1);
  assert.equal(results[0].id, "new", "new point is found after clear + reinsert");
});

// ---------------------------------------------------------------------------
// kNearest — correct distance ordering across dimensions
// ---------------------------------------------------------------------------

test("multi-dimensional ordering", () => {
  const tree = new KDTree();
  // 3D points
  tree.addPoint("closest",  [1, 0, 0]);  // dist ≈ 1
  tree.addPoint("middle",   [2, 0, 0]);  // dist ≈ 2
  tree.addPoint("furthest", [5, 5, 5]);  // dist ≈ 8.66

  const results = tree.kNearest([0, 0, 0], 3);
  assert.equal(results[0].id, "closest",  "closest is first");
  assert.equal(results[1].id, "middle",   "middle is second");
  assert.equal(results[2].id, "furthest", "furthest is third");
});
