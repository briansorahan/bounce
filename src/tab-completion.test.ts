import * as assert from "assert";
import { TabCompletion } from "./renderer/tab-completion.js";

type TestWindow = Window & {
  electron: Window["electron"] & {
    fsCompletePath: (method: "ls" | "la" | "cd" | "walk", inputPath: string) => Promise<string[]>;
  };
};

const testGlobal = globalThis as typeof globalThis & { window?: TestWindow };

function mockFsCompletePath(
  fn: (method: "ls" | "la" | "cd" | "walk", inputPath: string) => Promise<string[]>,
): void {
  testGlobal.window = {
    ...(testGlobal.window ?? ({} as TestWindow)),
    electron: {
      ...(testGlobal.window?.electron ?? ({} as TestWindow["electron"])),
      fsCompletePath: fn,
    },
  } as TestWindow;
}

// ---------------------------------------------------------------------------
// update() — state transitions
// ---------------------------------------------------------------------------

async function testIdleOnEmptyBuffer() {
  const c = new TabCompletion();
  await c.update("", 0);
  assert.strictEqual(c.matchCount, 0);
}

async function testIdleOnNoMatch() {
  const c = new TabCompletion();
  await c.update("xyz", 3);
  assert.strictEqual(c.matchCount, 0);
}

async function testSingleMatchDisplay() {
  const c = new TabCompletion();
  await c.update("dis", 3);
  assert.strictEqual(c.matchCount, 1);
}

async function testMultiMatchAnalyze() {
  const c = new TabCompletion();
  await c.update("an", 2);
  assert.strictEqual(c.matchCount, 3);
}

async function testAllMatchOnSingleChar() {
  const c = new TabCompletion();
  await c.update("p", 1);
  assert.ok(c.matchCount >= 3, `expected >=3 matches for "p", got ${c.matchCount}`);
}

async function testNoCompletionWhenCursorNotAtEnd() {
  const c = new TabCompletion();
  await c.update("display", 2);
  assert.strictEqual(c.matchCount, 0);
}

async function testNoCompletionAfterOpenParen() {
  const c = new TabCompletion();
  await c.update("display(", 8);
  assert.strictEqual(c.matchCount, 0);
}

// ---------------------------------------------------------------------------
// handleTab() actions
// ---------------------------------------------------------------------------

async function testHandleTabSingleMatchReturnsAccept() {
  const c = new TabCompletion();
  await c.update("dis", 3);
  const action = c.handleTab();
  assert.ok(action !== null);
  assert.strictEqual(action!.kind, "accept");
  if (action!.kind === "accept") {
    assert.strictEqual(action.newBuffer, "display()");
    assert.strictEqual(action.newCursorPosition, 8);
  }
}

async function testHandleTabMultiMatchReturnsRedrawAndCycles() {
  const c = new TabCompletion();
  await c.update("an", 2);
  const action1 = c.handleTab();
  assert.ok(action1 !== null);
  assert.strictEqual(action1!.kind, "redraw");
  const action2 = c.handleTab();
  assert.strictEqual(action2!.kind, "redraw");
}

async function testHandleTabContinuesCyclingAfterRefresh() {
  const c = new TabCompletion();
  await c.update("an", 2);
  c.handleTab(); // selectedIndex -> 1
  await c.update("an", 2); // simulate app refresh before next Tab
  c.handleTab(); // should advance to 2, not reset back to 1
  const action = c.handleEnter();
  assert.ok(action !== null);
  assert.strictEqual(action!.kind, "accept");
  if (action!.kind === "accept") {
    assert.strictEqual(action.newBuffer, "analyzeNmf()");
    assert.strictEqual(action.newCursorPosition, 11);
  }
}

async function testHandleUpCyclesBackwardThroughMatches() {
  const c = new TabCompletion();
  await c.update("an", 2);
  const action = c.handleUp();
  assert.ok(action !== null);
  assert.strictEqual(action!.kind, "redraw");
  const accept = c.handleEnter();
  assert.ok(accept !== null && accept.kind === "accept");
  if (accept!.kind === "accept") {
    assert.strictEqual(accept.newBuffer, "analyzeNmf()");
    assert.strictEqual(accept.newCursorPosition, 11);
  }
}

async function testHandleDownCyclesForwardThroughMatches() {
  const c = new TabCompletion();
  await c.update("an", 2);
  const action = c.handleDown();
  assert.ok(action !== null);
  assert.strictEqual(action!.kind, "redraw");
  const accept = c.handleEnter();
  assert.ok(accept !== null && accept.kind === "accept");
  if (accept!.kind === "accept") {
    assert.strictEqual(accept.newBuffer, "analyzeMFCC()");
    assert.strictEqual(accept.newCursorPosition, 12);
  }
}

