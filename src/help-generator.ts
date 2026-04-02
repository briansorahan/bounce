/**
 * Core logic for the JSDoc-driven CommandHelp generator.
 *
 * Exported so both `scripts/generate-help.ts` (the file-walking entrypoint)
 * and `src/help-codegen.test.ts` can import shared types and functions without
 * the former triggering side-effectful file I/O in tests.
 */

import ts from "typescript";
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParamInfo {
  name: string;
  type: string;
  optional: boolean;
}

interface JsDocInfo {
  summary: string;
  description?: string;
  params: Array<{ name: string; type?: string; description: string }>;
  returns?: string;
  examples: string[];
}

export interface CommandEntry {
  name: string;
  params: ParamInfo[];
  jsdoc?: JsDocInfo;
}

export interface NamespaceInfo {
  namespaceName: string;
  description: string;
  commands: CommandEntry[];
}

// ---------------------------------------------------------------------------
// JSDoc parsing
// ---------------------------------------------------------------------------

/**
 * Extract the leading JSDoc block (/** ... *\/) from the trivia of a node.
 * Returns the LAST such block if there are multiple comments, and does NOT
 * include any trailing whitespace (so jsdocText always ends exactly with *\/).
 */
function getLeadingJsDoc(
  source: string,
  node: ts.Node,
  sourceFile: ts.SourceFile,
): string | undefined {
  const triviaStart = node.getFullStart();
  const nodeStart = node.getStart(sourceFile);
  if (triviaStart >= nodeStart) return undefined;

  const triviaText = source.substring(triviaStart, nodeStart);

  // Use a global search so we find the LAST JSDoc block in the trivia.
  // The match text ends exactly with */ (no trailing whitespace captured).
  const jsdocRe = /\/\*\*([\s\S]*?)\*\//g;
  let match: RegExpExecArray | null;
  let last: string | undefined;
  while ((match = jsdocRe.exec(triviaText)) !== null) {
    last = match[0];
  }
  return last;
}

/**
 * Extract the @namespace tag value from a JSDoc string.
 */
export function getNamespaceTag(jsdocText: string): string | undefined {
  const match = jsdocText.match(/@namespace\s+(\S+)/);
  return match ? match[1] : undefined;
}

/**
 * Extract the description text for a namespace from its JSDoc block.
 *
 * The description is the text that appears before the `@namespace <name>` tag
 * (i.e., the body lines before the first `@` tag).  Leading and trailing blank
 * lines are stripped, and the remaining lines are joined with `\n`.
 */
export function getNamespaceDescription(jsdocText: string): string {
  const inner = jsdocText.replace(/^\/\*\*/, "").replace(/\*\/$/, "");
  const rawLines = inner.split("\n").map((line) =>
    line.replace(/^\s*\*\s?/, "").trimEnd(),
  );

  // Collect lines before the first @ tag
  const descLines: string[] = [];
  for (const line of rawLines) {
    if (line.startsWith("@")) break;
    descLines.push(line);
  }

  // Trim leading/trailing blank lines
  while (descLines.length > 0 && descLines[0].trim() === "") descLines.shift();
  while (descLines.length > 0 && descLines[descLines.length - 1].trim() === "") descLines.pop();

  return descLines.join("\n");
}

/**
 * Parse a raw JSDoc block into summary, description, @param, and @example parts.
 */
