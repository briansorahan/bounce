#!/usr/bin/env node
/**
 * JSDoc-driven CommandHelp generator.
 *
 * Scans src/renderer/namespaces/*.ts for builder functions tagged with
 * /** @namespace <name> *\/ and produces <name>-commands.generated.ts files
 * containing typed CommandHelp[] arrays populated from the functions'
 * JSDoc annotations.
 *
 * Run with:  npx tsx scripts/generate-help.ts
 *
 * Core logic lives in src/help-generator.ts so tests can import it without
 * triggering the side-effectful file-walking entrypoint here.
 */

import { writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
export type { ParamInfo, CommandEntry, NamespaceInfo, PorcelainTypeInfo, OptsTypeInfo, OptsTypeRegistry, MethodOptsRegistry } from "../src/help-generator.js";
export { processFile, generateFile, processPorcelainFile, generatePorcelainFile, processOptsFile } from "../src/help-generator.js";
import { processFile, generateFile, processPorcelainFile, generatePorcelainFile, processOptsFile } from "../src/help-generator.js";

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main(): void {
  const namespacesDir = join(process.cwd(), "src/renderer/namespaces");

  // ---------------------------------------------------------------------------
  // Load opts documentation registry
  // ---------------------------------------------------------------------------
  const optsSrc = join(process.cwd(), "src/renderer/opts-docs.ts");
  console.log("Scanning opts-docs.ts...");
  const { typeRegistry: optsTypeRegistry, methodRegistry: methodOptsRegistry } = processOptsFile(optsSrc);
  console.log(`  ✓ Loaded ${optsTypeRegistry.size} opts type(s)`);

  const files = readdirSync(namespacesDir).filter(
    (f) => f.endsWith(".ts") && !f.includes(".generated."),
  );

  let totalGenerated = 0;

  for (const file of files) {
    const filePath = join(namespacesDir, file);
    console.log(`Scanning ${file}...`);

    const namespaces = processFile(filePath);

    if (namespaces.length === 0) {
      // No @namespace-tagged builder found — skip silently
      continue;
    }

    for (const ns of namespaces) {
      if (ns.commands.length === 0) {
        console.log(
          `  [INFO] @namespace ${ns.namespaceName} found but no withHelp() commands detected`,
        );
        continue;
      }

      const output = generateFile(ns, optsTypeRegistry);
      const outFile = `${ns.namespaceName}-commands.generated.ts`;
      const outPath = join(namespacesDir, outFile);
      writeFileSync(outPath, output, "utf8");
      console.log(
        `  ✓ Generated ${outFile}  (${ns.commands.length} commands)`,
      );
      totalGenerated++;
    }
  }

  console.log(`\nDone. ${totalGenerated} file(s) generated.`);

  // ---------------------------------------------------------------------------
  // Porcelain type docs
  // ---------------------------------------------------------------------------
  const porcelainSrc = join(process.cwd(), "src/renderer/results/porcelain.ts");
  console.log("\nScanning porcelain.ts...");
  const porcelainTypes = processPorcelainFile(porcelainSrc);
  if (porcelainTypes.length === 0) {
    console.warn("  [WARN] No @porcelain types found in porcelain.ts");
  } else {
    const porcelainOutput = generatePorcelainFile(porcelainTypes, methodOptsRegistry);
    const porcelainOutPath = join(process.cwd(), "src/renderer/results/porcelain-types.generated.ts");
    writeFileSync(porcelainOutPath, porcelainOutput, "utf8");
    console.log(`  ✓ Generated porcelain-types.generated.ts  (${porcelainTypes.length} types)`);
  }
}

// Only run main() when this script is invoked directly (not when imported as a module).
if (process.argv[1] && /generate-help\.(ts|js)$/.test(process.argv[1])) {
  main();
}
