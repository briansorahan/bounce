/**
 * Unit tests for src/renderer/results/features.ts
 *
 * No Electron dependency — pure TypeScript result objects.
 */

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  SliceFeatureResult,
  NmfFeatureResult,
  NxFeatureResult,
  MfccFeatureResult,
  SliceFeaturePromise,
  NmfFeaturePromise,
  NxFeaturePromise,
  MfccFeaturePromise,
  type SliceFeatureBindings,
  type NmfFeatureBindings,
  type NxFeatureBindings,
  type MfccFeatureBindings,
} from "./renderer/results/features.js";
import { AudioResult, SamplePromise } from "./renderer/results/sample.js";
import { BounceResult } from "./renderer/results/base.js";
import { InstrumentResult } from "./renderer/results/instrument.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const mockSample = new AudioResult("test sample", "hash123", "/path/test.wav", 44100, 2.5, 2, 1);

const mockSliceBindings: SliceFeatureBindings = {
  help: () => new BounceResult("slice help"),
  slice: async () => new BounceResult("sliced"),
  playSlice: async () => mockSample,
  toSampler: async () =>
    new InstrumentResult(
      "Drum Kit (sampler, 4 samples)",
      "instr-001",
      "Drum Kit",
      "sampler",
      8,
      4,
      () => new BounceResult("sampler help"),
    ),
};

const mockNmfBindings: NmfFeatureBindings = {
  help: () => new BounceResult("nmf help"),
  sep: async () => new BounceResult("separated"),
  playComponent: async () => mockSample,
};

const mockNxBindings: NxFeatureBindings = {
  help: () => new BounceResult("nx help"),
  playComponent: async () => mockSample,
};

const mockMfccBindings: MfccFeatureBindings = {
  help: () => new BounceResult("mfcc help"),
};

// ---------------------------------------------------------------------------
// SliceFeatureResult — constructor
// ---------------------------------------------------------------------------

test("SliceFeatureResult stores constructor properties", () => {
  const slices = [0, 1000, 2000, 3000];
  const r = new SliceFeatureResult(
    "onset-slice display",
    mockSample,
    "featureHash-slice",
    { threshold: 0.5 },
    slices,
    mockSliceBindings,
  );

  assert.equal(r.toString(), "onset-slice display", "toString returns display");
  assert.equal(r.source, mockSample, "source is the sample");
  assert.equal(r.sourceHash, "hash123", "sourceHash comes from source.hash");
  assert.equal(r.featureHash, "featureHash-slice", "featureHash stored");
  assert.equal(r.featureType, "onset-slice", "featureType is onset-slice");
  assert.deepEqual(r.slices, slices, "slices array stored");
});

test("SliceFeatureResult.count returns slices.length", () => {
  const slices = [0, 500, 1000];
  const r = new SliceFeatureResult("display", mockSample, "fh", undefined, slices, mockSliceBindings);
  assert.equal(r.count, 3, "count equals number of slices");
});

test("SliceFeatureResult.count returns 0 for empty slices", () => {
  const r = new SliceFeatureResult("display", mockSample, "fh", undefined, [], mockSliceBindings);
  assert.equal(r.count, 0, "count is 0 for empty array");
});

// ---------------------------------------------------------------------------
// SliceFeatureResult — help
// ---------------------------------------------------------------------------

test("SliceFeatureResult.help returns BounceResult containing type name", () => {
  // @replType injects help() from the registry (not bindings.help) for types with
  // registered methods. The default renderer produces "<TypeName>: <summary>".
  const r = new SliceFeatureResult("display", mockSample, "fh", undefined, [], mockSliceBindings);
  const helpText = String(r.help());
  assert.ok(helpText.includes("SliceFeature"), "help text includes type name");
});

// ---------------------------------------------------------------------------
// SliceFeatureResult — slice
// ---------------------------------------------------------------------------

test("SliceFeatureResult.slice calls binding and resolves BounceResult", async () => {
  const r = new SliceFeatureResult("display", mockSample, "fh", undefined, [], mockSliceBindings);
  const result = await r.slice({ featureHash: "override" });
  assert.ok(result instanceof BounceResult, "slice returns BounceResult");
  assert.equal(result.toString(), "sliced");
});

// ---------------------------------------------------------------------------
// SliceFeatureResult — playSlice
// ---------------------------------------------------------------------------

test("SliceFeatureResult.playSlice returns SamplePromise that resolves to sample", async () => {
  const r = new SliceFeatureResult("display", mockSample, "fh", undefined, [0, 100], mockSliceBindings);
  const sp = r.playSlice(0);
  assert.ok(sp instanceof SamplePromise, "playSlice returns SamplePromise");
  const resolved = await sp;
  assert.equal(resolved.hash, "hash123", "resolves to the bound sample");
});

