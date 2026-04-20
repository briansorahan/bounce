/**
 * Unit tests for src/shared/bounce-error.ts
 *
 * Covers BounceError construction, serialize(), and deserialize().
 */

import { test } from "vitest";
import assert from "node:assert/strict";
import { BounceError } from "./shared/bounce-error.js";

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

test("construction", () => {
  const err = new BounceError("NOT_FOUND", "Sample not found");
  assert.equal(err.name, "BounceError", "name is BounceError");
  assert.equal(err.code, "NOT_FOUND", "code is set");
  assert.equal(err.message, "Sample not found", "message is set");
  assert.equal(err.details, undefined, "details is undefined when not provided");
  assert.ok(err instanceof Error, "is an Error instance");

  const errWithDetails = new BounceError("IO_ERROR", "Read failed", { path: "/tmp/x.wav", errno: 2 });
  assert.deepEqual(errWithDetails.details, { path: "/tmp/x.wav", errno: 2 }, "details is stored");
});

// ---------------------------------------------------------------------------
// serialize()
// ---------------------------------------------------------------------------

test("serialize()", () => {
  const err = new BounceError("PARSE_ERROR", "Bad format");
  const s = err.serialize();
  assert.equal(s.name, "BounceError", "serialized name");
  assert.equal(s.code, "PARSE_ERROR", "serialized code");
  assert.equal(s.message, "Bad format", "serialized message");
  assert.equal(s.details, undefined, "serialized details absent when not set");

  const errWithDetails = new BounceError("DB_ERROR", "Query failed", { table: "samples" });
  const s2 = errWithDetails.serialize();
  assert.deepEqual(s2.details, { table: "samples" }, "serialized details present when set");
});

// ---------------------------------------------------------------------------
// deserialize()
// ---------------------------------------------------------------------------

test("deserialize()", () => {
  // Round-trip: no details
  const original = new BounceError("TIMEOUT", "Operation timed out");
  const roundTripped = BounceError.deserialize(original.serialize());
  assert.equal(roundTripped.code, original.code, "round-trip code");
  assert.equal(roundTripped.message, original.message, "round-trip message");
  assert.equal(roundTripped.name, "BounceError", "round-trip name");
  assert.equal(roundTripped.details, undefined, "round-trip details absent");
  assert.ok(roundTripped instanceof BounceError, "round-trip is BounceError instance");
  assert.ok(roundTripped instanceof Error, "round-trip is Error instance");

  // Round-trip: with details
  const withDetails = new BounceError("ANALYSIS_FAILED", "NMF failed", { rank: 4, iterations: 100 });
  const rtDetails = BounceError.deserialize(withDetails.serialize());
  assert.equal(rtDetails.code, "ANALYSIS_FAILED", "round-trip code with details");
  assert.deepEqual(rtDetails.details, { rank: 4, iterations: 100 }, "round-trip details");

  // Deserialize from a plain object (simulating IPC transport)
  const fromWire = BounceError.deserialize({
    name: "BounceError",
    code: "WIRE_ERROR",
    message: "From the wire",
    details: { source: "ipc" },
  });
  assert.equal(fromWire.code, "WIRE_ERROR", "deserialized from plain object");
  assert.equal(fromWire.message, "From the wire", "deserialized message from wire");
  assert.deepEqual(fromWire.details, { source: "ipc" }, "deserialized details from wire");
});
