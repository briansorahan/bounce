import * as assert from "assert";
import {
  isComplete,
  promoteDeclarations,
  getTopLevelVarNames,
  checkReservedNames,
  ReplEvaluator,
} from "./renderer/repl-evaluator.js";

// ---------------------------------------------------------------------------
// isComplete
// ---------------------------------------------------------------------------

function testIsComplete() {
  // Simple balanced expressions
  assert.strictEqual(isComplete("1 + 2"), true, "simple expression");
  assert.strictEqual(isComplete('const x = "hello"'), true, "string");
  assert.strictEqual(isComplete("function foo() {}"), true, "function");

  // Unbalanced
  assert.strictEqual(isComplete("function foo() {"), false, "open brace");
  assert.strictEqual(isComplete("if (true) {"), false, "open block");
  assert.strictEqual(isComplete("foo("), false, "open paren");
  assert.strictEqual(isComplete("[1, 2"), false, "open bracket");

  // Brace inside a string should NOT count
  assert.strictEqual(isComplete('const x = "hello {"'), true, "brace in double-quote string");
  assert.strictEqual(isComplete("const x = 'hello {'"), true, "brace in single-quote string");
  assert.strictEqual(isComplete("const x = `hello ${"), false, "open template expr");
  assert.strictEqual(isComplete("const x = `hello ${1 + 2}`"), true, "closed template expr");

  // Comments
  assert.strictEqual(isComplete("// open brace {\nconst x = 1"), true, "brace in line comment");
  assert.strictEqual(isComplete("/* open brace { */\nconst x = 1"), true, "brace in block comment");

  // Multi-line complete block
  assert.strictEqual(
    isComplete("function foo() {\n  return 1;\n}"),
    true,
    "multi-line complete function",
  );

  console.log("  isComplete: all tests passed");
}

// ---------------------------------------------------------------------------
// promoteDeclarations
// ---------------------------------------------------------------------------

function testPromoteDeclarations() {
  // Top-level const → var
  assert.strictEqual(promoteDeclarations("const x = 42;"), "var x = 42;");
  // Top-level let → var
  assert.strictEqual(promoteDeclarations("let y = 'hi';"), "var y = 'hi';");
  // var stays var
  assert.strictEqual(promoteDeclarations("var z = 1;"), "var z = 1;");

  // const inside a function is NOT promoted
  const fnCode = "function foo() { const inner = 1; }";
  assert.strictEqual(promoteDeclarations(fnCode), fnCode, "const inside function body unchanged");

  // const inside a block is NOT promoted
  const blockCode = "if (true) { const x = 1; }";
  assert.strictEqual(promoteDeclarations(blockCode), blockCode, "const inside block unchanged");

  console.log("  promoteDeclarations: all tests passed");
}

// ---------------------------------------------------------------------------
// getTopLevelVarNames
// ---------------------------------------------------------------------------

function testGetTopLevelVarNames() {
  assert.deepStrictEqual(getTopLevelVarNames("var x = 42;"), ["x"]);
  assert.deepStrictEqual(getTopLevelVarNames("var x = 1, y = 2;"), ["x", "y"]);
  assert.deepStrictEqual(getTopLevelVarNames("function foo() { var inner = 1; }"), []);
  assert.deepStrictEqual(getTopLevelVarNames("var a = 1;\nvar b = 2;"), ["a", "b"]);

  console.log("  getTopLevelVarNames: all tests passed");
}

// ---------------------------------------------------------------------------
// checkReservedNames
// ---------------------------------------------------------------------------

function testCheckReservedNames() {
  // Should throw for Bounce globals
  assert.throws(
    () => checkReservedNames("var display = 1;"),
    /display.*Bounce built-in/,
    "var display throws",
  );
  assert.throws(
    () => checkReservedNames("const play = () => {};"),
    /play.*Bounce built-in/,
    "const play throws",
  );
  assert.throws(
    () => checkReservedNames("let stop = true;"),
    /stop.*Bounce built-in/,
    "let stop throws",
  );
  assert.throws(
    () => checkReservedNames("function analyze() {}"),
    /analyze.*Bounce built-in/,
    "function analyze throws",
  );
  assert.throws(
    () => checkReservedNames("class clear {}"),
    /clear.*Bounce built-in/,
    "class clear throws",
  );
  assert.throws(
    () => checkReservedNames("const { list } = obj;"),
    /list.*Bounce built-in/,
    "destructured list throws",
  );

  // Should NOT throw for non-globals or inner scope
  assert.doesNotThrow(
    () => checkReservedNames("const myDisplay = 1;"),
    "myDisplay is fine",
  );
  assert.doesNotThrow(
    () => checkReservedNames("function inner() { const display = 1; }"),
    "display inside function is fine",
  );

  console.log("  checkReservedNames: all tests passed");
}

// ---------------------------------------------------------------------------
// ReplEvaluator — integration tests (no actual window.electron needed
// for pure logic tests; we mock transpileTypeScript as a pass-through)
// ---------------------------------------------------------------------------

async function testReplEvaluator() {
  // Patch window.electron.transpileTypeScript to be a no-op pass-through
  // (we test with already-valid JS so transpilation is identity)
  const globalAny = globalThis as Record<string, unknown>;
  globalAny.window = {
    electron: {
      transpileTypeScript: (src: string) => src,
    },
  };

  const evaluator = new ReplEvaluator({});

  // Simple expression
  const r1 = await evaluator.evaluate("1 + 2");
  // Result is undefined because there's no return; the expression is a statement.
  // Wrap in parens to get a value:
  const r2 = await evaluator.evaluate("(1 + 2)");
  assert.strictEqual(r2, 3, "simple expression value");

  // Variable persists across evals (promoted to var by promoteDeclarations → captured in epilogue)
  await evaluator.evaluate("var x = 42;");
  const r3 = await evaluator.evaluate("x");
  assert.strictEqual(r3, 42, "var persists across evals");

  // const is promoted → also persists
  await evaluator.evaluate("const y = 99;");
  const r4 = await evaluator.evaluate("y");
  assert.strictEqual(r4, 99, "const promoted to var persists");

  // Variable mutation persists
  await evaluator.evaluate("x = x + 1;");
  const r5 = await evaluator.evaluate("x");
  assert.strictEqual(r5, 43, "mutation persists across evals");

  // Transpile error surfaces
  await assert.rejects(
    () => evaluator.evaluate("const display = 1;"),
    /Bounce built-in/,
    "reserved name error thrown",
  );

  // top-level await (mock via already-resolved promise value)
  const r6 = await evaluator.evaluate("await Promise.resolve(7)");
  assert.strictEqual(r6, 7, "top-level await works");

  // Multi-line input joined with newlines
  const multiLine = "var a = 10;\nvar b = 20;";
  await evaluator.evaluate(multiLine);
  const r7 = await evaluator.evaluate("a + b");
  assert.strictEqual(r7, 30, "multi-line eval works");

  console.log("  ReplEvaluator: all tests passed");

  // Restore
  delete globalAny.window;
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

async function main() {
  console.log("repl-evaluator tests");
  testIsComplete();
  testPromoteDeclarations();
  testGetTopLevelVarNames();
  testCheckReservedNames();
  await testReplEvaluator();
  console.log("All repl-evaluator tests passed ✓");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