async function testHandleTabIdleReturnsNull() {
  const c = new TabCompletion();
  await c.update("xyz", 3);
  const action = c.handleTab();
  assert.strictEqual(action, null);
}

// ---------------------------------------------------------------------------
// handleEnter() actions
// ---------------------------------------------------------------------------

async function testHandleEnterMultiMatchReturnsAccept() {
  const c = new TabCompletion();
  await c.update("an", 2);
  const action = c.handleEnter();
  assert.ok(action !== null);
  assert.strictEqual(action!.kind, "accept");
  if (action!.kind === "accept") {
    assert.strictEqual(action.newBuffer, "analyze()");
    assert.strictEqual(action.newCursorPosition, 8);
  }
}

async function testHandleEnterMultiMatchAfterTabCycle() {
  const c = new TabCompletion();
  await c.update("an", 2);
  c.handleTab();
  const action = c.handleEnter();
  assert.ok(action !== null);
  assert.strictEqual(action!.kind, "accept");
  if (action!.kind === "accept") {
    assert.strictEqual(action.newBuffer, "analyzeMFCC()");
    assert.strictEqual(action.newCursorPosition, 12);
  }
}

async function testHandleEnterSingleMatchReturnsNull() {
  const c = new TabCompletion();
  await c.update("dis", 3);
  const action = c.handleEnter();
  assert.strictEqual(action, null);
}

async function testHandleEnterIdleReturnsNull() {
  const c = new TabCompletion();
  await c.update("", 0);
  const action = c.handleEnter();
  assert.strictEqual(action, null);
}

// ---------------------------------------------------------------------------
// ghostText() ANSI output
// ---------------------------------------------------------------------------

async function testGhostTextEmptyOnIdle() {
  const c = new TabCompletion();
  await c.update("xyz", 3);
  assert.strictEqual(c.ghostText(), "");
}

async function testGhostTextSingleMatchContainsDimSuffix() {
  const c = new TabCompletion();
  await c.update("dis", 3);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("\x1b[90m"), "expected dim ANSI code");
  assert.ok(ghost.includes("play()"), "expected suffix 'play()'");
  assert.ok(ghost.includes("\x1b7"), "expected \\x1b7 save cursor");
  assert.ok(ghost.includes("\x1b8"), "expected \\x1b8 restore cursor");
}

async function testGhostTextMultiMatchContainsBothCandidates() {
  const c = new TabCompletion();
  await c.update("an", 2);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("analyze()"), "expected analyze()");
  assert.ok(ghost.includes("analyzeNmf()"), "expected analyzeNmf()");
  assert.ok(ghost.includes("\x1b7"), "expected \\x1b7 save cursor");
  assert.ok(ghost.includes("\x1b8"), "expected \\x1b8 restore cursor");
}

async function testGhostTextMultiMatchHighlightsSelected() {
  const c = new TabCompletion();
  await c.update("an", 2);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("\x1b[1;36m"), "expected bright cyan for selected");
  assert.ok(ghost.includes("\x1b[90m"), "expected dim for unselected");
}

async function testGhostTextUpdatesAfterTabCycle() {
  const c = new TabCompletion();
  await c.update("an", 2);
  c.handleTab();
  const ghost = c.ghostText();
  const analyzeNmfIdx = ghost.indexOf("analyzeNmf()");
  const analyzeIdx = ghost.indexOf("analyze()");
  const cyanIdx = ghost.lastIndexOf("\x1b[1;36m", analyzeNmfIdx);
  assert.ok(cyanIdx !== -1 && cyanIdx < analyzeNmfIdx, "analyzeNmf should be highlighted");
  const dimBeforeAnalyze = ghost.lastIndexOf("\x1b[90m", analyzeIdx);
  assert.ok(dimBeforeAnalyze !== -1 && dimBeforeAnalyze < analyzeIdx, "analyze should be dim");
}

// ---------------------------------------------------------------------------
// eraseGhostText()
// ---------------------------------------------------------------------------

async function testEraseGhostTextEmptyWhenNoGhostLines() {
  const c = new TabCompletion();
  await c.update("dis", 3);
  c.ghostText();
  assert.strictEqual(c.eraseGhostText(), "", "inline ghost has no erase sequence");
}