// ---------------------------------------------------------------------------
// NmfFeatureResult — constructor
// ---------------------------------------------------------------------------

test("NmfFeatureResult stores constructor properties", () => {
  const bases = [[1, 2], [3, 4]];
  const activations = [[0.5, 0.5]];
  const r = new NmfFeatureResult(
    "nmf display",
    mockSample,
    "featureHash-nmf",
    { components: 4 },
    4,
    100,
    true,
    bases,
    activations,
    mockNmfBindings,
  );

  assert.equal(r.toString(), "nmf display", "toString returns display");
  assert.equal(r.featureHash, "featureHash-nmf", "featureHash stored");
  assert.equal(r.featureType, "nmf", "featureType is nmf");
  assert.equal(r.components, 4, "components stored");
  assert.equal(r.iterations, 100, "iterations stored");
  assert.equal(r.converged, true, "converged stored");
  assert.deepEqual(r.bases, bases, "bases stored");
  assert.deepEqual(r.activations, activations, "activations stored");
});

test("NmfFeatureResult stores undefined optional fields", () => {
  const r = new NmfFeatureResult(
    "display",
    mockSample,
    "fh",
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    mockNmfBindings,
  );
  assert.equal(r.components, undefined, "components can be undefined");
  assert.equal(r.iterations, undefined, "iterations can be undefined");
  assert.equal(r.converged, undefined, "converged can be undefined");
  assert.equal(r.bases, undefined, "bases can be undefined");
  assert.equal(r.activations, undefined, "activations can be undefined");
});

// ---------------------------------------------------------------------------
// NmfFeatureResult — help
// ---------------------------------------------------------------------------

test("NmfFeatureResult.help returns BounceResult containing type name", () => {
  // @replType injects help() from the registry for types with registered methods.
  const r = new NmfFeatureResult(
    "display",
    mockSample,
    "fh",
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    mockNmfBindings,
  );
  const helpText = String(r.help());
  assert.ok(helpText.includes("NmfFeature"), "help text includes type name");
});

// ---------------------------------------------------------------------------
// NmfFeatureResult — sep
// ---------------------------------------------------------------------------

test("NmfFeatureResult.sep calls binding and resolves BounceResult", async () => {
  const r = new NmfFeatureResult("display", mockSample, "fh", undefined, 2, 50, false, undefined, undefined, mockNmfBindings);
  const result = await r.sep();
  assert.ok(result instanceof BounceResult);
  assert.equal(result.toString(), "separated");
});

// ---------------------------------------------------------------------------
// NmfFeatureResult — playComponent
// ---------------------------------------------------------------------------

test("NmfFeatureResult.playComponent returns SamplePromise that resolves to sample", async () => {
  const r = new NmfFeatureResult("display", mockSample, "fh", undefined, 2, 50, false, undefined, undefined, mockNmfBindings);
  const sp = r.playComponent(1);
  assert.ok(sp instanceof SamplePromise, "playComponent returns SamplePromise");
  const resolved = await sp;
  assert.equal(resolved.hash, "hash123");
});

// ---------------------------------------------------------------------------
// NxFeatureResult — constructor
// ---------------------------------------------------------------------------

test("NxFeatureResult stores constructor properties", () => {
  const bases = [[1, 2]];
  const activations = [[0.3, 0.7]];
  const r = new NxFeatureResult(
    "nx display",
    mockSample,
    "featureHash-nx",
    {},
    3,
    "sourceSampleHash",
    "sourceFeatureHash",
    bases,
    activations,
    mockNxBindings,
  );

  assert.equal(r.toString(), "nx display", "toString returns display");
  assert.equal(r.featureHash, "featureHash-nx", "featureHash stored");
  assert.equal(r.featureType, "nmf-cross", "featureType is nmf-cross");
  assert.equal(r.components, 3, "components stored");
  assert.equal(r.sourceSampleHash, "sourceSampleHash", "sourceSampleHash stored");
  assert.equal(r.sourceFeatureHash, "sourceFeatureHash", "sourceFeatureHash stored");
  assert.deepEqual(r.bases, bases, "bases stored");
  assert.deepEqual(r.activations, activations, "activations stored");
});

// ---------------------------------------------------------------------------
// NxFeatureResult — help
// ---------------------------------------------------------------------------

