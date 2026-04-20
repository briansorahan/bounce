/**
 * Meta-test: scans test source files for patterns known to cause flakiness.
 *
 * Each rule emits a list of violations. A violation includes the file, line
 * number, and the matched text so the author can decide whether to fix it or
 * add an exemption comment (// flaky-ok: <reason>).
 */

import * as fs from "fs";
import * as path from "path";
import * as assert from "assert";
import { test } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Violation {
  file: string;
  line: number;
  text: string;
  rule: string;
}

interface Rule {
  id: string;
  description: string;
  /** Glob-style filter: "e2e" = tests/*.spec.ts, "unit" = src/*.test.ts, "all" = both */
  scope: "e2e" | "unit" | "all";
  /** Return violations for a single file. */
  check(filePath: string, lines: string[]): Violation[];
}

const EXEMPT_COMMENT = "flaky-ok";

function isExempt(line: string): boolean {
  return line.includes(EXEMPT_COMMENT);
}

function collectFiles(scope: "e2e" | "unit" | "all"): string[] {
  const root = path.resolve(__dirname, "..");
  const files: string[] = [];

  if (scope === "e2e" || scope === "all") {
    const e2eDir = path.join(root, "tests");
    if (fs.existsSync(e2eDir)) {
      for (const f of fs.readdirSync(e2eDir)) {
        if (f.endsWith(".spec.ts")) files.push(path.join(e2eDir, f));
      }
    }
  }

  if (scope === "unit" || scope === "all") {
    // src/**/*.test.ts (non-recursive for now, matches current layout)
    const srcDir = path.join(root, "src");
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(dir, entry.name));
        else if (entry.name.endsWith(".test.ts"))
          files.push(path.join(dir, entry.name));
      }
    };
    walk(srcDir);
  }

  // Never scan ourselves
  return files.filter((f) => !f.endsWith("test-hygiene.test.ts"));
}

function runRules(rules: Rule[]): Violation[] {
  const violations: Violation[] = [];
  for (const rule of rules) {
    const files = collectFiles(rule.scope);
    for (const filePath of files) {
      const lines = fs.readFileSync(filePath, "utf-8").split("\n");
      violations.push(...rule.check(filePath, lines));
    }
  }
  return violations;
}

function rel(filePath: string): string {
  return path.relative(path.resolve(__dirname, ".."), filePath);
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const rules: Rule[] = [
  {
    id: "no-waitForTimeout",
    description:
      "waitForTimeout() with a hardcoded delay is timing-dependent and flaky under load. " +
      "Use waitForFunction(), toContainText(), or poll for a condition instead.",
    scope: "e2e",
    check(filePath, lines) {
      const violations: Violation[] = [];
      const pattern = /\.waitForTimeout\s*\(\s*\d+\s*\)/;
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i]) && !isExempt(lines[i])) {
          violations.push({
            file: rel(filePath),
            line: i + 1,
            text: lines[i].trim(),
            rule: this.id,
          });
        }
      }
      return violations;
    },
  },

  {
    id: "no-dirname-test-files",
    description:
      "Test files written to __dirname risk collisions in parallel runs. " +
      "Use os.tmpdir() or a unique temp directory instead.",
    scope: "e2e",
    check(filePath, lines) {
      const violations: Violation[] = [];
      // Match path.join(__dirname, "some-file.wav") that is then written to.
      // We flag a line if the path variable is later passed to createTestWavFile
      // or fs.writeFileSync within the same file. Read-only fixture references
      // (committed .wav files) are fine.
      const pathDefPattern = /(?:const|let|var)\s+(\w+)\s*=\s*path\.join\s*\(\s*__dirname\s*,\s*["'][^"']*\.(wav|mp3|ogg|flac|aac|m4a|mid)/;
      const fileText = lines.join("\n");
      for (let i = 0; i < lines.length; i++) {
        const match = pathDefPattern.exec(lines[i]);
        if (match && !isExempt(lines[i])) {
          const varName = match[1];
          // Check if this variable is used as a write target anywhere in the file
          const writePattern = new RegExp(
            `createTestWavFile\\s*\\(\\s*${varName}|writeFileSync\\s*\\(\\s*${varName}`,
          );
          if (writePattern.test(fileText)) {
            violations.push({
              file: rel(filePath),
              line: i + 1,
              text: lines[i].trim(),
              rule: this.id,
            });
          }
        }
      }
      return violations;
    },
  },

  {
    id: "no-unguarded-global-mock",
    description:
      "Setting globalThis.window without cleanup risks cross-test pollution. " +
      "Wrap in try/finally or save and restore the original value.",
    scope: "unit",
    check(filePath, lines) {
      const violations: Violation[] = [];
      const setPattern =
        /globalThis\.window\s*=|globalAny\.window\s*=|\(globalThis\s+as\s+[^)]+\)\.window\s*=|Object\.defineProperty\(\s*globalThis\s*,\s*["']window["']/;
      const cleanupPattern =
        /delete\s+(globalThis|globalAny)\.(window)|\.window\s*=\s*original|delete\s+\(globalThis/;

      let hasSet = false;
      let setLine = -1;
      let setText = "";
      let hasCleanup = false;

      for (let i = 0; i < lines.length; i++) {
        if (setPattern.test(lines[i]) && !isExempt(lines[i])) {
          hasSet = true;
          if (setLine === -1) {
            setLine = i + 1;
            setText = lines[i].trim();
          }
        }
        if (cleanupPattern.test(lines[i])) {
          hasCleanup = true;
        }
      }

      if (hasSet && !hasCleanup) {
        violations.push({
          file: rel(filePath),
          line: setLine,
          text: setText,
          rule: this.id,
        });
      }
      return violations;
    },
  },

  {
    id: "no-fragile-array-index",
    description:
      "Accessing samples by hardcoded index (e.g. samples[0]) is fragile " +
      "if load order changes. Prefer finding by name or hash.",
    scope: "e2e",
    check(filePath, lines) {
      const violations: Violation[] = [];
      // Match samples[0], samples[samples.length - 1], etc.
      const pattern = /samples\[\s*(\d+|samples\.length\s*-\s*\d+)\s*\]/;
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i]) && !isExempt(lines[i])) {
          violations.push({
            file: rel(filePath),
            line: i + 1,
            text: lines[i].trim(),
            rule: this.id,
          });
        }
      }
      return violations;
    },
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const violations = runRules(rules);

  if (violations.length === 0) {
    return;
  }

  console.error(`\ntest-hygiene: ${violations.length} violation(s) found\n`);

  // Group by rule
  const byRule = new Map<string, Violation[]>();
  for (const v of violations) {
    const list = byRule.get(v.rule) ?? [];
    list.push(v);
    byRule.set(v.rule, list);
  }

  for (const rule of rules) {
    const hits = byRule.get(rule.id);
    if (!hits) continue;
    console.error(`--- ${rule.id} (${hits.length}) ---`);
    console.error(`    ${rule.description}\n`);
    for (const v of hits) {
      console.error(`    ${v.file}:${v.line}`);
      console.error(`      ${v.text}\n`);
    }
  }

  console.error(
    "Add a // flaky-ok: <reason> comment to exempt intentional uses.\n"
  );

  throw new Error(`test-hygiene: ${violations.length} violation(s) found`);
}

test("test-hygiene: all rules pass", () => { main(); });