async function testEraseGhostTextHasCorrectLineCountForMultiMatch() {
  const c = new TabCompletion();
  await c.update("an", 2);
  c.ghostText();
  const erase = c.eraseGhostText();
  const count = (erase.match(/\r\n\x1b\[2K/g) || []).length;
  assert.strictEqual(count, 3);
  assert.ok(erase.includes("\x1b7"));
  assert.ok(erase.includes("\x1b8"));
}

async function testEraseGhostTextResetsGhostLines() {
  const c = new TabCompletion();
  await c.update("an", 2);
  c.ghostText();
  c.eraseGhostText();
  assert.strictEqual(c.eraseGhostText(), "");
}

// ---------------------------------------------------------------------------
// reset()
// ---------------------------------------------------------------------------

async function testResetClearsAllState() {
  const c = new TabCompletion();
  await c.update("an", 2);
  c.ghostText();
  c.reset();
  assert.strictEqual(c.matchCount, 0);
  assert.strictEqual(c.ghostText(), "");
  assert.strictEqual(c.eraseGhostText(), "");
  assert.strictEqual(c.handleTab(), null);
  assert.strictEqual(c.handleEnter(), null);
}

// ---------------------------------------------------------------------------
// Acceptance inserts correctly when buffer has prior content
// ---------------------------------------------------------------------------

async function testAcceptWithPriorBufferContent() {
  const c = new TabCompletion();
  await c.update("foo; dis", 8);
  const action = c.handleTab();
  assert.ok(action !== null && action.kind === "accept");
  if (action!.kind === "accept") {
    assert.strictEqual(action.newBuffer, "foo; display()");
    assert.strictEqual(action.newCursorPosition, 13);
  }
}

// ---------------------------------------------------------------------------
// Dot-completion (method completions via setApi)
// ---------------------------------------------------------------------------

async function testDotCompletionAllMethodsOnDot() {
  const c = new TabCompletion();
  const fakeDisplay = Object.assign(() => {}, { hide: () => {}, help: () => {} });
  c.setApi({ display: fakeDisplay });
  await c.update("display.", 8);
  assert.strictEqual(c.matchCount, 2, "should match both methods");
}

async function testDotCompletionPartialMethod() {
  const c = new TabCompletion();
  const fakeDisplay = Object.assign(() => {}, { hide: () => {}, help: () => {} });
  c.setApi({ display: fakeDisplay });
  await c.update("display.hi", 10);
  assert.strictEqual(c.matchCount, 1, "should match only 'hide'");
}

async function testDotCompletionAcceptsMethod() {
  const c = new TabCompletion();
  const fakeDisplay = Object.assign(() => {}, { hide: () => {}, help: () => {} });
  c.setApi({ display: fakeDisplay });
  await c.update("display.hi", 10);
  const action = c.handleTab();
  assert.ok(action !== null && action.kind === "accept");
  if (action!.kind === "accept") {
    assert.strictEqual(action.newBuffer, "display.hide()");
    assert.strictEqual(action.newCursorPosition, 13);
  }
}

async function testDotCompletionAcceptsMethodWithNoPrefixAfterDot() {
  const c = new TabCompletion();
  const fakeDisplay = Object.assign(() => {}, { hide: () => {} });
  c.setApi({ display: fakeDisplay });
  await c.update("display.", 8);
  const action = c.handleTab();
  assert.ok(action !== null && action.kind === "accept");
  if (action!.kind === "accept") {
    assert.strictEqual(action.newBuffer, "display.hide()");
    assert.strictEqual(action.newCursorPosition, 13);
  }
}

async function testDotCompletionNoMatchForUnknownObject() {
  const c = new TabCompletion();
  c.setApi({});
  await c.update("foo.", 4);
  assert.strictEqual(c.matchCount, 0);
}

async function testDotCompletionGhostTextShowsSuffix() {
  const c = new TabCompletion();
  const fakeDisplay = Object.assign(() => {}, { hide: () => {} });
  c.setApi({ display: fakeDisplay });
  await c.update("display.hi", 10);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("de()"), "ghost should show 'de()' suffix for 'hide'");
}

async function testDotCompletionScopesPlainObjectMethods() {
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
  assert.strictEqual(c.matchCount, 7, "should only match callable fs members");
  const ghost = c.ghostText();
  assert.ok(!ghost.includes("granularize()"), "should not fall back to top-level globals");
  assert.ok(ghost.includes("ls()"), "should include fs methods");
}

async function testDotCompletionScopesPlainObjectPartialMethod() {
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
  await c.update("fs.gl", 5);
  assert.strictEqual(c.matchCount, 1, "should match only 'glob'");
  const action = c.handleTab();
  assert.ok(action !== null && action.kind === "accept");
  if (action!.kind === "accept") {
    assert.strictEqual(action.newBuffer, "fs.glob()");
    assert.strictEqual(action.newCursorPosition, 8);
  }
}

// ---------------------------------------------------------------------------
// Path completion inside quoted fs strings
// ---------------------------------------------------------------------------

