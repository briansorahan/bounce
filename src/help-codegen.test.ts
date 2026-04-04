/**
 * Validator tests for the JSDoc-driven CommandHelp generator (legacy globals.ts).
 *
 * These tests ensure that:
 *   1. Every remaining JSDoc namespace source file is annotated with @namespace
 *   2. Every @namespace tag has a corresponding generated file
 *   3. Every namespace wired into bounce-api.ts (non-decorator) is covered
 */

import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NAMESPACES_DIR = join(process.cwd(), "src/renderer/namespaces");
const BOUNCE_API_PATH = join(process.cwd(), "src/renderer/bounce-api.ts");

// Files that have been migrated to the decorator-based registration system
// or are infrastructure files (not namespace builders).
const EXCLUDED_FILES = new Set([
  "types.ts", "index.ts",
  "sample-namespace.ts", "pat-namespace.ts", "transport-namespace.ts",
  "corpus-namespace.ts", "fs-namespace.ts", "project-namespace.ts",
  "env-namespace.ts", "vis-namespace.ts", "instrument-namespace.ts",
  "midi-namespace.ts", "mixer-namespace.ts",
]);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function getNamespaceSourceFiles(): string[] {
  return readdirSync(NAMESPACES_DIR)
    .filter(f =>
      f.endsWith(".ts") &&
      !f.includes(".generated.") &&
      !EXCLUDED_FILES.has(f),
    )
    .sort()
    .map(f => join(NAMESPACES_DIR, f));
}

function getNamespaceTagValues(filePath: string): string[] {
  const source = readFileSync(filePath, "utf8");
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const result: string[] = [];

  ts.forEachChild(sf, node => {
    if (!ts.isFunctionDeclaration(node)) return;
    for (const tag of ts.getJSDocTags(node)) {
      if (tag.tagName.text !== "namespace") continue;
      const raw = tag.comment;
      let name: string;
      if (typeof raw === "string") {
        name = raw.trim();
      } else if (Array.isArray(raw)) {
        name = (raw as Array<{ text?: string }>)
          .map(c => c.text ?? "")
          .join("")
          .trim();
      } else {
        name = "";
      }
      if (name) result.push(name);
    }
  });

  return result;
}

// ---------------------------------------------------------------------------
// Test 1: Every namespace source file has a @namespace tag
// ---------------------------------------------------------------------------

function testEveryFileHasNamespaceTag(sourceFiles: string[]): number {
  let checks = 0;
  for (const filePath of sourceFiles) {
    const fileName = basename(filePath);
    const namespaces = getNamespaceTagValues(filePath);
    assert.ok(
      namespaces.length > 0,
      `Test 1 FAIL: ${fileName} — no top-level FunctionDeclaration carries a ` +
      `/** @namespace <name> */ JSDoc tag.`,
    );
    checks++;
  }
  return checks;
}

// ---------------------------------------------------------------------------
// Test 2: Every @namespace tag has a generated file on disk
// ---------------------------------------------------------------------------

function testGeneratedFilesExist(sourceFiles: string[]): number {
  let checks = 0;
  for (const filePath of sourceFiles) {
    const nsNames = getNamespaceTagValues(filePath);
    for (const nsName of nsNames) {
      const genFileName = `${nsName}-commands.generated.ts`;
      const genPath = join(NAMESPACES_DIR, genFileName);
      assert.ok(
        existsSync(genPath),
        `Test 2 FAIL: @namespace ${nsName} (in ${basename(filePath)}) has no ` +
        `generated file — expected ${genFileName}.`,
      );
      checks++;
    }
  }
  return checks;
}

// ---------------------------------------------------------------------------
// Test 3: bounce-api.ts completeness — every wired non-decorator namespace has @namespace
// ---------------------------------------------------------------------------

function testBounceApiCompleteness(): number {
  const source = readFileSync(BOUNCE_API_PATH, "utf8");
  let checks = 0;

  const importRe =
    /^import\s+(?!type[\s{]).*?from\s+["']\.\/namespaces\/([^"']+)\.js["']/gm;

  const checkedFiles = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = importRe.exec(source)) !== null) {
    const nsFile = match[1];
    if (EXCLUDED_FILES.has(`${nsFile}.ts`) || checkedFiles.has(nsFile)) continue;
    checkedFiles.add(nsFile);

    const srcPath = join(NAMESPACES_DIR, `${nsFile}.ts`);
    if (!existsSync(srcPath)) continue;

    const nsNames = getNamespaceTagValues(srcPath);
    assert.ok(
      nsNames.length > 0,
      `Test 3 FAIL: bounce-api.ts imports from ${nsFile}.ts, but that file has ` +
      `no @namespace tag.`,
    );
    checks++;
  }

  return checks;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const sourceFiles = getNamespaceSourceFiles();
  let total = 0;
  let t: number;

  console.log("help-codegen.test.ts:");
  console.log(`  Scanning ${sourceFiles.length} namespace source files in ${NAMESPACES_DIR}`);

  t = testEveryFileHasNamespaceTag(sourceFiles);
  total += t;
  console.log(`  Test 1 passed — all ${t} source files have a @namespace tag`);

  t = testGeneratedFilesExist(sourceFiles);
  total += t;
  console.log(`  Test 2 passed — all ${t} @namespace tags have a generated file`);

  t = testBounceApiCompleteness();
  total += t;
  console.log(`  Test 3 passed — all ${t} bounce-api.ts namespace imports are @namespace-tagged`);

  console.log(`help-codegen.test.ts: all ${total} checks passed`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
