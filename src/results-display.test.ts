/**
 * Unit tests for src/renderer/results/base.ts and src/renderer/results/instrument.ts
 *
 * No Electron dependency — pure TypeScript result objects.
 */

import assert from "node:assert/strict";
import { BounceResult, HelpableResult, FeatureResult, defaultHelp } from "./renderer/results/base.js";
import { InstrumentResult, InstrumentListResult } from "./renderer/results/instrument.js";

// ---------------------------------------------------------------------------
// BounceResult
// ---------------------------------------------------------------------------

{
  const r = new BounceResult("hello \x1b[32mworld\x1b[0m");
  assert.equal(r.toString(), "hello \x1b[32mworld\x1b[0m", "toString returns displayText");
  console.log("BounceResult.toString: ✓");
}

// ---------------------------------------------------------------------------
// defaultHelp
// ---------------------------------------------------------------------------

{
  const r = defaultHelp("myNs");
  assert.ok(r.toString().includes("myNs"), "defaultHelp includes the name");
  console.log("defaultHelp: ✓");
}

// ---------------------------------------------------------------------------
// HelpableResult
// ---------------------------------------------------------------------------

{
  let helpCalled = false;
  const factory = () => {
    helpCalled = true;
    return new BounceResult("help text");
  };
  const r = new HelpableResult("display", factory);

  assert.equal(r.toString(), "display", "toString returns display");
  const helpResult = r.help();
  assert.ok(helpCalled, "helpFactory was called");
  assert.equal(helpResult.toString(), "help text", "help() returns factory result");
  console.log("HelpableResult: ✓");
}

// ---------------------------------------------------------------------------
// FeatureResult — source as SampleResult (object with .hash)
// ---------------------------------------------------------------------------

{
  const mockSample = { hash: "abc123" } as Parameters<typeof FeatureResult.prototype.toString>[never] & { hash: string };

  const r = new FeatureResult(
    "display text",
    mockSample as never,
    "featureHash1",
    "onsetSlice",
    { threshold: 0.5 },
  );

  assert.equal(r.toString(), "display text", "toString returns display");
  assert.equal(r.source, mockSample, "source is the SampleResult object");
  assert.equal(r.sourceHash, "abc123", "sourceHash comes from source.hash");
  assert.equal(r.featureHash, "featureHash1", "featureHash stored");
  assert.equal(r.featureType, "onsetSlice", "featureType stored");
  assert.deepEqual(r.options, { threshold: 0.5 }, "options stored");
  console.log("FeatureResult (source as object): ✓");
}

// ---------------------------------------------------------------------------
// FeatureResult — source as hash string
// ---------------------------------------------------------------------------

{
  const r = new FeatureResult(
    "display text",
    "hashOnlyString",
    "featureHash2",
    "mfcc",
    null,
  );

  assert.equal(r.source, undefined, "source is undefined when passed a string");
  assert.equal(r.sourceHash, "hashOnlyString", "sourceHash is the string itself");
  console.log("FeatureResult (source as string): ✓");
}

// ---------------------------------------------------------------------------
// FeatureResult — custom helpFactory
// ---------------------------------------------------------------------------

{
  const customHelp = () => new BounceResult("custom help");
  const r = new FeatureResult("x", "hash", "fh", "nmf", {}, customHelp);
  assert.equal(r.help().toString(), "custom help", "custom helpFactory is used");
  console.log("FeatureResult (custom helpFactory): ✓");
}

// ---------------------------------------------------------------------------
// InstrumentResult
// ---------------------------------------------------------------------------

{
  const helpFactory = () => new BounceResult("instrument help");
  const r = new InstrumentResult(
    "Drum Kit (sampler, 8 samples)",
    "instr-001",
    "Drum Kit",
    "sampler",
    8,
    4,
    helpFactory,
  );

  assert.equal(r.toString(), "Drum Kit (sampler, 8 samples)", "toString correct");
  assert.equal(r.instrumentId, "instr-001", "instrumentId stored");
  assert.equal(r.name, "Drum Kit", "name stored");
  assert.equal(r.kind, "sampler", "kind stored");
  assert.equal(r.polyphony, 8, "polyphony stored");
  assert.equal(r.sampleCount, 4, "sampleCount stored");
  assert.equal(r.help().toString(), "instrument help", "help() uses factory");
  console.log("InstrumentResult: ✓");
}

// ---------------------------------------------------------------------------
// InstrumentListResult — length
// ---------------------------------------------------------------------------

{
  const instruments = [
    { name: "Drum Kit", kind: "sampler", sampleCount: 4 },
    { name: "Pad", kind: "granular", sampleCount: 2 },
  ];
  const r = new InstrumentListResult("2 instruments", instruments);

  assert.equal(r.toString(), "2 instruments", "toString correct");
  assert.equal(r.length, 2, "length returns instrument count");
  console.log("InstrumentListResult.length: ✓");
}

// ---------------------------------------------------------------------------
// InstrumentListResult — Symbol.iterator
// ---------------------------------------------------------------------------

{
  const instruments = [
    { name: "Kit", kind: "sampler", sampleCount: 1 },
    { name: "Synth", kind: "granular", sampleCount: 3 },
  ];
  const r = new InstrumentListResult("list", instruments);

  const collected: typeof instruments = [];
  for (const item of r) {
    collected.push(item);
  }

  assert.equal(collected.length, 2, "iterator yields all items");
  assert.equal(collected[0].name, "Kit", "first item correct");
  assert.equal(collected[1].name, "Synth", "second item correct");
  console.log("InstrumentListResult[Symbol.iterator]: ✓");
}

// ---------------------------------------------------------------------------
// InstrumentListResult — empty
// ---------------------------------------------------------------------------

{
  const r = new InstrumentListResult("no instruments", []);
  assert.equal(r.length, 0, "empty list has length 0");
  const items: unknown[] = [...r];
  assert.equal(items.length, 0, "empty iterator yields nothing");
  console.log("InstrumentListResult (empty): ✓");
}

console.log("\nAll results-display tests passed.");