async function testPathCompletionScopesToFsLsString() {
  mockFsCompletePath(async (method, inputPath) => {
    assert.strictEqual(method, "ls");
    assert.strictEqual(inputPath, "Insyn");
    return ["Insync/"];
  });

  const c = new TabCompletion();
  await c.update('fs.ls("Insyn', 12);
  assert.strictEqual(c.matchCount, 1, "should use fs path completion inside quoted strings");
  const ghost = c.ghostText();
  assert.ok(ghost.includes("c/"), "ghost should show only the remaining path suffix");
}

async function testPathCompletionAcceptsDirectoryWithoutParens() {
  mockFsCompletePath(async () => ["Insync/"]);

  const c = new TabCompletion();
  await c.update('fs.cd("Insyn', 12);
  const action = c.handleTab();
  assert.ok(action !== null && action.kind === "accept");
  if (action!.kind === "accept") {
    assert.strictEqual(action.newBuffer, 'fs.cd("Insync/');
    assert.strictEqual(action.newCursorPosition, 14);
  }
}

async function testPathCompletionMultiMatchRendersPlainPaths() {
  mockFsCompletePath(async () => ["alpha/", "alpine/"]);

  const c = new TabCompletion();
  await c.update('fs.walk("al', 11);
  assert.strictEqual(c.matchCount, 2);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("alpha/"), "should show plain path matches");
  assert.ok(!ghost.includes("alpha/()"), "path matches should not render function parens");
}

const tests: Array<[string, () => Promise<void>]> = [
  ["idle on empty buffer", testIdleOnEmptyBuffer],
  ["idle on no match", testIdleOnNoMatch],
  ["single match: display", testSingleMatchDisplay],
  ["multi match: analyze*", testMultiMatchAnalyze],
  ["all match on single char 'p'", testAllMatchOnSingleChar],
  ["no completion when cursor not at end", testNoCompletionWhenCursorNotAtEnd],
  ["no completion after open paren", testNoCompletionAfterOpenParen],
  ["handleTab single match returns accept", testHandleTabSingleMatchReturnsAccept],
  ["handleTab multi match returns redraw and cycles", testHandleTabMultiMatchReturnsRedrawAndCycles],
  ["handleTab keeps cycling after refresh", testHandleTabContinuesCyclingAfterRefresh],
  ["handleUp cycles backward through matches", testHandleUpCyclesBackwardThroughMatches],
  ["handleDown cycles forward through matches", testHandleDownCyclesForwardThroughMatches],
  ["handleTab idle returns null", testHandleTabIdleReturnsNull],
  ["handleEnter multi match returns accept", testHandleEnterMultiMatchReturnsAccept],
  ["handleEnter multi match after Tab cycle", testHandleEnterMultiMatchAfterTabCycle],
  ["handleEnter single match returns null", testHandleEnterSingleMatchReturnsNull],
  ["handleEnter idle returns null", testHandleEnterIdleReturnsNull],
  ["ghostText empty on idle", testGhostTextEmptyOnIdle],
  ["ghostText single match contains dim suffix", testGhostTextSingleMatchContainsDimSuffix],
  ["ghostText multi match contains both candidates", testGhostTextMultiMatchContainsBothCandidates],
  ["ghostText multi match highlights selected", testGhostTextMultiMatchHighlightsSelected],
  ["ghostText updates after Tab cycle", testGhostTextUpdatesAfterTabCycle],
  ["eraseGhostText empty when no ghost lines", testEraseGhostTextEmptyWhenNoGhostLines],
  ["eraseGhostText has correct line count for multi match", testEraseGhostTextHasCorrectLineCountForMultiMatch],
  ["eraseGhostText resets ghostLines", testEraseGhostTextResetsGhostLines],
  ["reset clears all state", testResetClearsAllState],
  ["accept with prior buffer content", testAcceptWithPriorBufferContent],
  ["dot-completion: all methods on bare dot", testDotCompletionAllMethodsOnDot],
  ["dot-completion: partial method prefix", testDotCompletionPartialMethod],
  ["dot-completion: accept inserts method call", testDotCompletionAcceptsMethod],
  ["dot-completion: accept with no prefix after dot", testDotCompletionAcceptsMethodWithNoPrefixAfterDot],
  ["dot-completion: no match for unknown object", testDotCompletionNoMatchForUnknownObject],
  ["dot-completion: ghost text shows suffix", testDotCompletionGhostTextShowsSuffix],
  ["dot-completion: plain object methods stay scoped", testDotCompletionScopesPlainObjectMethods],
  ["dot-completion: plain object partial prefix", testDotCompletionScopesPlainObjectPartialMethod],
  ["path-completion: fs.ls string stays scoped", testPathCompletionScopesToFsLsString],
  ["path-completion: accept inserts plain directory", testPathCompletionAcceptsDirectoryWithoutParens],
  ["path-completion: multi-match renders plain paths", testPathCompletionMultiMatchRendersPlainPaths],
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

  process.exit(0);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