test("NxFeatureResult.help returns BounceResult containing type name", () => {
  // @replType injects help() from the registry for types with registered methods.
  const r = new NxFeatureResult(
    "display",
    mockSample,
    "fh",
    undefined,
    2,
    "ssh",
    "sfh",
    undefined,
    undefined,
    mockNxBindings,
  );
  const helpText = String(r.help());
  assert.ok(helpText.includes("NxFeature"), "help text includes type name");
});

// ---------------------------------------------------------------------------
// NxFeatureResult — playComponent
// ---------------------------------------------------------------------------

test("NxFeatureResult.playComponent returns SamplePromise that resolves to sample", async () => {
  const r = new NxFeatureResult("display", mockSample, "fh", undefined, 2, "ssh", "sfh", undefined, undefined, mockNxBindings);
  const sp = r.playComponent(0);
  assert.ok(sp instanceof SamplePromise, "playComponent returns SamplePromise");
  const resolved = await sp;
  assert.equal(resolved.hash, "hash123");
});

// ---------------------------------------------------------------------------
// MfccFeatureResult — constructor
// ---------------------------------------------------------------------------

test("MfccFeatureResult stores constructor properties", () => {
  const r = new MfccFeatureResult(
    "mfcc display",
    mockSample,
    "featureHash-mfcc",
    { numCoeffs: 13 },
    512,
    13,
    mockMfccBindings,
  );

  assert.equal(r.toString(), "mfcc display", "toString returns display");
  assert.equal(r.featureHash, "featureHash-mfcc", "featureHash stored");
  assert.equal(r.featureType, "mfcc", "featureType is mfcc");
  assert.equal(r.numFrames, 512, "numFrames stored");
  assert.equal(r.numCoeffs, 13, "numCoeffs stored");
});

// ---------------------------------------------------------------------------
// MfccFeatureResult — help
// ---------------------------------------------------------------------------

test("MfccFeatureResult.help returns BounceResult from factory", () => {
  const r = new MfccFeatureResult("display", mockSample, "fh", undefined, 256, 20, mockMfccBindings);
  const helpResult = r.help();
  assert.equal(helpResult.toString(), "mfcc help");
});

// ---------------------------------------------------------------------------
// SliceFeaturePromise
// ---------------------------------------------------------------------------

function makeSliceFeature(slices: number[] = [0, 100, 200]): SliceFeatureResult {
  return new SliceFeatureResult("slice feature", mockSample, "fh-slice", undefined, slices, mockSliceBindings);
}

test("SliceFeaturePromise.then resolves to SliceFeatureResult", async () => {
  const feature = makeSliceFeature();
  const promise = new SliceFeaturePromise(Promise.resolve(feature));
  const resolved = await promise;
  assert.ok(resolved instanceof SliceFeatureResult);
  assert.equal(resolved.count, 3);
});

test("SliceFeaturePromise.catch handles rejection", async () => {
  const promise = new SliceFeaturePromise(Promise.reject(new Error("slice error")));
  let caught: unknown;
  await promise.catch((err) => {
    caught = err;
  });
  assert.ok(caught instanceof Error);
  assert.equal((caught as Error).message, "slice error");
});

test("SliceFeaturePromise.help proxies to feature.help() and contains type name", async () => {
  const feature = makeSliceFeature();
  const promise = new SliceFeaturePromise(Promise.resolve(feature));
  const helpText = String(await promise.help());
  assert.ok(helpText.includes("SliceFeature"), "help text includes type name");
});

test("SliceFeaturePromise.slice proxies to feature.slice()", async () => {
  const feature = makeSliceFeature();
  const promise = new SliceFeaturePromise(Promise.resolve(feature));
  const result = await promise.slice();
  assert.equal(result.toString(), "sliced");
});

test("SliceFeaturePromise.playSlice proxies and returns SamplePromise", async () => {
  const feature = makeSliceFeature();
  const promise = new SliceFeaturePromise(Promise.resolve(feature));
  const sp = promise.playSlice(0);
  assert.ok(sp instanceof SamplePromise, "playSlice returns SamplePromise");
  const resolved = await sp;
  assert.equal(resolved.hash, "hash123");
});

// ---------------------------------------------------------------------------
// NmfFeaturePromise
// ---------------------------------------------------------------------------

function makeNmfFeature(): NmfFeatureResult {
  return new NmfFeatureResult(
    "nmf feature",
    mockSample,
    "fh-nmf",
    undefined,
    2,
    100,
    true,
    undefined,
    undefined,
    mockNmfBindings,
  );
}

