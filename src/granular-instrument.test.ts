import assert from "node:assert/strict";
import { test } from "vitest";
import { buildInstNamespace } from "./renderer/namespaces/instrument-namespace.js";
import { replRegistry } from "./shared/repl-registry.generated.js";

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

test("inst.granular @describe summary mentions granular synthesis", () => {
  const entry = replRegistry["inst.granular"];
  assert.ok(entry, "inst.granular entry should exist in replRegistry");
  assert.ok(
    entry.summary.includes("granular synthesis"),
    `Expected summary to mention granular synthesis, got: ${entry.summary}`,
  );
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

test("g.help() returns non-empty help text (Phase 5.2: returns @replType summary; Phase 5.3 will restore rich help)", () => {
  const g = inst.granular({ name: "test4" }) as ReturnType<typeof inst.granular> & {
    help: () => unknown;
  };
  const helpText = String(g.help());
  assert.ok(helpText.length > 0, `Expected non-empty help text, got: ${helpText}`);
  assert.ok(helpText.includes("granular instrument"), `Expected 'granular instrument' in help text, got: ${helpText}`);
});

test("g.set({ unknown: 1 }) returns error message containing unknown params", () => {
  const g = inst.granular({ name: "test5" }) as ReturnType<typeof inst.granular> & {
    set: (params: Record<string, number>) => import("./renderer/bounce-result.js").BounceResult;
  };
  const result = g.set({ unknown: 1 });
  assert.ok(result.toString().includes("unknown params"), `Expected 'unknown params' in: ${result.toString()}`);
});
