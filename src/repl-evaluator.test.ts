import * as assert from "assert";
import {
  isComplete,
  promoteDeclarations,
  getTopLevelVarNames,
  checkReservedNames,
  autoAwaitTopLevel,
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
    () => checkReservedNames("var sn = 1;"),
    /sn.*Bounce built-in/,
    "var sn throws",
  );
  assert.throws(
    () => checkReservedNames("const nx = () => {};"),
    /nx.*Bounce built-in/,
    "const nx throws",
  );
  assert.throws(
    () => checkReservedNames("let help = true;"),
    /help.*Bounce built-in/,
    "let help throws",
  );
  assert.throws(
    () => checkReservedNames("function corpus() {}"),
    /corpus.*Bounce built-in/,
    "function corpus throws",
  );
  assert.throws(
    () => checkReservedNames("class clear {}"),
    /clear.*Bounce built-in/,
    "class clear throws",
  );
  assert.throws(
    () => checkReservedNames("const { sn } = obj;"),
    /sn.*Bounce built-in/,
    "destructured sn throws",
  );
  assert.throws(
    () => checkReservedNames("const fs = {};"),
    /fs.*Bounce built-in/,
    "const fs throws",
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
// autoAwaitTopLevel
// ---------------------------------------------------------------------------

function testAutoAwaitTopLevel() {
  assert.strictEqual(
    autoAwaitTopLevel("var samp = sn.read('abc');"),
    "var samp = await (sn.read('abc'));",
    "variable initializers are awaited",
  );
  assert.strictEqual(
    autoAwaitTopLevel("samp = sn.read('abc');"),
    "samp = await (sn.read('abc'));",
    "assignments are awaited",
  );
  assert.strictEqual(
    autoAwaitTopLevel("sn.read('abc');\nsamp.play();"),
    "await (sn.read('abc'));\nawait (samp.play());",
    "expression statements are awaited",
  );
  assert.strictEqual(
    autoAwaitTopLevel("if (ok) { sn.read('abc'); }"),
    "if (ok) { sn.read('abc'); }",
    "control statements are left untouched",
  );

  console.log("  autoAwaitTopLevel: all tests passed");
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

  const events: string[] = [];
  const evaluator = new ReplEvaluator({
    delayedValue: async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      events.push("delayed");
      return 7;
    },
    makeSample: async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return {
        hash: "sample-123",
        play: async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
          events.push("played");
          return "played";
        },
      };
    },
    makeAwaitlessSample: () => ({
      then: (resolve: (value: { onsets: () => { slice: () => Promise<string> } }) => void) => {
        Promise.resolve({
          onsets: () => ({
            slice: async () => {
              await new Promise((resolveDelay) => setTimeout(resolveDelay, 0));
              events.push("sliced");
              return "sliced";
            },
          }),
        }).then(resolve);
      },
      onsets: () => ({
        then: (resolve: (value: { slice: () => Promise<string> }) => void) => {
          Promise.resolve({
            slice: async () => {
              await new Promise((resolveDelay) => setTimeout(resolveDelay, 0));
              events.push("sliced");
              return "sliced";
            },
          }).then(resolve);
        },
        slice: async () => {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 0));
          events.push("sliced");
          return "sliced";
        },
      }),
    }),
  });

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
    () => evaluator.evaluate("const sn = 1;"),
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

  const r8 = await evaluator.evaluate("delayedValue()");
  assert.strictEqual(r8, 7, "single expressions are auto-awaited");

  await evaluator.evaluate("let samp = makeSample();");
  const r9 = await evaluator.evaluate("samp.hash");
  assert.strictEqual(r9, "sample-123", "variable initializers store awaited values");

  await evaluator.evaluate("samp = makeSample();");
  const r10 = await evaluator.evaluate("samp.hash");
  assert.strictEqual(r10, "sample-123", "assignments store awaited values");

  await evaluator.evaluate("delayedValue();\nsamp.play();");
  assert.deepStrictEqual(
    events,
    ["delayed", "delayed", "played"],
    "top-level expression statements are awaited in order",
  );

  const r11 = await evaluator.evaluate("makeAwaitlessSample().onsets().slice()");
  assert.strictEqual(r11, "sliced", "thenable wrappers support awaitless chained calls");
  assert.deepStrictEqual(
    events,
    ["delayed", "delayed", "played", "sliced"],
    "awaitless chained calls execute through thenable wrappers",
  );

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
  testAutoAwaitTopLevel();
  await testReplEvaluator();
  console.log("All repl-evaluator tests passed ✓");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
