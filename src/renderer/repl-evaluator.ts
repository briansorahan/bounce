export const BOUNCE_GLOBALS = new Set([
  "display",
  "play",
  "stop",
  "analyze",
  "analyzeNmf",
  "slice",
  "sep",
  "nx",
  "list",
  "playSlice",
  "playComponent",
  "visualizeNmf",
  "visualizeNx",
  "onsetSlice",
  "nmf",
  "clearDebug",
  "debug",
  "help",
  "clear",
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

  constructor(private bounceApi: Record<string, unknown>) {}

  isComplete(source: string): boolean {
    return isComplete(source);
  }

  async evaluate(source: string): Promise<unknown> {
    const js = await window.electron.transpileTypeScript(source);
    checkReservedNames(js);
    const promoted = promoteDeclarations(js);
    const declaredNames = getTopLevelVarNames(promoted);

    const allNames = new Set([...this.scopeVars.keys(), ...declaredNames]);
    const bounceNames = Object.keys(this.bounceApi);
    const bounceValues = Object.values(this.bounceApi);

    const prelude = [...allNames]
      .map(
        (n) =>
          `var ${n} = __scope__.has(${JSON.stringify(n)}) ? __scope__.get(${JSON.stringify(n)}) : undefined;`,
      )
      .join("\n");

    const epilogue = [...allNames]
      .map(
        (n) =>
          `try { __scope__.set(${JSON.stringify(n)}, ${n}); } catch (_e) {}`,
      )
      .join("\n");

    // Try to return the expression value (works for single-expression inputs).
    // new AsyncFunction throws SyntaxError at construction if the body is invalid.
    //
    // TypeScript always appends a trailing semicolon to transpiled output, so
    // `promoted` looks like `play("hash");\n`. Wrapping that directly in
    // `const __result__ = (play("hash");)` is a SyntaxError, which causes the
    // fallback (non-awaiting) path to be used — meaning async calls like play()
    // would not be awaited and the prompt would print before their output.
    // Strip trailing semicolons so the expression wrapper succeeds.
    const singleExpr = promoted.trim().replace(/;+$/, "");
    let fn: (...args: unknown[]) => Promise<unknown>;
    try {
      fn = new AsyncFunction(
        "__scope__",
        ...bounceNames,
        `${prelude}\nconst __result__ = (${singleExpr});\n${epilogue}\nreturn __result__;`,
      );
    } catch {
      // Multi-statement input: no return value
      fn = new AsyncFunction("__scope__", ...bounceNames, `${prelude}\n${promoted}\n${epilogue}`);
    }

    return await fn(this.scopeVars, ...bounceValues);
  }
}
