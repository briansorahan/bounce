/**
 * Validator tests for the JSDoc-driven CommandHelp generator.
 *
 * These tests ensure that:
 *   1. Every namespace source file is annotated with @namespace
 *   2. Every @namespace tag has a corresponding generated file
 *   3. Generated CommandHelp entries agree with the actual function signatures
 *   4. Every namespace wired into bounce-api.ts is covered by the generator
 *   5. No generated file is stale relative to its source
 */

import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import type { CommandHelp } from "./renderer/help.js";
import { processFile, generateFile, processPorcelainFile, generatePorcelainFile, processOptsFile, type ParamInfo } from "./help-generator.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Derived from process.cwd() (same convention as the generator).
// Tests must be run from the repository root.
const NAMESPACES_DIR = join(process.cwd(), "src/renderer/namespaces");
const BOUNCE_API_PATH = join(process.cwd(), "src/renderer/bounce-api.ts");
const OPTS_DOCS_PATH = join(process.cwd(), "src/renderer/opts-docs.ts");
const PORCELAIN_SRC_PATH = join(process.cwd(), "src/renderer/results/porcelain.ts");
const PORCELAIN_GEN_PATH = join(process.cwd(), "src/renderer/results/porcelain-types.generated.ts");

// Files that live in the namespaces directory but are not namespace builders,
// OR that have already been migrated to the decorator-based registration system
// (see specs/repl-intelligence). These do not carry @namespace JSDoc tags.
const EXCLUDED_FILES = new Set(["types.ts", "index.ts", "sample-namespace.ts"]);

// No summary-skip set needed: Test 3 only checks the non-empty summary
// invariant for commands whose source function actually HAS JSDoc.
// Commands using manually curated arrays (corpus, globals, env, vis, etc.)
// do not have JSDoc on their withHelp functions, so src.jsdoc is undefined
// and the summary check is automatically skipped for them.

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Return all namespace source files (excluding generated files and non-namespace helpers). */
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

/**
 * Return all `@namespace <name>` tag values found on top-level
 * FunctionDeclarations in the given file.
 */
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
      `/** @namespace <name> */ JSDoc tag. Add one to the builder function.`,
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
        `generated file — expected ${genFileName}. ` +
        `Run \`npx tsx scripts/generate-help.ts\` to create it.`,
      );
      checks++;
    }
  }
  return checks;
}

// ---------------------------------------------------------------------------
// Test 3: Generated CommandHelp entries agree with source function signatures
// ---------------------------------------------------------------------------

async function testGeneratedMatchesSignatures(sourceFiles: string[]): Promise<number> {
  let checks = 0;

  for (const filePath of sourceFiles) {
    const namespaceInfos = processFile(filePath);

    for (const info of namespaceInfos) {
      const { namespaceName, commands: srcCommands } = info;
      const genPath = join(NAMESPACES_DIR, `${namespaceName}-commands.generated.ts`);
      if (!existsSync(genPath)) continue;

      // Dynamically import the generated .ts file (tsx resolves .ts via CJS hooks).
      const mod = (await import(genPath)) as Record<string, unknown>;
      const exportName =
        namespaceName === "globals" ? "globalCommands" : `${namespaceName}Commands`;
      const genCommands = mod[exportName] as CommandHelp[] | undefined;

      assert.ok(
        Array.isArray(genCommands),
        `Test 3 FAIL: ${basename(genPath)} — expected export \`${exportName}\` to be CommandHelp[]`,
      );
      checks++;

      // Build a name → source-command lookup for O(1) access.
      const srcByName = new Map(srcCommands.map(c => [c.name, c]));

      for (const gen of genCommands!) {
        const src = srcByName.get(gen.name);
        // A command present only in the generated file but missing from source
        // is a staleness problem caught by Test 5; skip it here.
        if (!src) continue;

        // 3a. Parameter count
        const genCount = gen.params?.length ?? 0;
        const srcCount = src.params.length;
        assert.equal(
          genCount,
          srcCount,
          `Test 3 FAIL: ${namespaceName}.${gen.name} — param count mismatch ` +
          `(source has ${srcCount}, generated has ${genCount})`,
        );
        checks++;

        // 3b. Parameter names and optionality
        if (gen.params) {
          for (let i = 0; i < gen.params.length; i++) {
            const gp = gen.params[i] as NonNullable<CommandHelp["params"]>[number];
            const sp = src.params[i] as ParamInfo;
            assert.equal(
              gp.name,
              sp.name,
              `Test 3 FAIL: ${namespaceName}.${gen.name} param[${i}] name — ` +
              `source: '${sp.name}', generated: '${gp.name}'`,
            );
            assert.equal(
              !!gp.optional,
              sp.optional,
              `Test 3 FAIL: ${namespaceName}.${gen.name} param '${gp.name}' optionality — ` +
              `source: ${String(sp.optional)}, generated: ${String(!!gp.optional)}`,
            );
            checks++;
          }
        }

        // 3c. Non-empty summary — only required when the source function has JSDoc.
        //     Commands backed by a manually curated CommandHelp array (corpus,
        //     globals, env, vis, …) don't have JSDoc on their withHelp functions,
        //     so src.jsdoc is undefined and we skip the check automatically.
        if (src.jsdoc !== undefined) {
          assert.ok(
            gen.summary.trim().length > 0,
            `Test 3 FAIL: ${namespaceName}.${gen.name} — source has JSDoc but ` +
            `the generated summary is empty. Check the JSDoc in ${basename(filePath)}.`,
          );
          checks++;
        }
      }
    }
  }

  return checks;
}

