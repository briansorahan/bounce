#!/usr/bin/env node
/**
 * Build-time validator for the decorator-based REPL registration system.
 *
 * Scans src/renderer/**\/*.ts for classes decorated with @namespace or @replType
 * and verifies that every public method has a @describe decorator. Exits non-zero
 * if any violations are found so the build pipeline fails fast.
 *
 * Run with: npx tsx scripts/validate-repl-descriptors.ts
 */

import * as ts from "typescript";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

interface Violation {
  file: string;
  className: string;
  methodName: string;
}

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

function hasDecorator(node: ts.Node, name: string): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (!modifiers) return false;
  return modifiers.some(
    (m) =>
      m.kind === ts.SyntaxKind.Decorator &&
      ts.isDecorator(m) &&
      getDecoratorName(m) === name,
  );
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

function isPublicMethod(member: ts.ClassElement): member is ts.MethodDeclaration {
  if (!ts.isMethodDeclaration(member)) return false;
  const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
  if (!modifiers) return true; // no modifiers = public by default
  return !modifiers.some(
    (m) =>
      m.kind === ts.SyntaxKind.PrivateKeyword ||
      m.kind === ts.SyntaxKind.ProtectedKeyword ||
      m.kind === ts.SyntaxKind.StaticKeyword,
  );
}

function validateFile(sourceFile: ts.SourceFile, filePath: string): Violation[] {
  const violations: Violation[] = [];
  const rel = relative(process.cwd(), filePath);

  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node)) {
      const isRegistered =
        hasDecorator(node, "namespace") || hasDecorator(node, "replType");

      if (isRegistered) {
        const className = node.name?.text ?? "<anonymous>";
        for (const member of node.members) {
          if (isPublicMethod(member)) {
            const methodName = ts.isIdentifier(member.name)
              ? member.name.text
              : "<computed>";
            // Skip TypeScript-injected lifecycle methods
            if (methodName === "constructor") continue;
            if (!hasDecorator(member, "describe")) {
              violations.push({ file: rel, className, methodName });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function main(): void {
  const rendererDir = join(process.cwd(), "src/renderer");
  const files = walk(rendererDir);

  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ES2020,
    experimentalDecorators: true,
    strict: true,
    noEmit: true,
  });

  const allViolations: Violation[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.fileName.startsWith(rendererDir)) continue;
    if (sourceFile.fileName.includes(".generated.")) continue;
    const violations = validateFile(sourceFile, sourceFile.fileName);
    allViolations.push(...violations);
  }

  if (allViolations.length === 0) {
    console.log("✓ validate-repl-descriptors: all registered classes fully decorated");
    process.exit(0);
  }

  console.error("✗ validate-repl-descriptors: missing @describe on public methods:\n");
  for (const v of allViolations) {
    console.error(`  ${v.file}: ${v.className}.${v.methodName}`);
  }
  console.error(`\n${allViolations.length} violation(s) found. Add @describe to each method above.`);
  process.exit(1);
}

main();
