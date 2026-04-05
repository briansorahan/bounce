#!/usr/bin/env node
/**
 * REPL artifact generator.
 *
 * Scans src/renderer/**\/*.ts for classes decorated with @namespace or @replType
 * and produces two output files in a single pass:
 *
 *   1. src/shared/repl-environment.d.ts
 *      Type declarations for the Language Service virtual project. For each
 *      @namespace class a `declare const <name>: { ... }` is emitted with the
 *      public method signatures extracted from AST.  For each @replType class
 *      an `interface <name> { ... }` is emitted.
 *      Only option types referenced directly in method signatures are resolved
 *      (one level deep).
 *
 *   2. src/shared/repl-registry.generated.ts
 *      Runtime metadata for the REPL Intelligence Layer.  A flat object keyed
 *      by "NamespaceName.methodName" carries summary, visibility, params, and
 *      returns extracted from @describe/@param decorator arguments.
 *      Build fails if any public method on a registered class is missing @describe.
 *
 * Run with: npx tsx scripts/generate-repl-artifacts.ts
 */

import * as ts from "typescript";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

function walk(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walk(full));
    } else if (full.endsWith(".ts") && !full.includes(".generated.")) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

function getDecorators(node: ts.Node): ts.Decorator[] {
  if (!ts.canHaveDecorators(node)) return [];
  return [...(ts.getDecorators(node) ?? [])];
}

function getDecoratorName(decorator: ts.Decorator): string | undefined {
  const expr = decorator.expression;
  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
    return expr.expression.text;
  }
  if (ts.isIdentifier(expr)) {
    return expr.text;
  }
  return undefined;
}

function getDecoratorByName(node: ts.Node, name: string): ts.Decorator | undefined {
  return getDecorators(node).find((d) => getDecoratorName(d) === name);
}

function getCallArgs(decorator: ts.Decorator): ts.NodeArray<ts.Expression> | undefined {
  if (ts.isCallExpression(decorator.expression)) {
    return decorator.expression.arguments;
  }
  return undefined;
}

function getStringLit(expr: ts.Expression | undefined): string | undefined {
  if (!expr) return undefined;
  if (ts.isStringLiteral(expr)) return expr.text;
  return undefined;
}

function getObjProp(
  obj: ts.ObjectLiteralExpression,
  key: string,
): ts.Expression | undefined {
  for (const prop of obj.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === key
    ) {
      return prop.initializer;
    }
  }
  return undefined;
}

function getObjPropString(
  obj: ts.ObjectLiteralExpression | undefined,
  key: string,
): string | undefined {
  if (!obj) return undefined;
  const val = getObjProp(obj, key);
  return getStringLit(val);
}

function getFirstObjArg(decorator: ts.Decorator): ts.ObjectLiteralExpression | undefined {
  const args = getCallArgs(decorator);
  if (!args || args.length === 0) return undefined;
  const first = args[0];
  return ts.isObjectLiteralExpression(first) ? first : undefined;
}

function getSecondObjArg(decorator: ts.Decorator): ts.ObjectLiteralExpression | undefined {
  const args = getCallArgs(decorator);
  if (!args || args.length < 2) return undefined;
  const second = args[1];
  return ts.isObjectLiteralExpression(second) ? second : undefined;
}

function isPublicMethod(member: ts.ClassElement): member is ts.MethodDeclaration {
  if (!ts.isMethodDeclaration(member)) return false;
  const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
  if (!modifiers || modifiers.length === 0) return true; // no modifiers = public by default
  return !modifiers.some(
    (m) =>
      m.kind === ts.SyntaxKind.PrivateKeyword ||
      m.kind === ts.SyntaxKind.ProtectedKeyword ||
      m.kind === ts.SyntaxKind.StaticKeyword,
  );
}

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

interface ParamMeta {
  name: string;
  summary: string;
  kind: string;
  expectedType?: string;
}

interface MethodMeta {
  methodName: string;
  summary: string;
  visibility: string;
  returns?: string;
  params: ParamMeta[];
  /** Raw TypeScript text of the method signature for .d.ts emission. */
  signatureText: string;
}

interface ClassMeta {
  registeredName: string;
  kind: "namespace" | "replType";
  summary: string;
  visibility: string;
  methods: MethodMeta[];
  /** File path — used in error messages. */
  filePath: string;
}

// ---------------------------------------------------------------------------
// Printer for method signature extraction
// ---------------------------------------------------------------------------

const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