// ---------------------------------------------------------------------------
// Test 4: bounce-api.ts completeness — every wired namespace has @namespace
// ---------------------------------------------------------------------------

function testBounceApiCompleteness(): number {
  const source = readFileSync(BOUNCE_API_PATH, "utf8");
  let checks = 0;

  // Match non-type runtime imports from ./namespaces/<file>.js.
  // We use a negative lookahead to skip `import type { ... }` lines.
  const importRe =
    /^import\s+(?!type[\s{]).*?from\s+["']\.\/namespaces\/([^"']+)\.js["']/gm;

  const checkedFiles = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = importRe.exec(source)) !== null) {
    const nsFile = match[1]; // e.g. "fs-namespace"
    // types.ts is infrastructure; decorated-class namespaces are excluded from the
    // old JSDoc codegen checks (they use the repl-registry system instead).
    if (EXCLUDED_FILES.has(`${nsFile}.ts`) || checkedFiles.has(nsFile)) continue;
    checkedFiles.add(nsFile);

    const srcPath = join(NAMESPACES_DIR, `${nsFile}.ts`);
    if (!existsSync(srcPath)) continue;

    const nsNames = getNamespaceTagValues(srcPath);
    assert.ok(
      nsNames.length > 0,
      `Test 4 FAIL: bounce-api.ts imports from ${nsFile}.ts, but that file has ` +
      `no @namespace tag. Add a /** @namespace <name> */ tag to its builder function, ` +
      `or remove it from the REPL API if it is not a namespace.`,
    );
    checks++;
  }

  return checks;
}

// ---------------------------------------------------------------------------
// Test 5: Generated files are not stale
// ---------------------------------------------------------------------------

function testGeneratedFilesNotStale(sourceFiles: string[]): number {
  let checks = 0;

  const { typeRegistry: optsTypeRegistry } = processOptsFile(OPTS_DOCS_PATH);

  for (const filePath of sourceFiles) {
    const namespaceInfos = processFile(filePath);

    for (const info of namespaceInfos) {
      const { namespaceName } = info;
      const genPath = join(NAMESPACES_DIR, `${namespaceName}-commands.generated.ts`);
      if (!existsSync(genPath)) continue;

      const expected = generateFile(info, optsTypeRegistry);
      const actual = readFileSync(genPath, "utf8");

      assert.equal(
        actual,
        expected,
        `Test 5 FAIL: ${basename(genPath)} is stale — its content does not match ` +
        `what \`npx tsx scripts/generate-help.ts\` would generate from the current ` +
        `JSDoc in ${basename(filePath)}. Re-run the generator.`,
      );
      checks++;
    }
  }

  return checks;
}

// ---------------------------------------------------------------------------
// Test 6: porcelain-types.generated.ts is not stale
// ---------------------------------------------------------------------------

function testPorcelainFileNotStale(): number {
  if (!existsSync(PORCELAIN_GEN_PATH)) return 0;

  const { methodRegistry: methodOptsRegistry } = processOptsFile(OPTS_DOCS_PATH);
  const porcelainTypes = processPorcelainFile(PORCELAIN_SRC_PATH);
  const expected = generatePorcelainFile(porcelainTypes, methodOptsRegistry);
  const actual = readFileSync(PORCELAIN_GEN_PATH, "utf8");

  assert.equal(
    actual,
    expected,
    `Test 6 FAIL: porcelain-types.generated.ts is stale — its content does not match ` +
    `what \`npx tsx scripts/generate-help.ts\` would generate. Re-run the generator.`,
  );

  return 1;
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

  t = await testGeneratedMatchesSignatures(sourceFiles);
  total += t;
  console.log(`  Test 3 passed — generated signatures match source (${t} checks)`);

  t = testBounceApiCompleteness();
  total += t;
  console.log(`  Test 4 passed — all ${t} bounce-api.ts namespace imports are @namespace-tagged`);

  t = testGeneratedFilesNotStale(sourceFiles);
  total += t;
  console.log(`  Test 5 passed — all ${t} generated files are up-to-date`);

  t = testPorcelainFileNotStale();
  total += t;
  console.log(`  Test 6 passed — porcelain-types.generated.ts is up-to-date`);

  console.log(`help-codegen.test.ts: all ${total} checks passed`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
