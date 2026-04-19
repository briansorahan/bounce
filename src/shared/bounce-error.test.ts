import { BounceError } from "./bounce-error";
import type { SerializedBounceError } from "./bounce-error";
import assert from "node:assert/strict";
import { test } from "vitest";

test("BounceError", () => {
  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  const err = new BounceError("TEST_CODE", "test message");
  assert.ok(err instanceof Error, "should be instanceof Error");
  assert.ok(err instanceof BounceError, "should be instanceof BounceError");
  assert.ok(err.code === "TEST_CODE", "code should match");
  assert.ok(err.message === "test message", "message should match");
  assert.ok(err.name === "BounceError", "name should be BounceError");
  assert.ok(err.details === undefined, "details should be undefined when omitted");

  // Construction with details
  const err2 = new BounceError("DETAIL_CODE", "with details", { key: "value", num: 42 });
  assert.ok(err2.code === "DETAIL_CODE", "code should match");
  assert.ok(err2.details !== undefined, "details should be defined");
  assert.ok(err2.details!.key === "value", "details.key should match");
  assert.ok(err2.details!.num === 42, "details.num should match");

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  const serialized = err2.serialize();
  assert.ok(serialized.name === "BounceError", "serialized name should be BounceError");
  assert.ok(serialized.code === "DETAIL_CODE", "serialized code should match");
  assert.ok(serialized.message === "with details", "serialized message should match");
  assert.ok(serialized.details !== undefined, "serialized details should exist");
  assert.ok(serialized.details!.key === "value", "serialized details.key should match");

  // Serialization without details omits the key
  const noDetailsSerialized = err.serialize();
  assert.ok(!("details" in noDetailsSerialized), "serialized without details should not have details key");

  // Serialized form is a plain object (JSON-safe)
  const json = JSON.stringify(serialized);
  const parsed: SerializedBounceError = JSON.parse(json);
  assert.ok(parsed.code === "DETAIL_CODE", "JSON round-trip code should match");

  // ---------------------------------------------------------------------------
  // Deserialization
  // ---------------------------------------------------------------------------

  const deserialized = BounceError.deserialize(serialized);
  assert.ok(deserialized instanceof BounceError, "deserialized should be instanceof BounceError");
  assert.ok(deserialized instanceof Error, "deserialized should be instanceof Error");
  assert.ok(deserialized.code === "DETAIL_CODE", "deserialized code should match");
  assert.ok(deserialized.message === "with details", "deserialized message should match");
  assert.ok(deserialized.details?.key === "value", "deserialized details.key should match");

  // ---------------------------------------------------------------------------
  // Round-trip
  // ---------------------------------------------------------------------------

  const original = new BounceError("ROUND_TRIP", "round trip test", { nested: { a: 1 } });
  const roundTripped = BounceError.deserialize(original.serialize());
  assert.ok(roundTripped.code === original.code, "round-trip code should match");
  assert.ok(roundTripped.message === original.message, "round-trip message should match");
  assert.ok(
    JSON.stringify(roundTripped.details) === JSON.stringify(original.details),
    "round-trip details should match",
  );

  // Round-trip without details
  const noDetailsOriginal = new BounceError("NO_DETAILS", "no details");
  const noDetailsRT = BounceError.deserialize(noDetailsOriginal.serialize());
  assert.ok(noDetailsRT.code === "NO_DETAILS", "round-trip no-details code should match");
  assert.ok(noDetailsRT.details === undefined, "round-trip no-details should have undefined details");

  // ---------------------------------------------------------------------------
  // Stack trace
  // ---------------------------------------------------------------------------

  assert.ok(typeof err.stack === "string", "should have a stack trace");
});