function parseJsDocText(jsdocText: string): JsDocInfo {
  // Strip /** and */
  const inner = jsdocText.replace(/^\/\*\*/, "").replace(/\*\/$/, "");

  // Split into lines, stripping the leading ' * ' decoration
  const rawLines = inner.split("\n").map((line) =>
    line.replace(/^\s*\*\s?/, "").trimEnd(),
  );

  // Drop leading/trailing blank lines
  while (rawLines.length > 0 && rawLines[0].trim() === "") rawLines.shift();
  while (
    rawLines.length > 0 &&
    rawLines[rawLines.length - 1].trim() === ""
  ) {
    rawLines.pop();
  }

  // Collect description lines (everything before the first @tag)
  const descLines: string[] = [];
  let i = 0;
  while (i < rawLines.length && !rawLines[i].startsWith("@")) {
    descLines.push(rawLines[i]);
    i++;
  }
  while (descLines.length > 0 && descLines[descLines.length - 1].trim() === "") {
    descLines.pop();
  }

  // Parse @param, @returns, and @example tags
  const params: Array<{ name: string; type?: string; description: string }> = [];
  const examples: string[] = [];
  let returns: string | undefined;

  while (i < rawLines.length) {
    const line = rawLines[i];

    if (line.startsWith("@param")) {
      // Supports: @param name description  OR  @param {type} name description
      const match = line.match(/^@param\s+(?:\{([^}]+)\}\s+)?(\S+)\s*(.*)/);
      if (match) {
        params.push({
          type: match[1]?.trim(),
          name: match[2],
          description: match[3].trim(),
        });
      }
      i++;
    } else if (line.startsWith("@returns") || line.startsWith("@return ")) {
      // Supports: @returns {TypeName}  OR  @returns {TypeName} description
      const match = line.match(/^@returns?\s+\{([^}]+)\}/);
      if (match) {
        returns = match[1].trim();
      }
      i++;
    } else if (line.startsWith("@example")) {
      const exLines: string[] = [];
      const firstLine = line.replace(/^@example\s*/, "").trim();
      if (firstLine) exLines.push(firstLine);
      i++;
      while (i < rawLines.length && !rawLines[i].startsWith("@")) {
        exLines.push(rawLines[i]);
        i++;
      }
      // Trim trailing blank lines from example
      while (exLines.length > 0 && exLines[exLines.length - 1].trim() === "") {
        exLines.pop();
      }
      const exText = exLines.join("\n").trim();
      if (exText) examples.push(exText);
    } else {
      // Unrecognised tag — skip
      i++;
    }
  }

  const summary = descLines[0]?.trim() ?? "";
  // Description = everything after the first line (the full text beyond the summary).
  // Omit if nothing follows the summary.
  const restLines = descLines.slice(1);
  while (restLines.length > 0 && restLines[0].trim() === "") restLines.shift();
  const description =
    restLines.length > 0 ? restLines.join("\n").trimEnd() : undefined;

  return {
    summary,
    description,
    params,
    returns,
    examples,
  };
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

/**
 * Extract typed parameter information from a function's parameter list.
 */
function extractParams(
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
  source: string,
): ParamInfo[] {
  return parameters.map((p) => {
    const name = p.name.getText();
    const optional = !!p.questionToken || p.initializer !== undefined;
    const typeText = p.type
      ? source.substring(p.type.getStart(), p.type.getEnd())
      : "unknown";
    return { name, type: typeText, optional };
  });
}

/**
 * Walk the body of a namespace builder and collect every function passed as the
 * first argument to `withHelp(...)`.  Skips `Object.assign(...)` blocks so that
 * sub-commands (like errors.dismiss) are not mistakenly included.
 */
