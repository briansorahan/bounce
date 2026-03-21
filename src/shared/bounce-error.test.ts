import { BounceError } from "./bounce-error";
import type { SerializedBounceError } from "./bounce-error";

function assert(condition: boolean, msg: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

const err = new BounceError("TEST_CODE", "test message");
assert(err instanceof Error, "should be instanceof Error");
assert(err instanceof BounceError, "should be instanceof BounceError");
assert(err.code === "TEST_CODE", "code should match");
assert(err.message === "test message", "message should match");
assert(err.name === "BounceError", "name should be BounceError");
assert(err.details === undefined, "details should be undefined when omitted");

// Construction with details
const err2 = new BounceError("DETAIL_CODE", "with details", { key: "value", num: 42 });
assert(err2.code === "DETAIL_CODE", "code should match");
assert(err2.details !== undefined, "details should be defined");
assert(err2.details!.key === "value", "details.key should match");
assert(err2.details!.num === 42, "details.num should match");

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

const serialized = err2.serialize();
assert(serialized.name === "BounceError", "serialized name should be BounceError");
assert(serialized.code === "DETAIL_CODE", "serialized code should match");
assert(serialized.message === "with details", "serialized message should match");
assert(serialized.details !== undefined, "serialized details should exist");
assert(serialized.details!.key === "value", "serialized details.key should match");

// Serialization without details omits the key
const noDetailsSerialized = err.serialize();
assert(!("details" in noDetailsSerialized), "serialized without details should not have details key");

// Serialized form is a plain object (JSON-safe)
const json = JSON.stringify(serialized);
const parsed: SerializedBounceError = JSON.parse(json);
assert(parsed.code === "DETAIL_CODE", "JSON round-trip code should match");

// ---------------------------------------------------------------------------
// Deserialization
// ---------------------------------------------------------------------------

const deserialized = BounceError.deserialize(serialized);
assert(deserialized instanceof BounceError, "deserialized should be instanceof BounceError");
assert(deserialized instanceof Error, "deserialized should be instanceof Error");
assert(deserialized.code === "DETAIL_CODE", "deserialized code should match");
assert(deserialized.message === "with details", "deserialized message should match");
assert(deserialized.details?.key === "value", "deserialized details.key should match");

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

const original = new BounceError("ROUND_TRIP", "round trip test", { nested: { a: 1 } });
const roundTripped = BounceError.deserialize(original.serialize());
assert(roundTripped.code === original.code, "round-trip code should match");
assert(roundTripped.message === original.message, "round-trip message should match");
assert(
  JSON.stringify(roundTripped.details) === JSON.stringify(original.details),
  "round-trip details should match",
);

// Round-trip without details
const noDetailsOriginal = new BounceError("NO_DETAILS", "no details");
const noDetailsRT = BounceError.deserialize(noDetailsOriginal.serialize());
assert(noDetailsRT.code === "NO_DETAILS", "round-trip no-details code should match");
assert(noDetailsRT.details === undefined, "round-trip no-details should have undefined details");

// ---------------------------------------------------------------------------
// Stack trace
// ---------------------------------------------------------------------------

assert(typeof err.stack === "string", "should have a stack trace");

console.log("All BounceError tests passed");
process.exit(0);
