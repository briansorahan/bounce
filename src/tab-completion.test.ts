import * as assert from "assert";
import { TabCompletion } from "./renderer/tab-completion.js";
import type { SampleHashCompletion } from "./shared/ipc-contract.js";

type TestWindow = Window & {
  electron: Window["electron"] & {
    fsCompletePath: (method: "ls" | "la" | "cd" | "walk" | "read", inputPath: string) => Promise<string[]>;
    completeSampleHash: (prefix: string) => Promise<SampleHashCompletion[]>;
  };
};

function mockFsCompletePath(
  fn: (method: "ls" | "la" | "cd" | "walk" | "read", inputPath: string) => Promise<string[]>,
): void {
  const currentWindow = (globalThis as { window?: { electron?: Partial<TestWindow["electron"]> } }).window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      ...(currentWindow ?? {}),
      electron: {
        ...(currentWindow?.electron ?? {}),
        fsCompletePath: fn,
      },
    },
  });
}

function mockCompleteSampleHash(
  fn: (prefix: string) => Promise<SampleHashCompletion[]>,
): void {
  const currentWindow = (globalThis as { window?: { electron?: Partial<TestWindow["electron"]> } }).window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      ...(currentWindow ?? {}),
      electron: {
        ...(currentWindow?.electron ?? {}),
        completeSampleHash: fn,
      },
    },
  });
}

async function testIdleOnEmptyBuffer() {
  const c = new TabCompletion();
  await c.update("", 0);
  assert.strictEqual(c.matchCount, 0);
}

async function testSingleMatchNamespace() {
  const c = new TabCompletion();
  await c.update("sn", 2);
  assert.strictEqual(c.matchCount, 1);
  const action = c.handleTab();
  assert.ok(action && action.kind === "accept");
  if (action?.kind === "accept") {
    assert.strictEqual(action.newBuffer, "sn()");
  }
}

async function testMultiMatchVisualize() {
  const c = new TabCompletion();
  await c.update("c", 1);
  assert.strictEqual(c.matchCount, 2);
}

async function testSingleMatchProjectNamespace() {
  const c = new TabCompletion();
  await c.update("pr", 2);
  assert.strictEqual(c.matchCount, 1);
  const action = c.handleTab();
  assert.ok(action && action.kind === "accept");
  if (action?.kind === "accept") {
    assert.strictEqual(action.newBuffer, "proj()");
  }
}

async function testSingleMatchEnvNamespace() {
  const c = new TabCompletion();
  await c.update("en", 2);
  assert.strictEqual(c.matchCount, 1);
  const action = c.handleTab();
  assert.ok(action && action.kind === "accept");
  if (action?.kind === "accept") {
    assert.strictEqual(action.newBuffer, "env()");
  }
}

async function testGhostTextSingleMatchContainsSuffix() {
  const c = new TabCompletion();
  await c.update("sn", 2);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("()"));
  assert.ok(ghost.includes("\x1b[90m"));
}

async function testGhostTextMultiMatchContainsCandidates() {
  const c = new TabCompletion();
  await c.update("c", 1);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("clear()"));
  assert.ok(ghost.includes("corpus()"));
}

async function testResetClearsState() {
  const c = new TabCompletion();
  await c.update("cl", 2);
  c.ghostText();
  c.reset();
  assert.strictEqual(c.matchCount, 0);
  assert.strictEqual(c.ghostText(), "");
}

async function testDotCompletionUsesPrototypeMethods() {
  class SampleNamespaceStub {
    help() {}
    read(_path: string) {}
    load(_hash: string) {}
    list() {}
    current() {}
    stop() {}
  }

  const c = new TabCompletion();
  c.setApi({ sn: new SampleNamespaceStub() });
  await c.update("sn.", 3);
  assert.strictEqual(c.matchCount, 6);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("read()"));
  assert.ok(ghost.includes("load()"));
  assert.ok(ghost.includes("help()"));
  assert.ok(ghost.includes("stop()"));
}

async function testDotCompletionPartialPrototypeMethod() {
  class SampleNamespaceStub {
    help() {}
    read(_path: string) {}
    load(_hash: string) {}
    list() {}
    current() {}
    stop() {}
  }

  const c = new TabCompletion();
  c.setApi({ sn: new SampleNamespaceStub() });
  await c.update("sn.re", 5);
  assert.strictEqual(c.matchCount, 1);
  const action = c.handleTab();
  assert.ok(action && action.kind === "accept");
  if (action?.kind === "accept") {
    assert.strictEqual(action.newBuffer, "sn.read()");
  }
}

