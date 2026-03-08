import * as assert from "assert";
import { TabCompletion } from "./renderer/tab-completion.js";

// ---------------------------------------------------------------------------
// update() — state transitions
// ---------------------------------------------------------------------------

async function testIdleOnEmptyBuffer() {
  const c = new TabCompletion();
  c.update("", 0);
  assert.strictEqual(c.matchCount, 0);
}

async function testIdleOnNoMatch() {
  const c = new TabCompletion();
  c.update("xyz", 3);
  assert.strictEqual(c.matchCount, 0);
}

async function testSingleMatchDisplay() {
  const c = new TabCompletion();
  c.update("dis", 3);
  assert.strictEqual(c.matchCount, 1);
}

async function testMultiMatchAnalyze() {
  const c = new TabCompletion();
  c.update("an", 2);
  assert.strictEqual(c.matchCount, 3);
}

async function testAllMatchOnSingleChar() {
  // "p" matches play, playComponent, playSlice — at least 3
  const c = new TabCompletion();
  c.update("p", 1);
  assert.ok(c.matchCount >= 3, `expected >=3 matches for "p", got ${c.matchCount}`);
}

async function testNoCompletionWhenCursorNotAtEnd() {
  const c = new TabCompletion();
  // cursor is in the middle of the buffer — should not complete
  c.update("display", 2);
  assert.strictEqual(c.matchCount, 0);
}

async function testNoCompletionAfterOpenParen() {
  const c = new TabCompletion();
  c.update("display(", 8);
  assert.strictEqual(c.matchCount, 0);
}

// ---------------------------------------------------------------------------
// handleTab() actions
// ---------------------------------------------------------------------------

async function testHandleTabSingleMatchReturnsAccept() {
  const c = new TabCompletion();
  c.update("dis", 3);
  const action = c.handleTab();
  assert.ok(action !== null);
  assert.strictEqual(action!.kind, "accept");
  if (action!.kind === "accept") {
    assert.strictEqual(action.newBuffer, "display()");
    assert.strictEqual(action.newCursorPosition, 8); // between parens: "display(" is 8 chars
  }
}

async function testHandleTabMultiMatchReturnsRedrawAndCycles() {
  const c = new TabCompletion();
  c.update("an", 2);
  // First Tab — advances selectedIndex from 0 to 1
  const action1 = c.handleTab();
  assert.ok(action1 !== null);
  assert.strictEqual(action1!.kind, "redraw");
  // Second Tab — wraps back to 0
  const action2 = c.handleTab();
  assert.strictEqual(action2!.kind, "redraw");
}

async function testHandleTabIdleReturnsNull() {
  const c = new TabCompletion();
  c.update("xyz", 3);
  const action = c.handleTab();
  assert.strictEqual(action, null);
}

// ---------------------------------------------------------------------------
// handleEnter() actions
// ---------------------------------------------------------------------------

async function testHandleEnterMultiMatchReturnsAccept() {
  const c = new TabCompletion();
  c.update("an", 2);
  const action = c.handleEnter();
  assert.ok(action !== null);
  assert.strictEqual(action!.kind, "accept");
  if (action!.kind === "accept") {
    // selectedIndex is 0 at first — first sorted match of "an" is "analyze"
    assert.strictEqual(action.newBuffer, "analyze()");
    assert.strictEqual(action.newCursorPosition, 8);
  }
}

async function testHandleEnterMultiMatchAfterTabCycle() {
  const c = new TabCompletion();
  c.update("an", 2);
  c.handleTab(); // advance to index 1 → "analyzeMFCC" (alphabetical: analyze, analyzeMFCC, analyzeNmf)
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
  c.update("dis", 3);
  const action = c.handleEnter();
  assert.strictEqual(action, null);
}

async function testHandleEnterIdleReturnsNull() {
  const c = new TabCompletion();
  c.update("", 0);
  const action = c.handleEnter();
  assert.strictEqual(action, null);
}

// ---------------------------------------------------------------------------
// ghostText() ANSI output
// ---------------------------------------------------------------------------

async function testGhostTextEmptyOnIdle() {
  const c = new TabCompletion();
  c.update("xyz", 3);
  assert.strictEqual(c.ghostText(), "");
}

