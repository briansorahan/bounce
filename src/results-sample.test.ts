/**
 * Unit tests for src/renderer/results/sample.ts
 *
 * Covers classes that can be exercised without Electron IPC:
 *   AudioResult, SamplePromise, CurrentSamplePromise, SampleListResult, GrainCollectionPromise
 */

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  AudioResult,
  SamplePromise,
  CurrentSamplePromise,
  SampleListResult,
  GrainCollectionPromise,
  type SampleSummaryFeature,
} from "./renderer/results/sample.js";
import { BounceResult } from "./renderer/results/base.js";
import { GrainCollection } from "./renderer/grain-collection.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAudio(
  hash = "abc123",
  filePath: string | undefined = "/audio/file.wav",
  sampleRate = 44100,
  duration = 2.5,
  channels = 2,
  id: number | undefined = 1,
): AudioResult {
  return new AudioResult(
    `${filePath} (${sampleRate} Hz, ${channels} ch, ${duration}s)`,
    hash,
    filePath,
    sampleRate,
    duration,
    channels,
    id,
  );
}

// ---------------------------------------------------------------------------
// AudioResult — constructor properties
// ---------------------------------------------------------------------------

test("AudioResult stores hash correctly", () => {
  const audio = makeAudio("deadbeef");
  assert.equal(audio.hash, "deadbeef");
});

test("AudioResult stores filePath correctly", () => {
  const audio = makeAudio("h", "/my/track.wav");
  assert.equal(audio.filePath, "/my/track.wav");
});

test("AudioResult stores sampleRate correctly", () => {
  const audio = makeAudio("h", "/f.wav", 48000);
  assert.equal(audio.sampleRate, 48000);
});

test("AudioResult stores duration correctly", () => {
  const audio = makeAudio("h", "/f.wav", 44100, 3.14);
  assert.equal(audio.duration, 3.14);
});

test("AudioResult stores channels correctly", () => {
  const audio = makeAudio("h", "/f.wav", 44100, 1.0, 6);
  assert.equal(audio.channels, 6);
});

test("AudioResult stores id correctly", () => {
  const audio = makeAudio("h", "/f.wav", 44100, 1.0, 2, 42);
  assert.equal(audio.id, 42);
});

test("AudioResult defaults channels to 1 when omitted", () => {
  const audio = new AudioResult("display", "hash", "/f.wav", 44100, 1.0);
  assert.equal(audio.channels, 1);
});

test("AudioResult id is undefined when omitted", () => {
  const audio = new AudioResult("display", "hash", "/f.wav", 44100, 1.0);
  assert.equal(audio.id, undefined);
});

test("AudioResult accepts undefined filePath", () => {
  const audio = new AudioResult("display", "hash", undefined, 44100, 1.0);
  assert.equal(audio.filePath, undefined);
});

// ---------------------------------------------------------------------------
// AudioResult — toString
// ---------------------------------------------------------------------------

test("AudioResult.toString returns the display string", () => {
  const audio = new AudioResult("my custom display", "h", "/f.wav", 44100, 1.0);
  assert.equal(audio.toString(), "my custom display");
});

// ---------------------------------------------------------------------------
// AudioResult — help
// ---------------------------------------------------------------------------

test("AudioResult.help returns something truthy", () => {
  // In the test environment the default _helpRenderer returns a plain string;
  // we just verify help() produces a non-empty value.
  const audio = makeAudio();
  const result = audio.help();
  assert.ok(result, "help() should return a truthy value");
});

// ---------------------------------------------------------------------------
// AudioResult — stop (uses unavailableSampleBindings → returns BounceResult)
// ---------------------------------------------------------------------------

test("AudioResult.stop returns a BounceResult", () => {
  const audio = makeAudio();
  const result = audio.stop();
  assert.ok(result instanceof BounceResult, "stop() returns a BounceResult");
});

test("AudioResult.stop message mentions 'not available'", () => {
  const audio = makeAudio();
  assert.ok(
    audio.stop().toString().includes("not available"),
    "stop() message should mention 'not available'",
  );
});

// ---------------------------------------------------------------------------
// AudioResult — methods that reject (unavailableSampleBindings stubs)
// ---------------------------------------------------------------------------

test("AudioResult.play rejects with 'cannot be played' error", async () => {
  const audio = makeAudio();
  await assert.rejects(
    async () => { await audio.play(); },
    /cannot be played/,
  );
});

test("AudioResult.loop rejects with 'cannot be looped' error", async () => {
  const audio = makeAudio();
  await assert.rejects(
    async () => { await audio.loop(); },
    /cannot be looped/,
  );
});