async function testDotCompletionUsesScopeVariableBindings() {
  class SampleStub {
    help() {}
    play() {}
    display() {}
    onsets() {}
  }

  const c = new TabCompletion();
  c.setBindingsProvider(() => ({
    contact_mic_on_plate: new SampleStub(),
  }));
  await c.update("contact_mic_on_plate.pl", 23);
  assert.strictEqual(c.matchCount, 1);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("ay()"));
  const action = c.handleTab();
  assert.ok(action && action.kind === "accept");
  if (action?.kind === "accept") {
    assert.strictEqual(action.newBuffer, "contact_mic_on_plate.play()");
  }
}

async function testDotCompletionPrefersMergedBindingsOverStaticApiOnly() {
  class SampleStub {
    play() {}
  }

  const c = new TabCompletion();
  c.setApi({ sn: { help() {} } });
  c.setBindingsProvider(() => ({
    sn: { help() {} },
    sample_with_underscore: new SampleStub(),
  }));
  await c.update("sample_with_underscore.", 23);
  assert.strictEqual(c.matchCount, 1);
  assert.ok(c.ghostText().includes("play()"));
}

async function testFsCompletionStillScoped() {
  const c = new TabCompletion();
  c.setApi({
    fs: {
      FileType: { File: "file" },
      help: () => {},
      ls: () => {},
      la: () => {},
      cd: () => {},
      pwd: () => {},
      glob: () => {},
      walk: () => {},
    },
  });
  await c.update("fs.", 3);
  assert.strictEqual(c.matchCount, 7);
}

async function testProjectDotCompletion() {
  class ProjectNamespaceStub {
    help() {}
    current() {}
    list() {}
    load(_name: string) {}
    rm(_name: string) {}
  }

  const c = new TabCompletion();
  c.setApi({ proj: new ProjectNamespaceStub() });
  await c.update("proj.", 5);
  assert.strictEqual(c.matchCount, 5);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("current()"));
  assert.ok(ghost.includes("load()"));
}

async function testEnvDotCompletion() {
  const c = new TabCompletion();
  c.setApi({
    env: {
      help() {},
      vars() {},
      globals() {},
      inspect(_value: unknown) {},
      functions(_value: unknown) {},
    },
  });
  await c.update("env.", 4);
  assert.strictEqual(c.matchCount, 5);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("vars()"));
  assert.ok(ghost.includes("inspect()"));
}

async function testPathCompletionScopesToFsString() {
  mockFsCompletePath(async (method, inputPath) => {
    assert.strictEqual(method, "ls");
    assert.strictEqual(inputPath, "Insyn");
    return ["Insync/"];
  });

  const c = new TabCompletion();
  await c.update('fs.ls("Insyn', 12);
  assert.strictEqual(c.matchCount, 1);
}

async function testClearDebugHiddenFromGlobalCompletion() {
  const c = new TabCompletion();
  await c.update("clearD", 6);
  assert.strictEqual(c.matchCount, 0);
}

async function testHelpFactoryHiddenFromMethodCompletion() {
  class StubWithHelpFactory {
    help() {}
    read() {}
    private readonly helpFactory = () => {};
  }

  const c = new TabCompletion();
  c.setApi({ sn: new StubWithHelpFactory() });
  await c.update("sn.", 3);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("help()"));
  assert.ok(ghost.includes("read()"));
  assert.ok(!ghost.includes("helpFactory"));
  assert.strictEqual(c.matchCount, 2);
}

async function testToStringHiddenFromMethodCompletion() {
  class StubWithToString {
    help() {}
    play() {}
    toString(): string {
      return "stub";
    }
  }

  const c = new TabCompletion();
  c.setApi({ sn: new StubWithToString() });
  await c.update("sn.", 3);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("help()"));
  assert.ok(ghost.includes("play()"));
  assert.ok(!ghost.includes("toString"));
  assert.strictEqual(c.matchCount, 2);
}

async function testSnReadPathCompletion() {
  mockFsCompletePath(async (method, inputPath) => {
    assert.strictEqual(method, "read");
    assert.strictEqual(inputPath, "kick");
    return ["kick.wav"];
  });

  const c = new TabCompletion();
  await c.update('sn.read("kick', 13);
  assert.strictEqual(c.matchCount, 1);
  const action = c.handleTab();
  assert.ok(action && action.kind === "accept");
  if (action?.kind === "accept") {
    assert.strictEqual(action.newBuffer, 'sn.read("kick.wav');
  }
}