function extractCommandsFromBody(
  body: ts.Block | ts.Expression | undefined,
  source: string,
  sourceFile: ts.SourceFile,
  namespaceName: string,
): CommandEntry[] {
  if (!body) return [];

  const commands: CommandEntry[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;

      // Skip Object.assign — it is used for sub-commands we intentionally omit
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "Object" &&
        ts.isIdentifier(callee.name) &&
        callee.name.text === "assign"
      ) {
        return;
      }

      // Process withHelp(fn, meta) calls
      if (ts.isIdentifier(callee) && callee.text === "withHelp") {
        const firstArg = node.arguments[0];
        if (
          firstArg &&
          (ts.isFunctionExpression(firstArg) || ts.isArrowFunction(firstArg))
        ) {
          const fnExpr = firstArg as ts.FunctionExpression | ts.ArrowFunction;

          // Resolve the command name: prefer the function's own name, fall back
          // to the containing PropertyAssignment key.
          let name: string | undefined;
          if (ts.isFunctionExpression(fnExpr) && fnExpr.name) {
            name = fnExpr.name.text;
          } else {
            const parent = node.parent;
            if (parent && ts.isPropertyAssignment(parent)) {
              const key = parent.name;
              if (ts.isIdentifier(key)) name = key.text;
            }
          }

          if (!name) {
            console.warn(
              `  [WARN] Cannot determine name for withHelp() at pos ${node.pos} in @namespace ${namespaceName}`,
            );
            return;
          }

          const params = extractParams(fnExpr.parameters, source);

          const jsdocText = getLeadingJsDoc(source, firstArg, sourceFile);
          let jsdoc: JsDocInfo | undefined;
          if (jsdocText) {
            jsdoc = parseJsDocText(jsdocText);
          } else {
            console.warn(
              `  [WARN] No JSDoc for command '${name}' in @namespace '${namespaceName}' — generating minimal entry`,
            );
          }

          commands.push({ name, params, jsdoc });
          return; // Don't recurse INTO the withHelp call itself
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(body);
  return commands;
}

// ---------------------------------------------------------------------------
// File processing
// ---------------------------------------------------------------------------

/**
 * Parse a single namespace file and return all namespaces found inside it.
 */
export function processFile(filePath: string): NamespaceInfo[] {
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes=*/ true,
  );

  const results: NamespaceInfo[] = [];

  function visitTopLevel(node: ts.Node): void {
    // We only care about top-level function declarations
    if (ts.isFunctionDeclaration(node) && node.name) {
      const jsdoc = getLeadingJsDoc(source, node, sourceFile);
      if (jsdoc) {
        const namespaceName = getNamespaceTag(jsdoc);
        if (namespaceName) {
          const description = getNamespaceDescription(jsdoc);
          const commands = extractCommandsFromBody(
            node.body,
            source,
            sourceFile,
            namespaceName,
          );
          results.push({ namespaceName, description, commands });
          return; // Don't recurse inside the builder
        }
      }
    }
    ts.forEachChild(node, visitTopLevel);
  }

  ts.forEachChild(sourceFile, visitTopLevel);
  return results;
}

// ---------------------------------------------------------------------------
// Porcelain type doc types
// ---------------------------------------------------------------------------

export interface PorcelainPropertyInfo {
  name: string;
  type: string;
  description: string;
  readonly?: boolean;
}

export interface PorcelainMethodInfo {
  signature: string;
  summary: string;
}

export interface PorcelainTypeInfo {
  name: string;
  summary: string;
  description?: string;
  properties: PorcelainPropertyInfo[];
  methods: PorcelainMethodInfo[];
}

// ---------------------------------------------------------------------------
// Porcelain file processing
// ---------------------------------------------------------------------------

/**
 * Parse @prop {type} name desc lines from a JSDoc block.
 */
function parsePropTags(rawLines: string[]): PorcelainPropertyInfo[] {
  const props: PorcelainPropertyInfo[] = [];
  for (const line of rawLines) {
    // @prop {type} name description  OR  @prop {type} name? description
    const match = line.match(/^@prop\s+\{([^}]+)\}\s+(\S+?)\??\s+(.*)/);
    if (match) {
      props.push({ name: match[2], type: match[1].trim(), description: match[3].trim() });
    }
  }
  return props;
}

/**
 * Parse @method signature description lines from a JSDoc block.
 */
function parseMethodTags(rawLines: string[]): PorcelainMethodInfo[] {
  const methods: PorcelainMethodInfo[] = [];
  for (const line of rawLines) {
    // @method signature(args?) summary
    const match = line.match(/^@method\s+(\S+\([^)]*\)\??)\s+(.*)/);
    if (match) {
      methods.push({ signature: match[1], summary: match[2].trim() });
    }
  }
  return methods;
}

/**
 * Parse a @porcelain JSDoc block into a PorcelainTypeInfo.
 * Returns undefined if the block has no @porcelain tag.
 */