test("AudioResult.display rejects with 'cannot be displayed' error", async () => {
  const audio = makeAudio();
  await assert.rejects(
    async () => { await audio.display(); },
    /cannot be displayed/,
  );
});

test("AudioResult.slice rejects with 'does not support slicing' error", async () => {
  const audio = makeAudio();
  await assert.rejects(
    async () => { await audio.slice(); },
    /does not support slicing/,
  );
});

test("AudioResult.sep rejects", async () => {
  const audio = makeAudio();
  await assert.rejects(
    async () => { await audio.sep(); },
    /does not support separation/,
  );
});

test("AudioResult.onsetSlice rejects with onset analysis error", async () => {
  const audio = makeAudio();
  await assert.rejects(
    async () => { await audio.onsetSlice(); },
    /does not support onset analysis/,
  );
});

test("AudioResult.ampSlice rejects", async () => {
  const audio = makeAudio();
  await assert.rejects(
    async () => { await audio.ampSlice(); },
    /does not support amplitude slice/,
  );
});

test("AudioResult.noveltySlice rejects", async () => {
  const audio = makeAudio();
  await assert.rejects(
    async () => { await audio.noveltySlice(); },
    /does not support novelty slice/,
  );
});

test("AudioResult.transientSlice rejects", async () => {
  const audio = makeAudio();
  await assert.rejects(
    async () => { await audio.transientSlice(); },
    /does not support transient slice/,
  );
});

test("AudioResult.nmf rejects with NMF error", async () => {
  const audio = makeAudio();
  await assert.rejects(
    async () => { await audio.nmf(); },
    /does not support NMF analysis/,
  );
});

test("AudioResult.mfcc rejects", async () => {
  const audio = makeAudio();
  await assert.rejects(
    async () => { await audio.mfcc(); },
    /does not support MFCC/,
  );
});

test("AudioResult.nx rejects", async () => {
  const other = makeAudio("other");
  const audio = makeAudio();
  await assert.rejects(
    async () => { await audio.nx(other); },
    /does not support NMF cross-synthesis/,
  );
});

test("AudioResult.grains rejects", async () => {
  const audio = makeAudio();
  await assert.rejects(
    async () => { await audio.grains(); },
    /does not support granularization/,
  );
});

// ---------------------------------------------------------------------------
// SamplePromise — constructed from a resolved AudioResult
// ---------------------------------------------------------------------------

test("SamplePromise.then resolves to the underlying SampleResult", async () => {
  const audio = makeAudio("sp-hash");
  const sp = new SamplePromise(Promise.resolve(audio));
  const result = await sp;
  assert.equal(result.hash, "sp-hash");
});

test("SamplePromise.help resolves to something truthy", async () => {
  const sp = new SamplePromise(Promise.resolve(makeAudio()));
  const result = await sp.help();
  assert.ok(result, "help() should resolve to a truthy value");
});

test("SamplePromise.stop resolves to a BounceResult", async () => {
  const sp = new SamplePromise(Promise.resolve(makeAudio()));
  const result = await sp.stop();
  assert.ok(result instanceof BounceResult, "stop() resolves to BounceResult");
});

test("SamplePromise.stop message mentions 'not available'", async () => {
  const sp = new SamplePromise(Promise.resolve(makeAudio()));
  const result = await sp.stop();
  assert.ok(result.toString().includes("not available"));
});

test("SamplePromise.play rejects because AudioResult bindings throw", async () => {
  const sp = new SamplePromise(Promise.resolve(makeAudio()));
  await assert.rejects(
    async () => { await sp.play(); },
    /cannot be played/,
  );
});

test("SamplePromise.catch handles an upstream rejection", async () => {
  const sp = new SamplePromise(Promise.reject(new Error("upstream failure")));
  let caught: unknown;
  await sp.catch((err) => { caught = err; });
  assert.ok(caught instanceof Error, "caught should be an Error");
  assert.equal((caught as Error).message, "upstream failure");
});

test("SamplePromise.slice rejects (AudioResult stub)", async () => {
  const sp = new SamplePromise(Promise.resolve(makeAudio()));
  await assert.rejects(
    async () => { await sp.slice(); },
    /does not support slicing/,
  );
});

test("SamplePromise.nmf rejects (AudioResult stub)", async () => {
  const sp = new SamplePromise(Promise.resolve(makeAudio()));
  await assert.rejects(
    async () => { await sp.nmf(); },
    /does not support NMF analysis/,
  );
});

// ---------------------------------------------------------------------------
// CurrentSamplePromise — null path
// ---------------------------------------------------------------------------

