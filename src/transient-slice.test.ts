import { TransientSlice } from "./index.js";
import assert from "node:assert/strict";
import { test } from "vitest";

test("TransientSlice default construction", () => {
  const slicer = new TransientSlice();
  assert.ok(slicer);
});

test("TransientSlice processes Float32Array", () => {
  const slicer = new TransientSlice();
  const audio = new Float32Array(44100);
  for (let i = 0; i < 44100; i++) {
    if (i === 4410 || i === 13230 || i === 22050) audio[i] = 1.0;
  }
  const slices = slicer.process(audio);
  assert.ok(Array.isArray(slices));
});
