import * as assert from "assert";
import { TabCompletion } from "./renderer/tab-completion.js";

type TestWindow = Window & {
  electron: Window["electron"] & {
    fsCompletePath: (method: "ls" | "la" | "cd" | "walk", inputPath: string) => Promise<string[]>;
  };
};

function mockFsCompletePath(
  fn: (method: "ls" | "la" | "cd" | "walk", inputPath: string) => Promise<string[]>,
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
  await c.update("vi", 2);
  assert.strictEqual(c.matchCount, 3);
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

async function testGhostTextSingleMatchContainsSuffix() {
  const c = new TabCompletion();
  await c.update("sn", 2);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("()"));
  assert.ok(ghost.includes("\x1b[90m"));
}

async function testGhostTextMultiMatchContainsCandidates() {
  const c = new TabCompletion();
  await c.update("vi", 2);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("vis()"));
  assert.ok(ghost.includes("visualizeNmf()"));
  assert.ok(ghost.includes("visualizeNx()"));
}

async function testResetClearsState() {
  const c = new TabCompletion();
  await c.update("vi", 2);
  c.ghostText();
  c.reset();
  assert.strictEqual(c.matchCount, 0);
  assert.strictEqual(c.ghostText(), "");
}

async function testDotCompletionUsesPrototypeMethods() {
  class SampleNamespaceStub {
    help() {}
    read(_path: string) {}
    list() {}
    current() {}
    stop() {}
  }

  const c = new TabCompletion();
  c.setApi({ sn: new SampleNamespaceStub() });
  await c.update("sn.", 3);
  assert.strictEqual(c.matchCount, 5);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("read()"));
  assert.ok(ghost.includes("help()"));
  assert.ok(ghost.includes("stop()"));
}

async function testDotCompletionPartialPrototypeMethod() {
  class SampleNamespaceStub {
    help() {}
    read(_path: string) {}
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

const tests: Array<[string, () => Promise<void>]> = [
  ["idle on empty buffer", testIdleOnEmptyBuffer],
  ["single match namespace", testSingleMatchNamespace],
  ["multi match visualize", testMultiMatchVisualize],
  ["single match project namespace", testSingleMatchProjectNamespace],
  ["ghostText single match contains suffix", testGhostTextSingleMatchContainsSuffix],
  ["ghostText multi match contains candidates", testGhostTextMultiMatchContainsCandidates],
  ["reset clears state", testResetClearsState],
  ["dot completion uses prototype methods", testDotCompletionUsesPrototypeMethods],
  ["dot completion partial prototype method", testDotCompletionPartialPrototypeMethod],
  ["dot completion uses scope variable bindings", testDotCompletionUsesScopeVariableBindings],
  ["dot completion uses merged bindings", testDotCompletionPrefersMergedBindingsOverStaticApiOnly],
  ["fs completion still scoped", testFsCompletionStillScoped],
  ["project dot completion", testProjectDotCompletion],
  ["path completion scopes to fs string", testPathCompletionScopesToFsString],
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