test("CurrentSamplePromise.then resolves to null", async () => {
  const csp = new CurrentSamplePromise(Promise.resolve(null));
  const result = await csp;
  assert.equal(result, null);
});

test("CurrentSamplePromise.stop throws 'No audio loaded' when value is null", async () => {
  const csp = new CurrentSamplePromise(Promise.resolve(null));
  await assert.rejects(
    async () => { await csp.stop(); },
    /No audio loaded/,
  );
});

test("CurrentSamplePromise.play throws 'No audio loaded' when value is null", async () => {
  const csp = new CurrentSamplePromise(Promise.resolve(null));
  await assert.rejects(
    async () => { await csp.play(); },
    /No audio loaded/,
  );
});

test("CurrentSamplePromise.help throws 'No audio loaded' when value is null", async () => {
  const csp = new CurrentSamplePromise(Promise.resolve(null));
  await assert.rejects(
    async () => { await csp.help(); },
    /No audio loaded/,
  );
});

test("CurrentSamplePromise.slice throws 'No audio loaded' when value is null", async () => {
  const csp = new CurrentSamplePromise(Promise.resolve(null));
  await assert.rejects(
    async () => { await csp.slice(); },
    /No audio loaded/,
  );
});

test("CurrentSamplePromise.catch handles rejection", async () => {
  const csp = new CurrentSamplePromise(Promise.reject(new Error("csp failure")));
  let caught: unknown;
  await csp.catch((err) => { caught = err; });
  assert.ok(caught instanceof Error);
  assert.equal((caught as Error).message, "csp failure");
});

// ---------------------------------------------------------------------------
// CurrentSamplePromise — non-null path (behaves like SamplePromise)
// ---------------------------------------------------------------------------

test("CurrentSamplePromise.then resolves to the AudioResult", async () => {
  const audio = makeAudio("csp-hash");
  const csp = new CurrentSamplePromise(Promise.resolve(audio));
  const result = await csp;
  assert.ok(result !== null);
  assert.equal(result?.hash, "csp-hash");
});

test("CurrentSamplePromise.stop resolves to a BounceResult when audio is loaded", async () => {
  const csp = new CurrentSamplePromise(Promise.resolve(makeAudio()));
  const result = await csp.stop();
  assert.ok(result instanceof BounceResult);
  assert.ok(result.toString().includes("not available"));
});

test("CurrentSamplePromise.help resolves to truthy value when audio is loaded", async () => {
  const csp = new CurrentSamplePromise(Promise.resolve(makeAudio()));
  const result = await csp.help();
  assert.ok(result, "help() should resolve to a truthy value");
});

test("CurrentSamplePromise.play rejects with AudioResult stub error when audio is loaded", async () => {
  const csp = new CurrentSamplePromise(Promise.resolve(makeAudio()));
  await assert.rejects(
    async () => { await csp.play(); },
    /cannot be played/,
  );
});

test("CurrentSamplePromise.nmf rejects with AudioResult stub error when audio is loaded", async () => {
  const csp = new CurrentSamplePromise(Promise.resolve(makeAudio()));
  await assert.rejects(
    async () => { await csp.nmf(); },
    /does not support NMF analysis/,
  );
});

// ---------------------------------------------------------------------------
// SampleListResult
// ---------------------------------------------------------------------------

test("SampleListResult.toString returns the display string", () => {
  const list = new SampleListResult("3 samples", [], [], () => new BounceResult("help"));
  assert.equal(list.toString(), "3 samples");
});

test("SampleListResult.length returns sample count", () => {
  const samples = [makeAudio("h1"), makeAudio("h2"), makeAudio("h3")];
  const list = new SampleListResult("3 samples", samples, [], () => new BounceResult("help"));
  assert.equal(list.length, 3);
});

test("SampleListResult.length is 0 for empty list", () => {
  const list = new SampleListResult("empty", [], [], () => new BounceResult("help"));
  assert.equal(list.length, 0);
});

test("SampleListResult.help uses the provided helpFactory", () => {
  const list = new SampleListResult(
    "display",
    [],
    [],
    () => new BounceResult("list help text"),
  );
  assert.equal(list.help().toString(), "list help text");
});

test("SampleListResult[Symbol.iterator] yields all samples in order", () => {
  const a1 = makeAudio("h1");
  const a2 = makeAudio("h2");
  const a3 = makeAudio("h3");
  const list = new SampleListResult("3 samples", [a1, a2, a3], [], () => new BounceResult("help"));

  const collected: AudioResult[] = [];
  for (const item of list) {
    collected.push(item as AudioResult);
  }

  assert.equal(collected.length, 3, "iterator should yield all samples");
  assert.equal(collected[0].hash, "h1");
  assert.equal(collected[1].hash, "h2");
  assert.equal(collected[2].hash, "h3");
});

