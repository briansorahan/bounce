import * as assert from "assert";
import { afterAll, test } from "vitest";
import { TabCompletion } from "./renderer/tab-completion.js";
import type { PredictionResult } from "./shared/completer.js";

function mockRequestCompletion(
  fn: (b: string, c: number, id: number) => Promise<PredictionResult[]>,
): void {
  const current = (globalThis as { window?: { electron?: Record<string, unknown> } }).window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      ...(current ?? {}),
      electron: {
        ...(current?.electron ?? {}),
        requestCompletion: fn,
      },
    },
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

async function testIdleOnEmptyBuffer() {
  const c = new TabCompletion();
  await c.update("", 0, true);
  assert.strictEqual(c.matchCount, 0);
}

async function testNoRequestCompletionYieldsNoMatches() {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: { electron: {} },
  });
  const c = new TabCompletion();
  await c.update("sn", 2, true);
  assert.strictEqual(c.matchCount, 0);
}

async function testSingleMatchNamespace() {
  mockRequestCompletion(async () => [
    { label: "sn", kind: "namespace" as const },
  ]);
  const c = new TabCompletion();
  await c.update("sn", 2, true);
  assert.strictEqual(c.matchCount, 1);
  const action = c.handleTab();
  assert.ok(action && action.kind === "accept");
  if (action?.kind === "accept") {
    assert.strictEqual(action.newBuffer, "sn()");
    assert.strictEqual(action.newCursorPosition, 3); // inside parens
  }
}

async function testMultiMatch() {
  mockRequestCompletion(async () => [
    { label: "clear", kind: "namespace" as const },
    { label: "corpus", kind: "namespace" as const },
  ]);
  const c = new TabCompletion();
  await c.update("c", 1, true);
  assert.strictEqual(c.matchCount, 2);
}

async function testGhostTextSingleMatchContainsSuffix() {
  mockRequestCompletion(async () => [
    { label: "sn", kind: "namespace" as const },
  ]);
  const c = new TabCompletion();
  await c.update("sn", 2, true);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("()"));
  assert.ok(ghost.includes("\x1b[90m"));
}

async function testGhostTextMultiMatchContainsCandidates() {
  mockRequestCompletion(async () => [
    { label: "clear", kind: "namespace" as const },
    { label: "corpus", kind: "namespace" as const },
  ]);
  const c = new TabCompletion();
  await c.update("c", 1, true);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("clear()"));
  assert.ok(ghost.includes("corpus()"));
}

async function testResetClearsState() {
  mockRequestCompletion(async () => [
    { label: "clear", kind: "namespace" as const },
  ]);
  const c = new TabCompletion();
  await c.update("cl", 2, true);
  c.ghostText();
  c.reset();
  assert.strictEqual(c.matchCount, 0);
  assert.strictEqual(c.ghostText(), "");
}

async function testHandleTabCyclesMultiMatch() {
  mockRequestCompletion(async () => [
    { label: "read", kind: "method" as const },
    { label: "reset", kind: "method" as const },
  ]);
  const c = new TabCompletion();
  await c.update("sn.re", 5, true);
  const action1 = c.handleTab();
  assert.ok(action1?.kind === "redraw");
  const action2 = c.handleTab();
  assert.ok(action2?.kind === "redraw");
}

async function testHandleEnterAcceptsSelected() {
  mockRequestCompletion(async () => [
    { label: "read", kind: "method" as const },
    { label: "reset", kind: "method" as const },
  ]);
  const c = new TabCompletion();
  await c.update("sn.re", 5, true);
  const action = c.handleEnter();
  assert.ok(action && action.kind === "accept");
  if (action?.kind === "accept") {
    // Default selected index is 0 = "read"
    assert.strictEqual(action.newBuffer, "sn.read()");
  }
}