function parsePorcelainJsDoc(jsdocText: string): PorcelainTypeInfo | undefined {
  const porcelainMatch = jsdocText.match(/@porcelain\s+(\S+)/);
  if (!porcelainMatch) return undefined;
  const name = porcelainMatch[1];

  const inner = jsdocText.replace(/^\/\*\*/, "").replace(/\*\/$/, "");
  const rawLines = inner
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trimEnd());

  // Collect lines before the first @tag as description
  const descLines: string[] = [];
  let i = 0;
  while (i < rawLines.length && !rawLines[i].startsWith("@")) {
    descLines.push(rawLines[i]);
    i++;
  }
  while (descLines.length > 0 && descLines[0].trim() === "") descLines.shift();
  while (descLines.length > 0 && descLines[descLines.length - 1].trim() === "") descLines.pop();

  // Collect all @tag lines
  const tagLines: string[] = [];
  while (i < rawLines.length) {
    tagLines.push(rawLines[i]);
    i++;
  }

  // The summary is the description text that follows @porcelain TypeName on its own line
  // or on subsequent description lines. Since @porcelain TypeName IS a tag line, we treat
  // the first non-empty descLine as the summary if present; otherwise extract from the
  // @porcelain line's trailing text.
  let summary = descLines[0]?.trim() ?? "";
  if (!summary) {
    // No description before @porcelain — extract trailing text from the @porcelain line itself
    const trailingMatch = jsdocText.match(/@porcelain\s+\S+\s+(.*)/);
    summary = trailingMatch ? trailingMatch[1].trim() : name;
  }
  const restLines = descLines.slice(1);
  while (restLines.length > 0 && restLines[0].trim() === "") restLines.shift();
  const description = restLines.length > 0 ? restLines.join("\n").trimEnd() : undefined;

  // But wait — in our porcelain.ts format the summary comes AFTER @porcelain on the
  // NEXT line (not the @porcelain line). Let's re-check: description lines = lines before
  // first @. The @porcelain line IS a tag line, so the text between /** and @porcelain
  // goes into descLines. In porcelain.ts those lines are empty. The actual summary is the
  // line right after @porcelain. So re-extract summary from tag lines.
  const porcelainLineIdx = tagLines.findIndex((l) => l.startsWith("@porcelain"));
  if (porcelainLineIdx !== -1) {
    // Try inline text on the @porcelain line (after the type name)
    const inlineMatch = tagLines[porcelainLineIdx].match(/@porcelain\s+\S+\s+(.*)/);
    if (inlineMatch && inlineMatch[1].trim()) {
      summary = inlineMatch[1].trim();
    } else {
      // Look for next non-empty, non-@tag line as summary
      let j = porcelainLineIdx + 1;
      while (j < tagLines.length && tagLines[j].trim() === "") j++;
      if (j < tagLines.length && !tagLines[j].startsWith("@")) {
        summary = tagLines[j].trim();
      }
    }
  }

  const properties = parsePropTags(tagLines);
  const methods = parseMethodTags(tagLines);

  return { name, summary, description, properties, methods };
}

/**
 * Parse porcelain.ts and return all @porcelain type entries.
 */
export function processPorcelainFile(filePath: string): PorcelainTypeInfo[] {
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes=*/ true,
  );

  const results: PorcelainTypeInfo[] = [];

  function visitTopLevel(node: ts.Node): void {
    if (ts.isTypeAliasDeclaration(node)) {
      const jsdocText = getLeadingJsDoc(source, node, sourceFile);
      if (jsdocText) {
        const info = parsePorcelainJsDoc(jsdocText);
        if (info) results.push(info);
      }
    }
    ts.forEachChild(node, visitTopLevel);
  }

  ts.forEachChild(sourceFile, visitTopLevel);
  return results;
}

// ---------------------------------------------------------------------------
// Porcelain code generation
// ---------------------------------------------------------------------------