test("NmfFeaturePromise.then resolves to NmfFeatureResult", async () => {
  const feature = makeNmfFeature();
  const promise = new NmfFeaturePromise(Promise.resolve(feature));
  const resolved = await promise;
  assert.ok(resolved instanceof NmfFeatureResult);
  assert.equal(resolved.components, 2);
});

test("NmfFeaturePromise.catch handles rejection", async () => {
  const promise = new NmfFeaturePromise(Promise.reject(new Error("nmf error")));
  let caught: unknown;
  await promise.catch((err) => {
    caught = err;
  });
  assert.ok(caught instanceof Error);
  assert.equal((caught as Error).message, "nmf error");
});

test("NmfFeaturePromise.help proxies to feature.help() and contains type name", async () => {
  const feature = makeNmfFeature();
  const promise = new NmfFeaturePromise(Promise.resolve(feature));
  const helpText = String(await promise.help());
  assert.ok(helpText.includes("NmfFeature"), "help text includes type name");
});

test("NmfFeaturePromise.sep proxies to feature.sep()", async () => {
  const feature = makeNmfFeature();
  const promise = new NmfFeaturePromise(Promise.resolve(feature));
  const result = await promise.sep();
  assert.equal(result.toString(), "separated");
});

test("NmfFeaturePromise.playComponent proxies and returns SamplePromise", async () => {
  const feature = makeNmfFeature();
  const promise = new NmfFeaturePromise(Promise.resolve(feature));
  const sp = promise.playComponent(0);
  assert.ok(sp instanceof SamplePromise, "playComponent returns SamplePromise");
  const resolved = await sp;
  assert.equal(resolved.hash, "hash123");
});

// ---------------------------------------------------------------------------
// NxFeaturePromise
// ---------------------------------------------------------------------------

function makeNxFeature(): NxFeatureResult {
  return new NxFeatureResult(
    "nx feature",
    mockSample,
    "fh-nx",
    undefined,
    3,
    "ssh",
    "sfh",
    undefined,
    undefined,
    mockNxBindings,
  );
}

test("NxFeaturePromise.then resolves to NxFeatureResult", async () => {
  const feature = makeNxFeature();
  const promise = new NxFeaturePromise(Promise.resolve(feature));
  const resolved = await promise;
  assert.ok(resolved instanceof NxFeatureResult);
  assert.equal(resolved.components, 3);
});

test("NxFeaturePromise.catch handles rejection", async () => {
  const promise = new NxFeaturePromise(Promise.reject(new Error("nx error")));
  let caught: unknown;
  await promise.catch((err) => {
    caught = err;
  });
  assert.ok(caught instanceof Error);
  assert.equal((caught as Error).message, "nx error");
});

test("NxFeaturePromise.help proxies to feature.help() and contains type name", async () => {
  const feature = makeNxFeature();
  const promise = new NxFeaturePromise(Promise.resolve(feature));
  const helpText = String(await promise.help());
  assert.ok(helpText.includes("NxFeature"), "help text includes type name");
});

test("NxFeaturePromise.playComponent proxies and returns SamplePromise", async () => {
  const feature = makeNxFeature();
  const promise = new NxFeaturePromise(Promise.resolve(feature));
  const sp = promise.playComponent(1);
  assert.ok(sp instanceof SamplePromise, "playComponent returns SamplePromise");
  const resolved = await sp;
  assert.equal(resolved.hash, "hash123");
});

// ---------------------------------------------------------------------------
// MfccFeaturePromise
// ---------------------------------------------------------------------------

function makeMfccFeature(): MfccFeatureResult {
  return new MfccFeatureResult("mfcc feature", mockSample, "fh-mfcc", undefined, 256, 13, mockMfccBindings);
}

test("MfccFeaturePromise.then resolves to MfccFeatureResult", async () => {
  const feature = makeMfccFeature();
  const promise = new MfccFeaturePromise(Promise.resolve(feature));
  const resolved = await promise;
  assert.ok(resolved instanceof MfccFeatureResult);
  assert.equal(resolved.numCoeffs, 13);
  assert.equal(resolved.numFrames, 256);
});

test("MfccFeaturePromise.catch handles rejection", async () => {
  const promise = new MfccFeaturePromise(Promise.reject(new Error("mfcc error")));
  let caught: unknown;
  await promise.catch((err) => {
    caught = err;
  });
  assert.ok(caught instanceof Error);
  assert.equal((caught as Error).message, "mfcc error");
});

test("MfccFeaturePromise.help proxies to feature.help()", async () => {
  const feature = makeMfccFeature();
  const promise = new MfccFeaturePromise(Promise.resolve(feature));
  const helpResult = await promise.help();
  assert.equal(helpResult.toString(), "mfcc help");
});
