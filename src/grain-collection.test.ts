import { test } from "vitest";
import { GrainCollection } from "./renderer/grain-collection.js";
import { AudioResult } from "./renderer/bounce-result.js";

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
