export const BOUNCE_GLOBALS = new Set([
  "sn",
  "env",
  "vis",
  "nx",
  "visualizeNmf",
  "visualizeNx",
  "onsetSlice",
  "nmf",
  "clearDebug",
  "debug",
  "help",
  "clear",
  "corpus",
  "fs",
  "proj",
]);

/**
 * Returns true if `source` has balanced brackets/braces/parens,
 * ignoring occurrences inside strings and comments. Correctly handles
 * template literals with nested `${}` expressions.
 */
export function isComplete(source: string): boolean {
  let i = 0;
  let depth = 0;
  // Stack: depth at which each `${` expression was opened (for template return)
  const templateStack: number[] = [];
  let inTemplate = false;
  let inString: '"' | "'" | null = null;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1] ?? "";

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      i++;
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") { inBlockComment = false; i += 2; continue; }
      i++;
      continue;
    }

    if (inString) {
      if (ch === "\\") { i += 2; continue; } // skip escaped char
      if (ch === inString) inString = null;
      i++;
      continue;
    }

    if (inTemplate) {
      if (ch === "\\") { i += 2; continue; } // skip escaped char in template
      if (ch === "`") { inTemplate = false; i++; continue; }
      if (ch === "$" && next === "{") {
        // Enter a ${...} expression: remember current depth, count the {
        templateStack.push(depth);
        depth++;
        inTemplate = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    // Not inside any string, template, or comment
    if (ch === "/" && next === "/") { inLineComment = true; i++; continue; }
    if (ch === "/" && next === "*") { inBlockComment = true; i++; continue; }
    if (ch === '"' || ch === "'") { inString = ch; i++; continue; }
    if (ch === "`") { inTemplate = true; i++; continue; }

    if (ch === "{" || ch === "(" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === ")" || ch === "]") {
      depth--;
      // If this } closes a template expression, return to template mode
      if (ch === "}" && templateStack.length > 0 && depth === templateStack[templateStack.length - 1]) {
        templateStack.pop();
        inTemplate = true;
      }
    }

    i++;
  }

  return depth === 0;
}

// Simple scan state for promoteDeclarations, checkReservedNames, getTopLevelVarNames.
// These only need to know "are we at top-level depth 0, outside strings/comments?"
// Template literal interiors are treated as opaque strings for these purposes.
interface ScanState {
  depth: number;
  inString: '"' | "'" | "`" | null;
  inLineComment: boolean;
  inBlockComment: boolean;
}

function makeScanState(): ScanState {
  return { depth: 0, inString: null, inLineComment: false, inBlockComment: false };
}

function advanceScan(state: ScanState, ch: string, next: string, prev: string): ScanState {
  const s = { ...state };

  if (s.inLineComment) {
    if (ch === "\n") s.inLineComment = false;
    return s;
  }

  if (s.inBlockComment) {
    if (ch === "*" && next === "/") s.inBlockComment = false;
    return s;
  }

  if (s.inString) {
    if (ch === "\\") return s; // skip — next char is escaped
    if (prev === "\\") return s; // this char was escaped
    if (ch === s.inString) s.inString = null;
    return s;
  }

  // Not inside a string or comment — check for entry points
  if (ch === "/" && next === "/") { s.inLineComment = true; return s; }
  if (ch === "/" && next === "*") { s.inBlockComment = true; return s; }
  if (ch === '"' || ch === "'" || ch === "`") { s.inString = ch; return s; }

  if (ch === "{" || ch === "(" || ch === "[") s.depth++;
  if (ch === "}" || ch === ")" || ch === "]") s.depth--;

  return s;
}

/**
 * Rewrites top-level `const` and `let` declarations to `var` so that
 * they become properties of the AsyncFunction scope and can be captured
 * in the epilogue for cross-eval persistence.
 */
export function promoteDeclarations(js: string): string {
  let state = makeScanState();
  let result = "";
  let i = 0;

  while (i < js.length) {
    const ch = js[i];
    const prev = js[i - 1] ?? "";
    const next = js[i + 1] ?? "";

    // At top level, check for const/let keywords
    if (state.depth === 0 && !state.inString && !state.inLineComment && !state.inBlockComment) {
      const slice4 = js.slice(i, i + 4);
      const slice5 = js.slice(i, i + 5);
      const slice6 = js.slice(i, i + 6);

      if (
        (slice5 === "const" && /\s/.test(js[i + 5] ?? "")) ||
        (slice3(js, i) === "let" && /\s/.test(js[i + 3] ?? ""))
      ) {
        const isConst = slice5 === "const";
        const kwLen = isConst ? 5 : 3;
        result += "var";
        i += kwLen;
        continue;
      }

      void slice4; void slice6; // suppress unused warning
    }

    state = advanceScan(state, ch, next, prev);
    result += ch;
    i++;
  }

  return result;
}

