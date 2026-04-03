/**
 * Completeness validation for the Bounce REPL help system.
 *
 * Checks that every porcelain type, method, parameter, and property has
 * documentation. Fails fast with a clear message identifying the gap.
 *
 * Run with: tsx src/help-completeness.test.ts
 */

import assert from "node:assert/strict";
import { join } from "node:path";
import { processPorcelainFile, processOptsFile } from "./help-generator.js";

const PORCELAIN_SRC = join(process.cwd(), "src/renderer/results/porcelain.ts");
const OPTS_DOCS_PATH = join(process.cwd(), "src/renderer/opts-docs.ts");

const types = processPorcelainFile(PORCELAIN_SRC);
const { typeRegistry: optsTypeRegistry, methodRegistry: methodOptsRegistry } =
  processOptsFile(OPTS_DOCS_PATH);

let totalChecks = 0;
const failures: string[] = [];

function check(condition: boolean, message: string): void {
  totalChecks++;
  if (!condition) failures.push(message);
}

// ---------------------------------------------------------------------------
// Test 1: Every porcelain type has a non-empty summary
// ---------------------------------------------------------------------------

console.log("Test 1: Porcelain type summaries...");
for (const t of types) {
  check(
    t.summary.trim().length > 0,
    `${t.name}: missing summary`,
  );
}
console.log(`  checked ${types.length} types`);

// ---------------------------------------------------------------------------
// Test 2: Every porcelain property has a non-empty description
// ---------------------------------------------------------------------------

console.log("Test 2: Porcelain property descriptions...");
for (const t of types) {
  for (const p of t.properties) {
    check(
      p.description.trim().length > 0,
      `${t.name}.${p.name}: property missing description`,
    );
  }
}

// ---------------------------------------------------------------------------
// Test 3: Every porcelain method has a non-empty summary and a returns type
// ---------------------------------------------------------------------------

console.log("Test 3: Porcelain method summaries and return types...");
for (const t of types) {
  for (const m of t.methods) {
    check(
      m.summary.trim().length > 0,
      `${t.name}.${m.signature}: method missing summary`,
    );
    check(
      m.returns !== undefined && m.returns.trim().length > 0,
      `${t.name}.${m.signature}: method missing returns type (add → TypeName to the @method line)`,
    );
  }
}

// ---------------------------------------------------------------------------
// Test 4: Every non-trivial method parameter is documented
// ---------------------------------------------------------------------------
// "Non-trivial" means the method has params in its signature.
// Each param must be documented via:
//   - @methodparam (scalar params)
//   - opts registry (opts params, identified by name "opts")

console.log("Test 4: Porcelain method parameter documentation...");

function extractParamNames(signature: string): string[] {
  const match = signature.match(/\(([^)]*)\)/);
  if (!match || !match[1].trim()) return [];
  return match[1]
    .split(",")
    .map((p) => p.trim().replace(/\?$/, "").trim())
    .filter(Boolean);
}

for (const t of types) {
  for (const m of t.methods) {
    const paramNames = extractParamNames(m.signature);
    if (paramNames.length === 0) continue;

    for (const paramName of paramNames) {
      if (paramName === "opts") {
        // Must be in opts registry via @usedby
        const methodName = m.signature.split("(")[0];
        check(
          methodOptsRegistry.has(methodName),
          `${t.name}.${m.signature}: opts param not linked — add @usedby ${methodName} to the matching @opts block in opts-docs.ts`,
        );
      } else {
        // Must have a @methodparam entry
        const documented = m.params.some((p) => p.name === paramName);
        check(
          documented,
          `${t.name}.${m.signature}: param '${paramName}' missing — add @methodparam ${paramName} <description> after the @method line in porcelain.ts`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Test 5: Every namespace command param has a non-empty description
// ---------------------------------------------------------------------------

console.log("Test 5: Namespace command param descriptions...");

import { processFile } from "./help-generator.js";
import { readdirSync } from "node:fs";

const namespacesDir = join(process.cwd(), "src/renderer/namespaces");
const namespaceFiles = readdirSync(namespacesDir).filter(
  (f) => f.endsWith(".ts") && !f.includes(".generated."),
);

for (const file of namespaceFiles) {
  const filePath = join(namespacesDir, file);
  const namespaceInfos = processFile(filePath);
  for (const ns of namespaceInfos) {
    for (const cmd of ns.commands) {
      if (!cmd.jsdoc) continue; // skip commands without JSDoc (manually-curated)
      check(
        cmd.jsdoc.summary.trim().length > 0,
        `${ns.namespaceName}.${cmd.name}: command missing summary`,
      );
      for (const p of cmd.params) {
        const jdp = cmd.jsdoc.params.find((jp) => jp.name === p.name);
        const desc = jdp?.description ?? "";
        check(
          desc.trim().length > 0,
          `${ns.namespaceName}.${cmd.name}: param '${p.name}' missing description — add @param ${p.name} <description> in the JSDoc`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Test 6: Every opts type property has a non-empty description
// ---------------------------------------------------------------------------

console.log("Test 6: Opts property descriptions...");
for (const [typeName, optsInfo] of optsTypeRegistry) {
  check(
    optsInfo.summary.trim().length > 0,
    `${typeName}: opts type missing summary`,
  );
  for (const p of optsInfo.properties) {
    check(
      p.description.trim().length > 0,
      `${typeName}.${p.name}: opts property missing description`,
    );
  }
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`\nhelp-completeness.test.ts: ${failures.length} gap(s) found:\n`);
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  process.exit(1);
}

console.log(`\nhelp-completeness.test.ts: all ${totalChecks} completeness checks passed ✓`);