test("SampleListResult[Symbol.iterator] yields nothing for empty list", () => {
  const list = new SampleListResult("empty", [], [], () => new BounceResult("help"));
  const items = [...list];
  assert.equal(items.length, 0);
});

test("SampleListResult.features are stored on the result", () => {
  const features: SampleSummaryFeature[] = [
    {
      sampleHash: "h1",
      featureHash: "fh1",
      featureType: "onsetSlice",
      featureCount: 5,
      filePath: "/f.wav",
      options: null,
    },
    {
      sampleHash: "h2",
      featureHash: undefined,
      featureType: "mfcc",
      featureCount: 13,
      filePath: undefined,
      options: '{"numCoeffs":13}',
    },
  ];
  const list = new SampleListResult("display", [], features, () => new BounceResult("help"));
  assert.equal(list.features.length, 2);
  assert.equal(list.features[0].featureType, "onsetSlice");
  assert.equal(list.features[1].featureType, "mfcc");
  assert.equal(list.features[1].featureHash, undefined);
});

test("SampleListResult.samples property exposes the sample array", () => {
  const a1 = makeAudio("h1");
  const a2 = makeAudio("h2");
  const list = new SampleListResult("list", [a1, a2], [], () => new BounceResult("help"));
  assert.equal(list.samples.length, 2);
  assert.equal(list.samples[0].hash, "h1");
});

// ---------------------------------------------------------------------------
// GrainCollectionPromise
// ---------------------------------------------------------------------------

test("GrainCollectionPromise.then resolves to the GrainCollection", async () => {
  const gc = new GrainCollection([makeAudio("g1"), null], false, "sourcehash");
  const gcp = new GrainCollectionPromise(Promise.resolve(gc));
  const result = await gcp;
  assert.equal(result.length(), 1, "only 1 non-null grain");
});

test("GrainCollectionPromise.length resolves to the non-null grain count", async () => {
  const grains = [makeAudio("g1"), makeAudio("g2"), null, makeAudio("g3")];
  const gc = new GrainCollection(grains, false, "src");
  const gcp = new GrainCollectionPromise(Promise.resolve(gc));
  const len = await gcp.length();
  assert.equal(len, 3);
});

test("GrainCollectionPromise.length is 0 for empty collection", async () => {
  const gc = new GrainCollection([], false, "src");
  const gcp = new GrainCollectionPromise(Promise.resolve(gc));
  assert.equal(await gcp.length(), 0);
});

test("GrainCollectionPromise.map transforms each grain", async () => {
  const a1 = makeAudio("g1");
  const a2 = makeAudio("g2");
  const gc = new GrainCollection([a1, a2], false, "src");
  const gcp = new GrainCollectionPromise(Promise.resolve(gc));
  const hashes = await gcp.map((grain) => grain.hash);
  assert.deepEqual(hashes, ["g1", "g2"]);
});

test("GrainCollectionPromise.filter returns a GrainCollectionPromise of matching grains", async () => {
  const a1 = new AudioResult("g1", "g1", "/g1.wav", 44100, 0.1, 1);
  const a2 = new AudioResult("g2", "g2", "/g2.wav", 44100, 0.5, 1);
  const a3 = new AudioResult("g3", "g3", "/g3.wav", 44100, 1.0, 1);
  const gc = new GrainCollection([a1, a2, a3], false, "src");
  const gcp = new GrainCollectionPromise(Promise.resolve(gc));

  const filtered = gcp.filter((grain) => grain.duration > 0.3);
  assert.ok(filtered instanceof GrainCollectionPromise, "filter returns GrainCollectionPromise");

  const len = await filtered.length();
  assert.equal(len, 2, "two grains have duration > 0.3");
});

test("GrainCollectionPromise.forEach iterates all non-null grains", async () => {
  const a1 = makeAudio("g1");
  const a2 = makeAudio("g2");
  const gc = new GrainCollection([a1, null, a2], false, "src");
  const gcp = new GrainCollectionPromise(Promise.resolve(gc));

  const visited: string[] = [];
  await gcp.forEach((grain) => { visited.push(grain.hash); });
  assert.deepEqual(visited, ["g1", "g2"]);
});

test("GrainCollectionPromise.catch handles a rejection", async () => {
  const gcp = new GrainCollectionPromise(Promise.reject(new Error("gc error")));
  let caught: unknown;
  await gcp.catch((err) => { caught = err; });
  assert.ok(caught instanceof Error);
  assert.equal((caught as Error).message, "gc error");
});