function slice3(s: string, i: number): string {
  return s.slice(i, i + 3);
}

/**
 * Returns all top-level `var` declaration names in transpiled JS.
 * Used to build the inject/extract scope wrappers.
 * Handles simple declarations: `var x`, `var x = ...`
 * Handles multi-declarators: `var x, y, z`
 * Does NOT handle destructuring (those aren't promoted anyway).
 */
export function getTopLevelVarNames(js: string): string[] {
  const names: string[] = [];
  let state = makeScanState();
  let i = 0;

  while (i < js.length) {
    const ch = js[i];
    const prev = js[i - 1] ?? "";
    const next = js[i + 1] ?? "";

    if (state.depth === 0 && !state.inString && !state.inLineComment && !state.inBlockComment) {
      if (js.slice(i, i + 3) === "var" && /\s/.test(js[i + 3] ?? "")) {
        // Scan the declarator list until end of statement
        i += 3;
        while (i < js.length) {
          // Skip whitespace
          while (i < js.length && /\s/.test(js[i])) i++;
          // Read identifier
          let name = "";
          while (i < js.length && /[\w$]/.test(js[i])) {
            name += js[i++];
          }
          if (name && !BOUNCE_GLOBALS.has(name)) names.push(name);
          // Skip to next declarator or end
          while (i < js.length && js[i] !== "," && js[i] !== ";") {
            // Track depth to skip over initializer expressions like `var x = {a: 1}`
            const innerCh = js[i];
            if (innerCh === "{" || innerCh === "(" || innerCh === "[") {
              let depth = 1;
              i++;
              while (i < js.length && depth > 0) {
                if (js[i] === "{" || js[i] === "(" || js[i] === "[") depth++;
                else if (js[i] === "}" || js[i] === ")" || js[i] === "]") depth--;
                i++;
              }
            } else {
              i++;
            }
          }
          if (i < js.length && js[i] === ",") {
            i++; // next declarator
          } else {
            break;
          }
        }
        continue;
      }
    }

    state = advanceScan(state, ch, next, prev);
    i++;
  }

  return names;
}

/**
 * Extracts the names of top-level function declarations so they can be
 * persisted in scopeVars across evaluations. Handles both plain and async
 * variants: `function foo() {}` and `async function foo() {}`.
 */