async function testDotCompletionAcceptInsertsSuffix() {
  mockRequestCompletion(async () => [
    { label: "read", kind: "method" as const },
  ]);
  const c = new TabCompletion();
  await c.update("sn.", 3, true);
  assert.strictEqual(c.matchCount, 1);
  const action = c.handleTab();
  assert.ok(action && action.kind === "accept");
  if (action?.kind === "accept") {
    assert.strictEqual(action.newBuffer, "sn.read()");
  }
}

async function testDotCompletionPartialAccept() {
  mockRequestCompletion(async () => [
    { label: "read", kind: "method" as const },
  ]);
  const c = new TabCompletion();
  await c.update("sn.re", 5, true);
  const action = c.handleTab();
  assert.ok(action && action.kind === "accept");
  if (action?.kind === "accept") {
    assert.strictEqual(action.newBuffer, "sn.read()");
  }
}

async function testFilePathCompletionNoSuffix() {
  mockRequestCompletion(async () => [
    { label: "kick.wav", kind: "filePath" as const },
  ]);
  const c = new TabCompletion();
  await c.update('sn.read("kick', 13, true);
  assert.strictEqual(c.matchCount, 1);
  const action = c.handleTab();
  assert.ok(action && action.kind === "accept");
  if (action?.kind === "accept") {
    assert.strictEqual(action.newBuffer, 'sn.read("kick.wav');
  }
}

async function testFilePathNestedCompletionMultiMatch() {
  mockRequestCompletion(async () => [
    { label: "loop.wav", kind: "filePath" as const },
    { label: "loop.flac", kind: "filePath" as const },
  ]);
  const c = new TabCompletion();
  await c.update('vis.waveform(sn.read("loop', 26, true);
  assert.strictEqual(c.matchCount, 2);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("loop.wav"));
  assert.ok(ghost.includes("loop.flac"));
}

async function testSampleHashCompletionDetail() {
  mockRequestCompletion(async () => [
    { label: "a1b2c3d4", kind: "sampleHash" as const, detail: "kick.wav" },
    { label: "a1b2e5f6", kind: "sampleHash" as const, detail: "snare.wav" },
  ]);
  const c = new TabCompletion();
  await c.update('sn.load("a1b2', 13, true);
  assert.strictEqual(c.matchCount, 2);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("a1b2c3d4"));
  assert.ok(ghost.includes("kick.wav"));
}

async function testSampleHashAcceptInsertsHash() {
  mockRequestCompletion(async () => [
    { label: "a1b2c3d4", kind: "sampleHash" as const, detail: "kick.wav" },
  ]);
  const c = new TabCompletion();
  await c.update('sn.load("a1b2', 13, true);
  const action = c.handleTab();
  assert.ok(action && action.kind === "accept");
  if (action?.kind === "accept") {
    assert.strictEqual(action.newBuffer, 'sn.load("a1b2c3d4');
  }
}

async function testVariableKindNoSuffix() {
  mockRequestCompletion(async () => [
    { label: "myVar", kind: "variable" as const },
  ]);
  const c = new TabCompletion();
  await c.update("myV", 3, true);
  const action = c.handleTab();
  assert.ok(action && action.kind === "accept");
  if (action?.kind === "accept") {
    assert.strictEqual(action.newBuffer, "myVar");
  }
}

async function testInsertTextOverridesLabel() {
  mockRequestCompletion(async () => [
    { label: "sampleNamespace", insertText: "sn", kind: "namespace" as const },
  ]);
  const c = new TabCompletion();
  await c.update("sa", 2, true);
  const action = c.handleTab();
  assert.ok(action && action.kind === "accept");
  if (action?.kind === "accept") {
    assert.strictEqual(action.newBuffer, "sn()");
  }
}

async function testHandleTabNullWhenNoMatches() {
  mockRequestCompletion(async () => []);
  const c = new TabCompletion();
  await c.update("zzz", 3, true);
  assert.strictEqual(c.handleTab(), null);
}

async function testHandleUpNullWhenSingleMatch() {
  mockRequestCompletion(async () => [
    { label: "sn", kind: "namespace" as const },
  ]);
  const c = new TabCompletion();
  await c.update("sn", 2, true);
  assert.strictEqual(c.handleUp(), null);
}

