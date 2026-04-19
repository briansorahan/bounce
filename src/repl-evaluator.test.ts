import * as assert from "assert";
import { test } from "vitest";
import {
  isComplete,
  promoteDeclarations,
  getTopLevelVarNames,
  getTopLevelFunctionDeclNames,
  checkReservedNames,
  autoAwaitTopLevel,
  ReplEvaluator,
} from "./renderer/repl-evaluator.js";

// Force registration of all namespaces so that isBounceGlobal / getNamespace works
// correctly in this test file (same pattern as src/help-completeness.test.ts).
import "./renderer/namespaces/sample-namespace.js";
import "./renderer/namespaces/corpus-namespace.js";
import "./renderer/namespaces/fs-namespace.js";
import "./renderer/namespaces/env-namespace.js";

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
}

// ---------------------------------------------------------------------------
// getTopLevelVarNames
// ---------------------------------------------------------------------------

function testGetTopLevelVarNames() {
  assert.deepStrictEqual(getTopLevelVarNames("var x = 42;"), ["x"]);
  assert.deepStrictEqual(getTopLevelVarNames("var x = 1, y = 2;"), ["x", "y"]);
  assert.deepStrictEqual(getTopLevelVarNames("function foo() { var inner = 1; }"), []);
  assert.deepStrictEqual(getTopLevelVarNames("var a = 1;\nvar b = 2;"), ["a", "b"]);
}

// ---------------------------------------------------------------------------
// getTopLevelFunctionDeclNames
// ---------------------------------------------------------------------------