async function testSnReadNestedPathCompletion() {
  mockFsCompletePath(async (method, inputPath) => {
    assert.strictEqual(method, "read");
    assert.strictEqual(inputPath, "loop");
    return ["loop.wav", "loop.flac"];
  });

  const c = new TabCompletion();
  await c.update('vis.waveform(sn.read("loop', 26);
  assert.strictEqual(c.matchCount, 2);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("loop.wav"));
  assert.ok(ghost.includes("loop.flac"));
}

async function testSnLoadHashCompletion() {
  mockCompleteSampleHash(async (prefix) => {
    assert.strictEqual(prefix, "a1b2");
    return [
      { hash: "a1b2c3d4", filePath: "/path/to/kick.wav" },
      { hash: "a1b2e5f6", filePath: "/path/to/snare.wav" },
    ];
  });

  const c = new TabCompletion();
  await c.update('sn.load("a1b2', 13);
  assert.strictEqual(c.matchCount, 2);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("a1b2c3d4 kick.wav"));
  assert.ok(ghost.includes("a1b2e5f6 snare.wav"));
}

async function testSnLoadHashAcceptInsertsOnlyHash() {
  mockCompleteSampleHash(async () => {
    return [{ hash: "a1b2c3d4", filePath: "/path/to/kick.wav" }];
  });

  const c = new TabCompletion();
  await c.update('sn.load("a1b2', 13);
  assert.strictEqual(c.matchCount, 1);
  const action = c.handleTab();
  assert.ok(action && action.kind === "accept");
  if (action?.kind === "accept") {
    assert.strictEqual(action.newBuffer, 'sn.load("a1b2c3d4');
  }
}

async function testSnLoadHashNoFilePath() {
  mockCompleteSampleHash(async () => {
    return [{ hash: "deadbeef", filePath: null }];
  });

  const c = new TabCompletion();
  await c.update('sn.load("dead', 13);
  assert.strictEqual(c.matchCount, 1);
  const ghost = c.ghostText();
  assert.ok(!ghost.includes(" "), "ghost text should not have trailing label for null filePath");
}

const tests: Array<[string, () => Promise<void>]> = [
  ["idle on empty buffer", testIdleOnEmptyBuffer],
  ["single match namespace", testSingleMatchNamespace],
  ["multi match visualize", testMultiMatchVisualize],
  ["single match project namespace", testSingleMatchProjectNamespace],
  ["single match env namespace", testSingleMatchEnvNamespace],
  ["ghostText single match contains suffix", testGhostTextSingleMatchContainsSuffix],
  ["ghostText multi match contains candidates", testGhostTextMultiMatchContainsCandidates],
  ["reset clears state", testResetClearsState],
  ["dot completion uses prototype methods", testDotCompletionUsesPrototypeMethods],
  ["dot completion partial prototype method", testDotCompletionPartialPrototypeMethod],
  ["dot completion uses scope variable bindings", testDotCompletionUsesScopeVariableBindings],
  ["dot completion uses merged bindings", testDotCompletionPrefersMergedBindingsOverStaticApiOnly],
  ["fs completion still scoped", testFsCompletionStillScoped],
  ["project dot completion", testProjectDotCompletion],
  ["env dot completion", testEnvDotCompletion],
  ["path completion scopes to fs string", testPathCompletionScopesToFsString],
  ["sn.read triggers path completion", testSnReadPathCompletion],
  ["sn.read nested in vis.waveform triggers path completion", testSnReadNestedPathCompletion],
  ["sn.load triggers hash completion", testSnLoadHashCompletion],
  ["sn.load accept inserts only hash", testSnLoadHashAcceptInsertsOnlyHash],
  ["sn.load hash completion with null filePath", testSnLoadHashNoFilePath],
  ["clearDebug hidden from global completion", testClearDebugHiddenFromGlobalCompletion],
  ["helpFactory hidden from method completion", testHelpFactoryHiddenFromMethodCompletion],
  ["toString hidden from method completion", testToStringHiddenFromMethodCompletion],
];

async function main() {
  let passed = 0;
  let failed = 0;

  for (const [name, fn] of tests) {
    try {
      await fn();
      passed++;
    } catch (err) {
      failed++;
      console.error(`FAIL: ${name}`);
      console.error(err);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} test(s) failed, ${passed} passed`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