async function testHandleUpCyclesMultiMatch() {
  mockRequestCompletion(async () => [
    { label: "read", kind: "method" as const },
    { label: "reset", kind: "method" as const },
  ]);
  const c = new TabCompletion();
  await c.update("sn.re", 5, true);
  const action = c.handleUp();
  assert.ok(action?.kind === "redraw");
}

async function testHandleDownCyclesMultiMatch() {
  mockRequestCompletion(async () => [
    { label: "read", kind: "method" as const },
    { label: "reset", kind: "method" as const },
  ]);
  const c = new TabCompletion();
  await c.update("sn.re", 5, true);
  const action = c.handleDown();
  assert.ok(action?.kind === "redraw");
}

async function testSetApiIsNoOp() {
  const c = new TabCompletion();
  assert.doesNotThrow(() => c.setApi({ sn: {} }));
}

async function testSetBindingsProviderIsNoOp() {
  const c = new TabCompletion();
  assert.doesNotThrow(() => c.setBindingsProvider(() => ({})));
}

async function testOnMatchesChangedCallbackFires() {
  mockRequestCompletion(async () => [
    { label: "sn", kind: "namespace" as const },
  ]);
  const c = new TabCompletion();
  let called = false;
  c.setOnMatchesChanged(() => {
    called = true;
  });
  await c.update("sn", 2, true);
  assert.ok(called, "onMatchesChanged callback should have been called");
}

async function testEraseGhostTextClearsLines() {
  mockRequestCompletion(async () => [
    { label: "read", kind: "method" as const },
    { label: "reset", kind: "method" as const },
  ]);
  const c = new TabCompletion();
  await c.update("sn.re", 5, true);
  c.ghostText(); // renders multi-match, sets ghostLines = 2
  const erased = c.eraseGhostText();
  // Should contain 2 line-clear sequences
  assert.ok(erased.includes("\x1b[2K"));
}

// ── Tests ──────────────────────────────────────────────────────────────────

// Restore global window after all tests to prevent cross-suite pollution.
afterAll(() => { delete (globalThis as Record<string, unknown>).window; });

test("idle on empty buffer", testIdleOnEmptyBuffer);
test("no requestCompletion yields no matches", testNoRequestCompletionYieldsNoMatches);
test("single match namespace", testSingleMatchNamespace);
test("multi match", testMultiMatch);
test("ghostText single match contains suffix", testGhostTextSingleMatchContainsSuffix);
test("ghostText multi match contains candidates", testGhostTextMultiMatchContainsCandidates);
test("reset clears state", testResetClearsState);
test("handleTab cycles multi match", testHandleTabCyclesMultiMatch);
test("handleEnter accepts selected", testHandleEnterAcceptsSelected);
test("dot completion accept inserts suffix", testDotCompletionAcceptInsertsSuffix);
test("dot completion partial accept", testDotCompletionPartialAccept);
test("file path completion no suffix", testFilePathCompletionNoSuffix);
test("file path nested completion multi match", testFilePathNestedCompletionMultiMatch);
test("sample hash completion detail", testSampleHashCompletionDetail);
test("sample hash accept inserts hash", testSampleHashAcceptInsertsHash);
test("variable kind no suffix", testVariableKindNoSuffix);
test("insertText overrides label", testInsertTextOverridesLabel);
test("handleTab null when no matches", testHandleTabNullWhenNoMatches);
test("handleUp null when single match", testHandleUpNullWhenSingleMatch);
test("handleUp cycles multi match", testHandleUpCyclesMultiMatch);
test("handleDown cycles multi match", testHandleDownCyclesMultiMatch);
test("setApi is no-op", testSetApiIsNoOp);
test("setBindingsProvider is no-op", testSetBindingsProviderIsNoOp);
test("onMatchesChanged callback fires", testOnMatchesChangedCallbackFires);
test("eraseGhostText clears lines", testEraseGhostTextClearsLines);