function testGetTopLevelFunctionDeclNames() {
  assert.deepStrictEqual(getTopLevelFunctionDeclNames("function foo() {}"), ["foo"]);
  assert.deepStrictEqual(getTopLevelFunctionDeclNames("async function bar() {}"), ["bar"]);
  assert.deepStrictEqual(
    getTopLevelFunctionDeclNames("function foo() {}\nfunction baz() {}"),
    ["foo", "baz"],
  );
  // Nested function declarations should NOT be extracted
  assert.deepStrictEqual(getTopLevelFunctionDeclNames("function outer() { function inner() {} }"), ["outer"]);
  // Anonymous function expressions should NOT be extracted
  assert.deepStrictEqual(getTopLevelFunctionDeclNames("var f = function() {};"), []);
  // Bounce globals should be excluded
  assert.deepStrictEqual(getTopLevelFunctionDeclNames("function sn() {}"), []);
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
  assert.throws(
    () => checkReservedNames("const env = {};"),
    /env.*Bounce built-in/,
    "const env throws",
  );
  assert.throws(
    () => checkReservedNames("function debug() {}"),
    /debug.*Bounce built-in/,
    "function debug throws",
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
      then: (resolve: (value: { onsetSlice: () => { slice: () => Promise<string> } }) => void) => {
        Promise.resolve({
          onsetSlice: () => ({
            slice: async () => {
              await new Promise((resolveDelay) => setTimeout(resolveDelay, 0));
              events.push("sliced");
              return "sliced";
            },
          }),
        }).then(resolve);
      },
      onsetSlice: () => ({
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
  assert.strictEqual(evaluator.hasScopeValue("x"), true, "scope reports persisted variables");
  assert.strictEqual(evaluator.getScopeValue("x"), 43, "scope lookup returns persisted value");
  assert.deepStrictEqual(
    evaluator.listScopeEntries().map((entry) => entry.name),
    ["x", "y"],
    "scope entries are listed in sorted order",
  );

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
  assert.strictEqual(evaluator.hasScopeValue("samp"), true, "awaited initializer stored in scope");

  await evaluator.evaluate("samp = makeSample();");
  const r10 = await evaluator.evaluate("samp.hash");
  assert.strictEqual(r10, "sample-123", "assignments store awaited values");

  await evaluator.evaluate("delayedValue();\nsamp.play();");
  assert.deepStrictEqual(
    events,
    ["delayed", "delayed", "played"],
    "top-level expression statements are awaited in order",
  );

  const r11 = await evaluator.evaluate("makeAwaitlessSample().onsetSlice().slice()");
  assert.strictEqual(r11, "sliced", "thenable wrappers support awaitless chained calls");
  assert.deepStrictEqual(
    events,
    ["delayed", "delayed", "played", "sliced"],
    "awaitless chained calls execute through thenable wrappers",
  );

  // Function declarations persist across evals
  await evaluator.evaluate("function greet() { return 'hello'; }");
  assert.strictEqual(evaluator.hasScopeValue("greet"), true, "function declaration stored in scope");
  const r12 = await evaluator.evaluate("greet()");
  assert.strictEqual(r12, "hello", "persisted function declaration is callable");

  // Async function declarations also persist
  await evaluator.evaluate("async function fetchVal() { return 42; }");
  assert.strictEqual(evaluator.hasScopeValue("fetchVal"), true, "async function declaration stored in scope");
  const r13 = await evaluator.evaluate("fetchVal()");
  assert.strictEqual(r13, 42, "persisted async function declaration is callable");

  // Restore
  delete globalAny.window;
}

// ---------------------------------------------------------------------------
// serializeScope / restoreScope / clearScope
// ---------------------------------------------------------------------------

async function testReplEnvPersistence() {
  const globalAny = globalThis as Record<string, unknown>;
  globalAny.window = {
    electron: {
      transpileTypeScript: (src: string) => src,
    },
  };

  const evaluator = new ReplEvaluator({});

  // --- serializeScope: JSON primitives and plain objects ---
  await evaluator.evaluate("var num = 42;");
  await evaluator.evaluate("var str = 'hello';");
  await evaluator.evaluate("var flag = true;");
  await evaluator.evaluate("var arr = [1, 2, 3];");
  await evaluator.evaluate("var obj = { rate: 44100 };");

  let entries = evaluator.serializeScope();
  const byName = (name: string) => entries.find((e) => e.name === name);

  assert.strictEqual(byName("num")?.kind, "json", "number serialized as json");
  assert.strictEqual(byName("num")?.value, "42");
  assert.strictEqual(byName("str")?.kind, "json", "string serialized as json");
  assert.strictEqual(byName("str")?.value, '"hello"');
  assert.strictEqual(byName("flag")?.kind, "json", "boolean serialized as json");
  assert.strictEqual(byName("arr")?.kind, "json", "array serialized as json");
  assert.deepStrictEqual(JSON.parse(byName("arr")!.value), [1, 2, 3]);
  assert.strictEqual(byName("obj")?.kind, "json", "plain object serialized as json");
  assert.deepStrictEqual(JSON.parse(byName("obj")!.value), { rate: 44100 });

  // --- serializeScope: function declaration ---
  await evaluator.evaluate("function double(n) { return n * 2; }");
  entries = evaluator.serializeScope();
  const fnEntry = byName("double");
  assert.strictEqual(fnEntry?.kind, "function", "function declaration serialized as function");
  assert.ok(fnEntry?.value.includes("double"), "function source contains function name");

  // --- serializeScope: skips un-serializable values ---
  await evaluator.evaluate("var circ = {}; circ.self = circ;");
  entries = evaluator.serializeScope();
  assert.strictEqual(
    entries.find((e) => e.name === "circ"),
    undefined,
    "circular reference is skipped",
  );

  // --- serializeScope: skips BOUNCE_GLOBALS ---
  // Manually inject a global name into scope to simulate an edge case
  (evaluator as unknown as { scopeVars: Map<string, unknown> }).scopeVars.set("sn", {});
  entries = evaluator.serializeScope();
  assert.strictEqual(
    entries.find((e) => e.name === "sn"),
    undefined,
    "BOUNCE_GLOBALS names are not serialized",
  );

  // --- restoreScope: JSON values restored into fresh evaluator ---
  const evaluator2 = new ReplEvaluator({});
  (globalAny.window as { electron: { transpileTypeScript: (s: string) => string } }).electron.transpileTypeScript =
    (src: string) => src;

  const restored = await evaluator2.restoreScope([
    { name: "x", kind: "json", value: "99" },
    { name: "config", kind: "json", value: '{"rate":22050}' },
  ]);
  assert.deepStrictEqual(restored, ["x", "config"], "restoreScope returns list of restored names");
  assert.strictEqual(evaluator2.getScopeValue("x"), 99, "json number restored correctly");
  assert.deepStrictEqual(
    evaluator2.getScopeValue("config"),
    { rate: 22050 },
    "json object restored correctly",
  );

  // --- restoreScope: function source re-evaluated ---
  const evaluator3 = new ReplEvaluator({});
  await evaluator3.restoreScope([
    { name: "triple", kind: "function", value: "function triple(n) { return n * 3; }" },
  ]);
  assert.strictEqual(evaluator3.hasScopeValue("triple"), true, "function restored into scope");
  const result = await evaluator3.evaluate("triple(4)");
  assert.strictEqual(result, 12, "restored function is callable");

  // --- restoreScope: skips BOUNCE_GLOBALS ---
  const evaluator4 = new ReplEvaluator({});
  const restoredGlobals = await evaluator4.restoreScope([
    { name: "sn", kind: "json", value: '"should-be-skipped"' },
  ]);
  assert.deepStrictEqual(restoredGlobals, [], "BOUNCE_GLOBALS skipped during restore");
  assert.strictEqual(evaluator4.hasScopeValue("sn"), false, "BOUNCE_GLOBAL not injected");

  // --- clearScope: empties both maps ---
  await evaluator.evaluate("var z = 7;");
  evaluator.clearScope();
  assert.strictEqual(evaluator.listScopeEntries().length, 0, "clearScope empties scopeVars");
  assert.strictEqual(
    evaluator.serializeScope().length,
    0,
    "clearScope empties functionSources",
  );

  // --- round-trip: define → serialize → restore → use ---
  const writer = new ReplEvaluator({});
  await writer.evaluate("var pi = 3.14;");
  await writer.evaluate("function square(n) { return n * n; }");
  const snapshot = writer.serializeScope();

  const reader = new ReplEvaluator({});
  await reader.restoreScope(snapshot);
  assert.strictEqual(reader.getScopeValue("pi"), 3.14, "round-trip: number restored");
  const sq = await reader.evaluate("square(5)");
  assert.strictEqual(sq, 25, "round-trip: function callable after restore");

  delete globalAny.window;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("isComplete", () => { testIsComplete(); });
test("promoteDeclarations", () => { testPromoteDeclarations(); });
test("getTopLevelVarNames", () => { testGetTopLevelVarNames(); });
test("getTopLevelFunctionDeclNames", () => { testGetTopLevelFunctionDeclNames(); });
test("checkReservedNames", () => { testCheckReservedNames(); });
test("autoAwaitTopLevel", () => { testAutoAwaitTopLevel(); });
test("ReplEvaluator", async () => { await testReplEvaluator(); });
test("ReplEnvPersistence", async () => { await testReplEnvPersistence(); });
