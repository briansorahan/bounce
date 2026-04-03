import assert from "node:assert/strict";
import { test } from "node:test";
import { buildInstNamespace } from "./renderer/namespaces/instrument-namespace.js";

const calls: Array<{ method: string; args: unknown[] }> = [];

const mockElectron = {
  defineInstrument: (...args: unknown[]) => { calls.push({ method: "defineInstrument", args }); },
  setInstrumentParam: (...args: unknown[]) => { calls.push({ method: "setInstrumentParam", args }); },
  loadInstrumentSample: (...args: unknown[]) => { calls.push({ method: "loadInstrumentSample", args }); },
  instrumentNoteOn: (...args: unknown[]) => { calls.push({ method: "instrumentNoteOn", args }); },
  instrumentNoteOff: (...args: unknown[]) => { calls.push({ method: "instrumentNoteOff", args }); },
  instrumentStopAll: (...args: unknown[]) => { calls.push({ method: "instrumentStopAll", args }); },
  freeInstrument: (...args: unknown[]) => { calls.push({ method: "freeInstrument", args }); },
  listDbInstruments: async () => [],
};

(globalThis as Record<string, unknown>).window = { electron: mockElectron };
// Cleanup global mock after all tests (prevents cross-suite pollution)
process.on("beforeExit", () => { delete (globalThis as Record<string, unknown>).window; });

const deps = {
  onProjectLoad: undefined as (() => Promise<void>) | undefined,
  terminal: {} as import("./renderer/terminal.js").BounceTerminal,
  audioManager: {} as import("./renderer/audio-context.js").AudioManager,
  sharedState: { api: null, visualizationScenes: null },
  getSceneManager: () => { throw new Error("not implemented"); },
};
const inst = buildInstNamespace(deps);

test("inst.granular.help() mentions granular synthesis", () => {
  const result = inst.granular.help();
  assert.ok(result.toString().includes("Create a new granular synthesis instrument"));
});

test("inst.granular() returns an object whose toString() starts with Granular", () => {
  calls.length = 0;
  const g = inst.granular({ name: "test" });
  assert.ok(g.toString().includes("Granular 'test'"));
});

test("inst.granular() default params shown in toString()", () => {
  const g = inst.granular({ name: "test2" });
  assert.ok(g.toString().includes("80ms grains @ 20/s"));
});

test("g.set({ position: 0.3 }) updates toString()", () => {
  const g = inst.granular({ name: "test3" }) as ReturnType<typeof inst.granular> & {
    set: (params: Record<string, number>) => import("./renderer/bounce-result.js").BounceResult;
  };
  g.set({ position: 0.3 });
  assert.ok(g.toString().includes("pos 0.30"));
});

test("g.help() output contains Load the source sample and grainSize", () => {
  const g = inst.granular({ name: "test4" }) as ReturnType<typeof inst.granular> & {
    help: () => import("./renderer/bounce-result.js").BounceResult;
  };
  const helpText = g.help().toString();
  assert.ok(helpText.includes("Load the source sample"), `Missing 'Load the source sample' in: ${helpText}`);
  assert.ok(helpText.includes("grainSize"), `Missing 'grainSize' in: ${helpText}`);
});

test("g.set({ unknown: 1 }) returns error message containing unknown params", () => {
  const g = inst.granular({ name: "test5" }) as ReturnType<typeof inst.granular> & {
    set: (params: Record<string, number>) => import("./renderer/bounce-result.js").BounceResult;
  };
  const result = g.set({ unknown: 1 });
  assert.ok(result.toString().includes("unknown params"), `Expected 'unknown params' in: ${result.toString()}`);
});
