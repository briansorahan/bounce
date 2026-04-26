import { test } from "vitest";
import assert from "node:assert/strict";
import { GrainCollection } from "./renderer/grain-collection.js";
import { AudioResult, type SampleResult } from "./renderer/bounce-result.js";
import type { BounceGrainsOptions } from "./shared/ipc-contract.js";

function makeGrain(hash: string, duration = 0.02): AudioResult {
  return new AudioResult(`Grain: ${hash}`, hash, undefined, 44100, duration);
}

function localAssert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

test("grain collection", async () => {
  const grains = [
    makeGrain("aaa"),
    null, // silent grain
    makeGrain("bbb"),
    makeGrain("ccc"),
    null,
  ];
  const col = new GrainCollection(grains, false, "sourcehash12345678", [0, 1, 2], 1024);

  // length() counts only stored (non-null) grains
  localAssert(col.length() === 3, "length() returns count of non-null grains");

  // forEach is sequential and skips null grains
  const forEachOrder: string[] = [];
  await col.forEach(async (grain, i) => {
    forEachOrder.push(`${i}:${grain.hash}`);
  });
  localAssert(
    JSON.stringify(forEachOrder) === JSON.stringify(["0:aaa", "1:bbb", "2:ccc"]),
    "forEach visits stored grains in order with sequential indices",
  );

  // forEach awaits each callback before calling the next
  const seqLog: number[] = [];
  await col.forEach(async (_grain, i) => {
    await new Promise<void>((resolve) => setTimeout(resolve, 10 - i * 3));
    seqLog.push(i);
  });
  localAssert(
    JSON.stringify(seqLog) === JSON.stringify([0, 1, 2]),
    "forEach executes callbacks sequentially regardless of async timing",
  );

  // map transforms stored grains
  const hashes = col.map((grain) => grain.hash);
  localAssert(
    JSON.stringify(hashes) === JSON.stringify(["aaa", "bbb", "ccc"]),
    "map returns transformed array of stored grains",
  );

  // filter returns a new GrainCollection with matching grains
  const filtered = col.filter((grain) => grain.hash !== "bbb");
  localAssert(filtered.length() === 2, "filter returns collection with matching grains only");

  const filteredHashes = filtered.map((g) => g.hash);
  localAssert(
    JSON.stringify(filteredHashes) === JSON.stringify(["aaa", "ccc"]),
    "filter preserves order and excludes non-matching grains",
  );

  // filter result has same normalize setting
  const normed = new GrainCollection([makeGrain("x")], true, "src", [0], 1024);
  const filteredNormed = normed.filter(() => true);
  localAssert(filteredNormed.normalize === true, "filter preserves normalize setting");

  // toString includes grain count, source hash prefix, and silent count
  const str = col.toString();
  localAssert(str.includes("3 grains"), "toString includes stored grain count");
  localAssert(str.includes("sourceh"), "toString includes source hash prefix");
  localAssert(str.includes("2 silent"), "toString includes silent grain count");

  // Empty collection
  const empty = new GrainCollection([], false, "emptyhash", [], 1024);
  localAssert(empty.length() === 0, "empty collection has length 0");
  const visited: number[] = [];
  await empty.forEach((_g, i) => { visited.push(i); });
  localAssert(visited.length === 0, "forEach on empty collection visits nothing");
});

// ---------------------------------------------------------------------------
// bounce() — callback invocation and option forwarding
// ---------------------------------------------------------------------------

type CallbackArgs = {
  sourceHash: string;
  positions: number[];
  sizeSamples: number;
  options: BounceGrainsOptions | undefined;
};

function makeBounceCallback(mockResult: SampleResult): {
  callback: (sourceHash: string, positions: number[], sizeSamples: number, options?: BounceGrainsOptions) => Promise<SampleResult>;
  calls: CallbackArgs[];
} {
  const calls: CallbackArgs[] = [];
  const callback = async (
    sourceHash: string,
    positions: number[],
    sizeSamples: number,
    options?: BounceGrainsOptions,
  ): Promise<SampleResult> => {
    calls.push({ sourceHash, positions, sizeSamples, options });
    return mockResult;
  };
  return { callback, calls };
}