export function generatePorcelainFile(types: PorcelainTypeInfo[]): string {
  const lines: string[] = [
    "// This file is auto-generated by scripts/generate-help.ts",
    "// Do not edit manually — edit @porcelain JSDoc in src/renderer/results/porcelain.ts",
    "",
    'import type { TypeHelp } from "../help.js";',
    "",
    "export const porcelainTypeHelps: TypeHelp[] = [",
  ];

  for (const t of types) {
    lines.push("  {");
    lines.push(`    name: ${JSON.stringify(t.name)},`);
    lines.push(`    summary: ${serializeString(t.summary)},`);
    if (t.description) {
      lines.push(`    description: ${serializeString(t.description)},`);
    }
    if (t.properties.length > 0) {
      lines.push("    properties: [");
      for (const p of t.properties) {
        const parts = [
          `name: ${JSON.stringify(p.name)}`,
          `type: ${JSON.stringify(p.type)}`,
          `description: ${JSON.stringify(p.description)}`,
        ];
        if (p.readonly) parts.push("readonly: true");
        lines.push(`      { ${parts.join(", ")} },`);
      }
      lines.push("    ],");
    }
    if (t.methods.length > 0) {
      lines.push("    methods: [");
      for (const m of t.methods) {
        lines.push(`      { signature: ${JSON.stringify(m.signature)}, summary: ${JSON.stringify(m.summary)} },`);
      }
      lines.push("    ],");
    }
    lines.push("  },");
  }

  lines.push("];", "");
  return lines.join("\n");
}


function buildSignature(
  namespaceName: string,
  name: string,
  params: ParamInfo[],
): string {
  const prefix = namespaceName === "globals" ? "" : `${namespaceName}.`;
  const paramStr = params
    .map((p) => (p.optional ? `${p.name}?` : p.name))
    .join(", ");
  return `${prefix}${name}(${paramStr})`;
}

/** Serialize a multi-line string as a TypeScript template literal or quoted string. */
function serializeString(value: string): string {
  if (value.includes("\n")) {
    // Use a template literal for multi-line values
    const escaped = value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
    return `\`${escaped}\``;
  }
  return JSON.stringify(value);
}

export function generateFile(info: NamespaceInfo): string {
  const { namespaceName, description, commands } = info;
  const isGlobals = namespaceName === "globals";
  const exportName = isGlobals ? "globalCommands" : `${namespaceName}Commands`;
  const descExportName = isGlobals ? "globalDescription" : `${namespaceName}Description`;

  const lines: string[] = [
    "// This file is auto-generated by scripts/generate-help.ts",
    "// Do not edit manually — edit JSDoc in the source file instead",
    "",
    'import type { CommandHelp } from "../help.js";',
    "",
    `export const ${descExportName}: string = ${serializeString(description)};`,
    "",
    `export const ${exportName}: CommandHelp[] = [`,
  ];

  for (const cmd of commands) {
    const signature = buildSignature(namespaceName, cmd.name, cmd.params);
    const summary = cmd.jsdoc?.summary ?? "";

    lines.push("  {");
    lines.push(`    name: ${JSON.stringify(cmd.name)},`);
    lines.push(`    signature: ${JSON.stringify(signature)},`);
    lines.push(`    summary: ${serializeString(summary)},`);

    if (cmd.jsdoc?.description) {
      lines.push(`    description: ${serializeString(cmd.jsdoc.description)},`);
    }

    // Merge TypeScript param types with @param JSDoc descriptions
    const jsDocParamMap = new Map(
      (cmd.jsdoc?.params ?? []).map((p) => [p.name, p]),
    );
    const mergedParams = cmd.params.map((p) => {
      const jdp = jsDocParamMap.get(p.name);
      return {
        name: p.name,
        type: jdp?.type ?? p.type,
        description: jdp?.description ?? "",
        optional: p.optional,
      };
    });

    if (mergedParams.length > 0) {
      lines.push("    params: [");
      for (const param of mergedParams) {
        const parts: string[] = [
          `name: ${JSON.stringify(param.name)}`,
          `type: ${JSON.stringify(param.type)}`,
          `description: ${JSON.stringify(param.description)}`,
        ];
        if (param.optional) parts.push("optional: true");
        lines.push(`      { ${parts.join(", ")} },`);
      }
      lines.push("    ],");
    }

    if (cmd.jsdoc?.returns) {
      lines.push(`    returns: ${JSON.stringify(cmd.jsdoc.returns)},`);
    }

    if (cmd.jsdoc?.examples && cmd.jsdoc.examples.length > 0) {
      lines.push("    examples: [");
      for (const ex of cmd.jsdoc.examples) {
        lines.push(`      ${serializeString(ex)},`);
      }
      lines.push("    ],");
    }

    lines.push("  },");
  }

  lines.push("];", "");
  return lines.join("\n");
}