async function testGhostTextSingleMatchContainsDimSuffix() {
  const c = new TabCompletion();
  c.update("dis", 3);
  const ghost = c.ghostText();
  // Must contain the dim ANSI code and the suffix
  assert.ok(ghost.includes("\x1b[90m"), "expected dim ANSI code");
  assert.ok(ghost.includes("play()"), "expected suffix 'play()'");
  // Must use DEC save/restore cursor
  assert.ok(ghost.includes("\x1b7"), "expected \\x1b7 save cursor");
  assert.ok(ghost.includes("\x1b8"), "expected \\x1b8 restore cursor");
}

async function testGhostTextMultiMatchContainsBothCandidates() {
  const c = new TabCompletion();
  c.update("an", 2);
  const ghost = c.ghostText();
  assert.ok(ghost.includes("analyze()"), "expected analyze()");
  assert.ok(ghost.includes("analyzeNmf()"), "expected analyzeNmf()");
  assert.ok(ghost.includes("\x1b7"), "expected \\x1b7 save cursor");
  assert.ok(ghost.includes("\x1b8"), "expected \\x1b8 restore cursor");
}

async function testGhostTextMultiMatchHighlightsSelected() {
  const c = new TabCompletion();
  c.update("an", 2);
  // selectedIndex = 0 → "analyze" is highlighted (bright cyan)
  const ghost = c.ghostText();
  assert.ok(ghost.includes("\x1b[1;36m"), "expected bright cyan for selected");
  assert.ok(ghost.includes("\x1b[90m"), "expected dim for unselected");
}

async function testGhostTextUpdatesAfterTabCycle() {
  const c = new TabCompletion();
  c.update("an", 2);
  c.handleTab(); // advance to index 1 → analyzeNmf selected
  const ghost = c.ghostText();
  // "analyzeNmf" line should be bright cyan, "analyze" dim
  const analyzeNmfIdx = ghost.indexOf("analyzeNmf()");
  const analyzeIdx = ghost.indexOf("analyze()");
  // analyzeNmf's highlight should precede its text
  const cyanIdx = ghost.lastIndexOf("\x1b[1;36m", analyzeNmfIdx);
  assert.ok(cyanIdx !== -1 && cyanIdx < analyzeNmfIdx, "analyzeNmf should be highlighted");
  // The analyze() line should be dim (not highlighted)
  const dimBeforeAnalyze = ghost.lastIndexOf("\x1b[90m", analyzeIdx);
  assert.ok(dimBeforeAnalyze !== -1 && dimBeforeAnalyze < analyzeIdx, "analyze should be dim");
}

// ---------------------------------------------------------------------------
// eraseGhostText()
// ---------------------------------------------------------------------------

async function testEraseGhostTextEmptyWhenNoGhostLines() {
  const c = new TabCompletion();
  c.update("dis", 3);
  c.ghostText(); // single match — ghostLines stays 0
  assert.strictEqual(c.eraseGhostText(), "", "inline ghost has no erase sequence");
}

async function testEraseGhostTextHasCorrectLineCountForMultiMatch() {
  const c = new TabCompletion();
  c.update("an", 2);
  c.ghostText(); // 3 matches → ghostLines = 3
  const erase = c.eraseGhostText();
  // Should contain three \r\n\x1b[2K sequences
  const count = (erase.match(/\r\n\x1b\[2K/g) || []).length;
  assert.strictEqual(count, 3);
  assert.ok(erase.includes("\x1b7"));
  assert.ok(erase.includes("\x1b8"));
}

async function testEraseGhostTextResetsGhostLines() {
  const c = new TabCompletion();
  c.update("an", 2);
  c.ghostText();
  c.eraseGhostText();
  // After erase, eraseGhostText should return ""
  assert.strictEqual(c.eraseGhostText(), "");
}

// ---------------------------------------------------------------------------
// reset()
// ---------------------------------------------------------------------------

async function testResetClearsAllState() {
  const c = new TabCompletion();
  c.update("an", 2);
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
  // Simulate: user typed "foo; dis" and cursor is at end
  c.update("foo; dis", 8);
  const action = c.handleTab();
  assert.ok(action !== null && action.kind === "accept");
  if (action!.kind === "accept") {
    assert.strictEqual(action.newBuffer, "foo; display()");
    assert.strictEqual(action.newCursorPosition, 13); // "foo; display(" length
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

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