test("bounce() calls callback with correct sourceHash, positions, sizeSamples", async () => {
  const sourceHash = "sourcehashbounce01";
  const positions = [100, 200, 300];
  const sizeSamples = 512;
  const mockResult = makeGrain("bounce-result-hash");
  const { callback, calls } = makeBounceCallback(mockResult);

  const col = new GrainCollection(
    [makeGrain("g1"), makeGrain("g2"), makeGrain("g3")],
    false,
    sourceHash,
    positions,
    sizeSamples,
    callback,
  );

  const result = await col.bounce();

  assert.equal(calls.length, 1, "callback should be called exactly once");
  assert.equal(calls[0].sourceHash, sourceHash, "callback receives correct sourceHash");
  assert.deepEqual(calls[0].positions, positions, "callback receives correct positions");
  assert.equal(calls[0].sizeSamples, sizeSamples, "callback receives correct sizeSamples");
  assert.equal(result.hash, mockResult.hash, "bounce() resolves to the SampleResult returned by callback");
});

test("bounce() forwards options to callback", async () => {
  const mockResult = makeGrain("bounce-result-opts");
  const { callback, calls } = makeBounceCallback(mockResult);

  const col = new GrainCollection(
    [makeGrain("g1")],
    false,
    "srchash",
    [0],
    1024,
    callback,
  );

  const opts: BounceGrainsOptions = { density: 30, pitch: 1.5 };
  await col.bounce(opts);

  assert.equal(calls.length, 1, "callback called once");
  assert.deepEqual(calls[0].options, opts, "callback receives the options passed to bounce()");
});

test("bounce() without callback throws 'bounce() is not available'", () => {
  const col = new GrainCollection(
    [makeGrain("g1")],
    false,
    "srchash",
    [0],
    1024,
    // no callback
  );

  assert.throws(
    () => col.bounce(),
    /bounce\(\) is not available/,
    "bounce() without a callback should throw",
  );
});

test("filter() preserves position alignment after filtering", async () => {
  const mockResult = makeGrain("filtered-result");
  const { callback, calls } = makeBounceCallback(mockResult);

  const col = new GrainCollection(
    [makeGrain("g1"), makeGrain("g2"), makeGrain("g3")],
    false,
    "srchash",
    [100, 200, 300],
    512,
    callback,
  );

  // Keep grains at index 0 and 2 (i.e. "g1" and "g3"), drop "g2"
  const filtered = col.filter((_grain, i) => i === 0 || i === 2);
  assert.equal(filtered.length(), 2, "filtered collection should have 2 grains");

  await filtered.bounce();
  assert.equal(calls.length, 1, "callback called once");
  assert.deepEqual(
    calls[0].positions,
    [100, 300],
    "filter() should pass positions [100, 300] after removing middle grain",
  );
});

test("filter() with null grains preserves position alignment", async () => {
  const mockResult = makeGrain("filtered-null-result");
  const { callback, calls } = makeBounceCallback(mockResult);

  // Grains array: [grain, null, grain, grain]
  // Non-null grains have positions [100, 300, 400]
  const col = new GrainCollection(
    [makeGrain("g1"), null, makeGrain("g2"), makeGrain("g3")],
    false,
    "srchash",
    [100, 300, 400],
    512,
    callback,
  );

  // Keep first and last non-null grains (index 0 "g1" and index 2 "g3"), drop "g2"
  const filtered = col.filter((_grain, i) => i === 0 || i === 2);
  assert.equal(filtered.length(), 2, "filtered collection should have 2 grains");

  await filtered.bounce();
  assert.equal(calls.length, 1, "callback called once");
  assert.deepEqual(
    calls[0].positions,
    [100, 400],
    "filter() with null grains should map positions correctly: [100, 400]",
  );
});