export function getTopLevelFunctionDeclNames(js: string): string[] {
  const names: string[] = [];
  let state = makeScanState();
  let i = 0;

  while (i < js.length) {
    const ch = js[i];
    const prev = js[i - 1] ?? "";
    const next = js[i + 1] ?? "";

    if (state.depth === 0 && !state.inString && !state.inLineComment && !state.inBlockComment) {
      // Detect `function` or `async function` at the start of a statement.
      let nameStart = -1;

      if (js.slice(i, i + 8) === "function" && /[\s*(]/.test(js[i + 8] ?? "")) {
        nameStart = i + 8;
      } else if (js.slice(i, i + 5) === "async" && /\s/.test(js[i + 5] ?? "")) {
        let j = i + 5;
        while (j < js.length && /\s/.test(js[j])) j++;
        if (js.slice(j, j + 8) === "function" && /[\s*(]/.test(js[j + 8] ?? "")) {
          nameStart = j + 8;
        }
      }

      if (nameStart !== -1) {
        // Skip optional generator `*`
        while (nameStart < js.length && (js[nameStart] === "*" || /\s/.test(js[nameStart]))) nameStart++;
        // Read identifier
        let name = "";
        while (nameStart < js.length && /[\w$]/.test(js[nameStart])) name += js[nameStart++];
        if (name && !BOUNCE_GLOBALS.has(name)) names.push(name);
        i = nameStart;
        continue;
      }
    }

    state = advanceScan(state, ch, next, prev);
    i++;
  }

  return names;
}

interface StatementChunk {
  text: string;
  terminator: string;
}

function splitTopLevelStatements(js: string): StatementChunk[] {
  const chunks: StatementChunk[] = [];
  let state = makeScanState();
  let start = 0;

  for (let i = 0; i < js.length; i++) {
    const ch = js[i];
    const prev = js[i - 1] ?? "";
    const next = js[i + 1] ?? "";

    state = advanceScan(state, ch, next, prev);
    if (state.depth === 0 && !state.inString && !state.inLineComment && !state.inBlockComment && ch === ";") {
      chunks.push({ text: js.slice(start, i), terminator: ";" });
      start = i + 1;
    }
  }

  if (start < js.length) {
    chunks.push({ text: js.slice(start), terminator: "" });
  }

  return chunks.filter((chunk) => chunk.text.trim() || chunk.terminator);
}

function splitTopLevelByComma(source: string): string[] {
  const parts: string[] = [];
  let state = makeScanState();
  let start = 0;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const prev = source[i - 1] ?? "";
    const next = source[i + 1] ?? "";

    state = advanceScan(state, ch, next, prev);
    if (state.depth === 0 && !state.inString && !state.inLineComment && !state.inBlockComment && ch === ",") {
      parts.push(source.slice(start, i));
      start = i + 1;
    }
  }

  parts.push(source.slice(start));
  return parts;
}

function findTopLevelAssignmentOperator(source: string): { index: number; operator: string } | null {
  const operators = ["??=", "||=", "&&=", ">>>=", ">>=", "<<=", "**=", "+=", "-=", "*=", "/=", "%=", "&=", "^=", "|=", "="];
  let state = makeScanState();

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const prev = source[i - 1] ?? "";
    const next = source[i + 1] ?? "";

    if (state.depth === 0 && !state.inString && !state.inLineComment && !state.inBlockComment) {
      const match = operators.find((operator) => source.startsWith(operator, i));
      if (match) {
        if (match === "=") {
          const prevChar = source[i - 1] ?? "";
          const nextChar = source[i + 1] ?? "";
          if ("=!<>+-*/%&|^".includes(prevChar) || nextChar === "=" || nextChar === ">") {
            state = advanceScan(state, ch, next, prev);
            continue;
          }
        }
        return { index: i, operator: match };
      }
    }

    state = advanceScan(state, ch, next, prev);
  }

  return null;
}

function transformVarDeclaration(core: string): string {
  const declarators = splitTopLevelByComma(core.slice(4));
  const transformed = declarators.map((declarator) => {
    const assignment = findTopLevelAssignmentOperator(declarator);
    if (!assignment || assignment.operator !== "=") {
      return declarator.trim();
    }

    const lhs = declarator.slice(0, assignment.index).trim();
    const rhs = declarator.slice(assignment.index + assignment.operator.length).trim();
    return `${lhs} = await (${rhs})`;
  });

  return `var ${transformed.join(", ")}`;
}