function printMethodSignature(
  method: ts.MethodDeclaration,
  sf: ts.SourceFile,
): string {
  const name = method.name ? (ts.isIdentifier(method.name) ? method.name.text : "<computed>") : "";
  const params = method.parameters
    .map((p) => {
      const paramName = ts.isIdentifier(p.name) ? p.name.text : "_";
      const optional = p.questionToken ? "?" : "";
      const typeStr = p.type ? printer.printNode(ts.EmitHint.Unspecified, p.type, sf) : "unknown";
      return `${paramName}${optional}: ${typeStr}`;
    })
    .join(", ");
  const returnType = method.type
    ? printer.printNode(ts.EmitHint.Unspecified, method.type, sf)
    : "void";
  const isAsync =
    (ts.canHaveModifiers(method) ? ts.getModifiers(method) : undefined)?.some(
      (m) => m.kind === ts.SyntaxKind.AsyncKeyword,
    ) ?? false;
  const effectiveReturn = isAsync && !returnType.startsWith("Promise") ? `Promise<${returnType}>` : returnType;
  return `${name}(${params}): ${effectiveReturn};`;
}

// ---------------------------------------------------------------------------
// Collect @param decorators from a method (bottom-up → prepend for order)
// ---------------------------------------------------------------------------

function collectParamMetas(method: ts.MethodDeclaration): ParamMeta[] {
  const decorators = getDecorators(method).filter((d) => getDecoratorName(d) === "param");
  // Decorators run bottom-up; prepend to restore declaration order.
  const result: ParamMeta[] = [];
  for (const d of decorators) {
    const args = getCallArgs(d);
    if (!args || args.length < 2) continue;
    const paramName = getStringLit(args[0]) ?? "";
    const obj = ts.isObjectLiteralExpression(args[1]) ? args[1] : undefined;
    result.unshift({
      name: paramName,
      summary: getObjPropString(obj, "summary") ?? "",
      kind: getObjPropString(obj, "kind") ?? "plain",
      expectedType: getObjPropString(obj, "expectedType"),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main scan
// ---------------------------------------------------------------------------

function scanFile(sourceFile: ts.SourceFile, filePath: string): ClassMeta[] {
  const results: ClassMeta[] = [];

  function visit(node: ts.Node): void {
    if (!ts.isClassDeclaration(node)) {
      ts.forEachChild(node, visit);
      return;
    }

    const nsDecorator = getDecoratorByName(node, "namespace");
    const rtDecorator = getDecoratorByName(node, "replType");
    const decorator = nsDecorator ?? rtDecorator;
    if (!decorator) {
      ts.forEachChild(node, visit);
      return;
    }

    const kind: "namespace" | "replType" = nsDecorator ? "namespace" : "replType";
    const args = getCallArgs(decorator);
    if (!args || args.length < 2) return;

    const registeredName = getStringLit(args[0]) ?? node.name?.text ?? "";
    const metaObj = ts.isObjectLiteralExpression(args[1]) ? args[1] : undefined;
    const summary = getObjPropString(metaObj, "summary") ?? "";
    const visibility = getObjPropString(metaObj, "visibility") ?? "porcelain";

    const methods: MethodMeta[] = [];
    const errors: string[] = [];
    const rel = relative(process.cwd(), filePath);

    for (const member of node.members) {
      if (!isPublicMethod(member)) continue;
      if (!ts.isMethodDeclaration(member)) continue;

      const methodName = ts.isIdentifier(member.name) ? member.name.text : "<computed>";
      if (methodName === "constructor" || methodName === "help" || methodName === "toString") {
        continue;
      }

      const descDecorator = getDecoratorByName(member, "describe");
      if (!descDecorator) {
        errors.push(`  ${rel}: ${registeredName}.${methodName} — missing @describe`);
        continue;
      }

      const descObj = getFirstObjArg(descDecorator);
      const methodSummary = getObjPropString(descObj, "summary") ?? "";
      const methodVisibility = getObjPropString(descObj, "visibility") ?? "porcelain";
      const returns = getObjPropString(descObj, "returns");

      const paramMetas = collectParamMetas(member);
      const signatureText = printMethodSignature(member, sourceFile);

      methods.push({
        methodName,
        summary: methodSummary,
        visibility: methodVisibility,
        returns,
        params: paramMetas,
        signatureText,
      });
    }

    if (errors.length > 0) {
      console.error("\ngenerate-repl-artifacts: missing @describe on public methods:\n");
      for (const e of errors) console.error(e);
      console.error(`\n${errors.length} violation(s). Add @describe to each method above.`);
      process.exit(1);
    }

    results.push({ registeredName, kind, summary, visibility, methods, filePath });
  }

  visit(sourceFile);
  return results;
}

// ---------------------------------------------------------------------------
// Emit repl-environment.d.ts
// ---------------------------------------------------------------------------

function emitEnvFile(classes: ClassMeta[]): string {
  const lines: string[] = [
    "/**",
    " * REPL environment declarations for the Language Service utility process.",
    " * AUTO-GENERATED — do not edit by hand. Run `npm run generate:repl-artifacts`.",
    " */",
    "",
  ];

  for (const cls of classes) {
    const { registeredName, kind, methods } = cls;

    if (kind === "namespace") {
      lines.push(`declare const ${registeredName}: {`);
      for (const m of methods) {
        if (m.visibility === "plumbing") continue;
        lines.push(`  ${m.signatureText}`);
      }
      lines.push("};", "");
    } else {
      const publicMethods = methods.filter((m) => m.visibility !== "plumbing");
      if (publicMethods.length === 0) {
        lines.push("// eslint-disable-next-line @typescript-eslint/no-empty-object-type");
      }
      lines.push(`interface ${registeredName} {`);
      for (const m of publicMethods) {
        lines.push(`  ${m.signatureText}`);
      }
      lines.push("}", "");
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Emit repl-registry.generated.ts
// ---------------------------------------------------------------------------

function emitRegistryFile(classes: ClassMeta[]): string {
  const lines: string[] = [
    "/**",
    " * REPL registry metadata for the REPL Intelligence Layer.",
    " * AUTO-GENERATED — do not edit by hand. Run `npm run generate:repl-artifacts`.",
    " */",
    "",
    "export interface ReplRegistryEntry {",
    "  summary: string;",
    "  visibility: \"porcelain\" | \"plumbing\";",
    "  returns?: string;",
    "  params: Array<{",
    "    name: string;",
    "    summary: string;",
    "    kind: string;",
    "    expectedType?: string;",
    "  }>;",
    "}",
    "",
    "export const replRegistry: Record<string, ReplRegistryEntry> = {",
  ];

  for (const cls of classes) {
    for (const m of cls.methods) {
      const key = `${cls.registeredName}.${m.methodName}`;
      const paramsJson = JSON.stringify(m.params, null, 4)
        .split("\n")
        .map((l, i) => (i === 0 ? l : "    " + l))
        .join("\n");
      lines.push(`  ${JSON.stringify(key)}: {`);
      lines.push(`    summary: ${JSON.stringify(m.summary)},`);
      lines.push(`    visibility: ${JSON.stringify(m.visibility)},`);
      if (m.returns !== undefined) {
        lines.push(`    returns: ${JSON.stringify(m.returns)},`);
      }
      lines.push(`    params: ${paramsJson},`);
      lines.push("  },");
    }
  }

  lines.push("};", "");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const rendererDir = join(process.cwd(), "src/renderer");
  const files = walk(rendererDir);

  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ES2020,
    experimentalDecorators: true,
    strict: false,
    noEmit: true,
  });

  const allClasses: ClassMeta[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.fileName.startsWith(rendererDir)) continue;
    if (sourceFile.fileName.includes(".generated.")) continue;
    const classes = scanFile(sourceFile, sourceFile.fileName);
    allClasses.push(...classes);
  }

  if (allClasses.length === 0) {
    console.warn("generate-repl-artifacts: no @namespace or @replType classes found");
  }

  const envContent = emitEnvFile(allClasses);
  const registryContent = emitRegistryFile(allClasses);

  const envPath = join(process.cwd(), "src/shared/repl-environment.d.ts");
  const registryPath = join(process.cwd(), "src/shared/repl-registry.generated.ts");

  writeFileSync(envPath, envContent, "utf8");
  writeFileSync(registryPath, registryContent, "utf8");

  const nsCount = allClasses.filter((c) => c.kind === "namespace").length;
  const rtCount = allClasses.filter((c) => c.kind === "replType").length;
  const methodCount = allClasses.reduce((n, c) => n + c.methods.length, 0);

  console.log(
    `✓ generate-repl-artifacts: ${nsCount} namespace(s), ${rtCount} replType(s), ${methodCount} method(s)`,
  );
  console.log(`  → ${relative(process.cwd(), envPath)}`);
  console.log(`  → ${relative(process.cwd(), registryPath)}`);
}

main();