function isControlStatement(core: string): boolean {
  return /^(var\b|function\b|async\s+function\b|class\b|if\b|for\b|while\b|switch\b|try\b|catch\b|finally\b|do\b|return\b|throw\b|break\b|continue\b|\{)/.test(core);
}

function transformTopLevelStatement(statement: string): string {
  const leading = statement.match(/^\s*/)?.[0] ?? "";
  const trailing = statement.match(/\s*$/)?.[0] ?? "";
  const core = statement.trim();

  if (!core) return statement;
  if (core.startsWith("await ")) return statement;
  if (core.startsWith("var ")) return `${leading}${transformVarDeclaration(core)}${trailing}`;

  const assignment = findTopLevelAssignmentOperator(core);
  if (assignment) {
    const lhs = core.slice(0, assignment.index).trim();
    const rhs = core.slice(assignment.index + assignment.operator.length).trim();
    return `${leading}${lhs} ${assignment.operator} await (${rhs})${trailing}`;
  }

  if (!isControlStatement(core)) {
    return `${leading}await (${core})${trailing}`;
  }

  return statement;
}

export function autoAwaitTopLevel(js: string): string {
  return splitTopLevelStatements(js)
    .map(({ text, terminator }) => `${transformTopLevelStatement(text)}${terminator}`)
    .join("");
}

/**
 * Throws if any top-level variable, function, or class declaration uses
 * a name that is a Bounce global, preventing accidental shadowing.
 */
export function checkReservedNames(js: string): void {
  let state = makeScanState();
  let i = 0;

  while (i < js.length) {
    const ch = js[i];
    const prev = js[i - 1] ?? "";
    const next = js[i + 1] ?? "";

    if (state.depth === 0 && !state.inString && !state.inLineComment && !state.inBlockComment) {
      // var/const/let declarations
      const isVarLike =
        (js.slice(i, i + 3) === "var" && /\s/.test(js[i + 3] ?? "")) ||
        (js.slice(i, i + 5) === "const" && /\s/.test(js[i + 5] ?? "")) ||
        (js.slice(i, i + 3) === "let" && /\s/.test(js[i + 3] ?? ""));

      if (isVarLike) {
        const kwLen = js.slice(i, i + 5) === "const" ? 5 : 3;
        let j = i + kwLen;
        while (j < js.length && /\s/.test(js[j])) j++;
        // Handle destructuring: { x } or [ x ]
        if (js[j] === "{" || js[j] === "[") {
          // Scan inside for identifiers — simplified: find word tokens
          const closing = js[j] === "{" ? "}" : "]";
          j++;
          while (j < js.length && js[j] !== closing) {
            while (j < js.length && /\s|,|:/.test(js[j])) j++;
            let name = "";
            while (j < js.length && /[\w$]/.test(js[j])) name += js[j++];
            if (name && BOUNCE_GLOBALS.has(name)) {
              throw new Error(
                `'${name}' is a Bounce built-in and cannot be redefined. Use a different variable name.`,
              );
            }
          }
        } else {
          // Simple identifier
          let name = "";
          while (j < js.length && /[\w$]/.test(js[j])) name += js[j++];
          if (name && BOUNCE_GLOBALS.has(name)) {
            throw new Error(
              `'${name}' is a Bounce built-in and cannot be redefined. Use a different variable name.`,
            );
          }
        }
        state = advanceScan(state, ch, next, prev);
        i++;
        continue;
      }

      // function declarations: `function foo(`
      if (js.slice(i, i + 8) === "function" && /[\s(]/.test(js[i + 8] ?? "")) {
        let j = i + 8;
        while (j < js.length && /\s/.test(js[j])) j++;
        let name = "";
        while (j < js.length && /[\w$]/.test(js[j])) name += js[j++];
        if (name && BOUNCE_GLOBALS.has(name)) {
          throw new Error(
            `'${name}' is a Bounce built-in and cannot be redefined. Use a different variable name.`,
          );
        }
      }

      // class declarations: `class Foo`
      if (js.slice(i, i + 5) === "class" && /\s/.test(js[i + 5] ?? "")) {
        let j = i + 5;
        while (j < js.length && /\s/.test(js[j])) j++;
        let name = "";
        while (j < js.length && /[\w$]/.test(js[j])) name += js[j++];
        if (name && BOUNCE_GLOBALS.has(name)) {
          throw new Error(
            `'${name}' is a Bounce built-in and cannot be redefined. Use a different variable name.`,
          );
        }
      }
    }

    state = advanceScan(state, ch, next, prev);
    i++;
  }
}

// AsyncFunction constructor — works in browser/Electron renderer context
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

export class ReplEvaluator {
  private scopeVars = new Map<string, unknown>();
  private functionSources = new Map<string, string>();
  private scopeEpoch = 0;

  constructor(private bounceApi: Record<string, unknown>) {}

  isComplete(source: string): boolean {
    return isComplete(source);
  }

  getCompletionBindings(): Record<string, unknown> {
    return {
      ...this.bounceApi,
      ...Object.fromEntries(this.scopeVars),
    };
  }

  hasScopeValue(name: string): boolean {
    return this.scopeVars.has(name);
  }

  getScopeValue(name: string): unknown {
    return this.scopeVars.get(name);
  }

  listScopeEntries(): Array<{ name: string; value: unknown }> {
    return [...this.scopeVars.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => ({ name, value }));
  }

  serializeScope(): Array<{ name: string; kind: "json" | "function"; value: string }> {
    const entries: Array<{ name: string; kind: "json" | "function"; value: string }> = [];

    // Emit function declarations first, using their original TypeScript source.
    for (const [name, source] of this.functionSources) {
      if (!BOUNCE_GLOBALS.has(name)) {
        entries.push({ name, kind: "function", value: source });
      }
    }

    // Emit JSON-serializable non-function values.
    for (const [name, value] of this.scopeVars) {
      if (BOUNCE_GLOBALS.has(name) || this.functionSources.has(name)) {
        continue;
      }
      try {
        const serialized = JSON.stringify(value);
        if (serialized !== undefined) {
          entries.push({ name, kind: "json", value: serialized });
        }
      } catch {
        // Skip values that cannot be serialized (circular refs, etc.)
      }
    }

    return entries;
  }

  async restoreScope(
    entries: Array<{ name: string; kind: "json" | "function"; value: string }>,
  ): Promise<string[]> {
    const restored: string[] = [];
    for (const entry of entries) {
      if (BOUNCE_GLOBALS.has(entry.name)) {
        continue;
      }
      if (entry.kind === "json") {
        try {
          this.scopeVars.set(entry.name, JSON.parse(entry.value));
          restored.push(entry.name);
        } catch {
          // Skip malformed entries
        }
      } else if (entry.kind === "function") {
        try {
          await this.evaluate(entry.value);
          restored.push(entry.name);
        } catch {
          // Skip functions that fail to re-evaluate
        }
      }
    }
    return restored;
  }

  clearScope(): void {
    this.scopeVars.clear();
    this.functionSources.clear();
    this.scopeEpoch += 1;
  }

  async evaluate(source: string): Promise<unknown> {
    const js = await window.electron.transpileTypeScript(source);
    checkReservedNames(js);
    const promoted = promoteDeclarations(js);
    const autoAwaited = autoAwaitTopLevel(promoted);
    const declaredNames = getTopLevelVarNames(promoted);
    const functionDeclNames = new Set(getTopLevelFunctionDeclNames(promoted));

    // Record the original source for each top-level function declaration so it
    // can be re-evaluated later when restoring a saved scope.
    for (const name of functionDeclNames) {
      this.functionSources.set(name, source);
    }

    const allNames = new Set([...this.scopeVars.keys(), ...declaredNames, ...functionDeclNames]);
    const bounceNames = Object.keys(this.bounceApi);
    const bounceValues = Object.values(this.bounceApi);

    // For function declarations, the fallback must be the hoisted function value
    // (not `undefined`) so that the prelude var assignment doesn't clobber it.
    const prelude = [...allNames]
      .map((n) => {
        const scopeTest = `__scope__.has(${JSON.stringify(n)}) ? __scope__.get(${JSON.stringify(n)})`;
        const fallback = functionDeclNames.has(n) ? n : "undefined";
        return `var ${n} = ${scopeTest} : ${fallback};`;
      })
      .join("\n");

    const epilogue = [...allNames]
      .map(
        (n) =>
          `try { __scope__.set(${JSON.stringify(n)}, ${n}); } catch (_e) {}`,
      )
      .join("\n");

    // For a single top-level expression statement, preserve the expression value.
    // For declarations / assignments / multi-statement input, run the transformed
    // body instead so top-level commands and initializers are automatically awaited.
    // For a single-variable declaration (e.g. `const h = mic.record(...)`), also
    // return the variable so its display text is printed to the terminal.
    const singleExpr = promoted.trim().replace(/;+$/, "");
    const singleStatements = splitTopLevelStatements(promoted).filter((statement) => statement.text.trim());
    let fn: (...args: unknown[]) => Promise<unknown>;
    if (singleStatements.length === 1 && !isControlStatement(singleExpr) && !findTopLevelAssignmentOperator(singleExpr)) {
      fn = new AsyncFunction(
        "__scope__",
        ...bounceNames,
        `${prelude}\nconst __result__ = await (${singleExpr});\n${epilogue}\nreturn __result__;`,
      );
    } else if (singleStatements.length === 1 && declaredNames.length === 1) {
      // Single-variable declaration: run the body and return the variable value for display.
      fn = new AsyncFunction(
        "__scope__",
        ...bounceNames,
        `${prelude}\n${autoAwaited}\n${epilogue}\nreturn ${declaredNames[0]};`,
      );
    } else {
      fn = new AsyncFunction("__scope__", ...bounceNames, `${prelude}\n${autoAwaited}\n${epilogue}`);
    }

    const evalScopeEpoch = this.scopeEpoch;
    const evalScope = {
      has: (name: string) => this.scopeVars.has(name),
      get: (name: string) => this.scopeVars.get(name),
      set: (name: string, value: unknown) => {
        if (this.scopeEpoch !== evalScopeEpoch) {
          return this.scopeVars;
        }
        this.scopeVars.set(name, value);
        return this.scopeVars;
      },
    };

    return await fn(evalScope, ...bounceValues);
  }
}
