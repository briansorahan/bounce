/**
 * Language Service utility process entry point.
 *
 * Lifecycle:
 *   1. Main process forks this script via utilityProcess.fork().
 *   2. Main transfers a MessagePort to this process at startup.
 *   3. This process sets up a virtual TypeScript project and lazily initializes
 *      ts.createLanguageService() on the first langservice:parse request.
 *   4. Sends langservice:ready when the language service is initialized.
 *   5. Pushes langservice:health metrics every 30 seconds.
 *
 * Messages received from main (via MessagePort):
 *   { type: "langservice:parse", requestId: number, buffer: string, cursor: number }
 *   { type: "langservice:session-append", source: string }
 *   { type: "langservice:session-reset" }
 *   { type: "langservice:session-restore", sources: string[] }
 *   { type: "langservice:status", requestId: number }
 *
 * Messages sent to main (via MessagePort):
 *   { type: "langservice:ready" }
 *   { type: "langservice:parse:response", requestId: number, context: CompletionContext }
 *   { type: "langservice:status:response", requestId: number, ready: boolean }
 *   { type: "langservice:health", memoryMb: number, avgParseMs: number, parseCount: number, errorCount: number }
 */

import ts from "typescript";
import path from "path";
import { readFileSync, existsSync } from "node:fs";
import { MessagePort } from "worker_threads";
import type {
  CompletionContext,
  SessionVariable,
  CalleeInfo,
} from "../shared/completion-context.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_FILENAME = "bounce-session.ts";
const ENV_FILENAME = "repl-environment.d.ts";

// Path to the generated environment declarations (adjacent to this file in dist)
const ENV_FILE_PATH = path.resolve(__dirname, "../shared/repl-environment.d.ts");

// ---------------------------------------------------------------------------
// Parent port
// ---------------------------------------------------------------------------

const parentPort = (process as NodeJS.Process & { parentPort: Electron.ParentPort }).parentPort;

if (!parentPort) {
  console.error("[lang-service-process] No parentPort — must run as utility process");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let port: MessagePort | null = null;
let languageService: ts.LanguageService | null = null;
let isReady = false;
let sessionContent = "";

// Health metrics
let parseCount = 0;
let totalParseMs = 0;
let errorCount = 0;

// Virtual file store for the LanguageServiceHost
const fileContents = new Map<string, string>();
const fileVersions = new Map<string, number>();

// ---------------------------------------------------------------------------
// Virtual file helpers
// ---------------------------------------------------------------------------

function setVirtualFile(name: string, content: string): void {
  fileContents.set(name, content);
  fileVersions.set(name, (fileVersions.get(name) ?? 0) + 1);
}

function loadEnvFile(): string {
  try {
    if (existsSync(ENV_FILE_PATH)) {
      return readFileSync(ENV_FILE_PATH, "utf8");
    }
  } catch {
    // Environment file not yet generated; will be empty for now.
  }
  return "// repl-environment.d.ts not yet generated\n";
}

// ---------------------------------------------------------------------------
// Language Service initialization
// ---------------------------------------------------------------------------

function initLanguageService(): void {
  const envContent = loadEnvFile();
  setVirtualFile(ENV_FILENAME, envContent);
  setVirtualFile(SESSION_FILENAME, sessionContent);

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [SESSION_FILENAME, ENV_FILENAME],

    getScriptVersion: (fileName) => String(fileVersions.get(fileName) ?? 0),

    getScriptSnapshot: (fileName) => {
      const vContent = fileContents.get(fileName);
      if (vContent !== undefined) return ts.ScriptSnapshot.fromString(vContent);
      try {
        const disk = readFileSync(fileName, "utf8");
        return ts.ScriptSnapshot.fromString(disk);
      } catch {
        return undefined;
      }
    },

    getCurrentDirectory: () => process.cwd(),

    getCompilationSettings: (): ts.CompilerOptions => ({
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.None,
      strict: false,
      lib: ["es2020"],
      noEmit: true,
      allowJs: true,
    }),

    getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),

    fileExists: (fileName) => fileContents.has(fileName) || ts.sys.fileExists(fileName),

    readFile: (fileName) => fileContents.get(fileName) ?? ts.sys.readFile(fileName),

    readDirectory: ts.sys.readDirectory.bind(ts.sys),
    directoryExists: ts.sys.directoryExists.bind(ts.sys),
    getDirectories: ts.sys.getDirectories.bind(ts.sys),
  };

  languageService = ts.createLanguageService(host, ts.createDocumentRegistry());
  isReady = true;

  port?.postMessage({ type: "langservice:ready" });
  console.log("[lang-service-process] Language service initialized");
}

// ---------------------------------------------------------------------------
// CompletionContext extraction
// ---------------------------------------------------------------------------

function getSessionVariables(): SessionVariable[] {
  if (!languageService) return [];
  try {
    const completions = languageService.getCompletionsAtPosition(
      SESSION_FILENAME,
      sessionContent.length,
      {},
    );
    return (completions?.entries ?? [])
      .filter(
        (e) =>
          e.kind === ts.ScriptElementKind.constElement ||
          e.kind === ts.ScriptElementKind.letElement ||
          e.kind === ts.ScriptElementKind.variableElement,
      )
      .map((e) => {
        const quickInfo = languageService!.getQuickInfoAtPosition(
          SESSION_FILENAME,
          sessionContent.length,
        );
        // Extract type from quick info display parts
        const typeParts = quickInfo?.displayParts?.map((p) => p.text).join("") ?? "";
        const typeMatch = /:\s*(\S+)/.exec(typeParts);
        return { name: e.name, inferredType: typeMatch?.[1] };
      });
  } catch {
    return [];
  }
}

/**
 * Find the deepest AST node whose span contains the given position.
 */
function findNodeAtPos(sf: ts.SourceFile, pos: number): ts.Node {
  let found: ts.Node = sf;

  function visit(node: ts.Node): void {
    if (node.pos <= pos && pos <= node.end) {
      found = node;
      ts.forEachChild(node, visit);
    }
  }

  ts.forEachChild(sf, visit);
  return found;
}

/**
 * Walk up the parent chain to find an ancestor matching a predicate.
 */
function findAncestor(node: ts.Node, predicate: (n: ts.Node) => boolean): ts.Node | undefined {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (predicate(cur)) return cur;
    cur = cur.parent;
  }
  return undefined;
}

/**
 * Count how many completed arguments appear before the cursor in a CallExpression.
 */
function getArgIndex(call: ts.CallExpression, cursor: number): number {
  let idx = 0;
  for (const arg of call.arguments) {
    if (arg.end < cursor) {
      idx++;
    }
  }
  return idx;
}

/**
 * Extract callee info from a CallExpression node.
 */
function extractCalleeInfo(call: ts.CallExpression, cursor: number): CalleeInfo {
  const expr = call.expression;
  const paramIndex = getArgIndex(call, cursor);

  if (ts.isPropertyAccessExpression(expr)) {
    const parentName = ts.isIdentifier(expr.expression)
      ? expr.expression.text
      : undefined;
    return {
      name: expr.name.text,
      parentName,
      paramIndex,
    };
  }

  if (ts.isIdentifier(expr)) {
    return { name: expr.text, paramIndex };
  }

  return { name: "", paramIndex };
}

function extractContext(buffer: string, cursor: number): CompletionContext {
  const sessionVars = getSessionVariables();
  const base = { buffer, cursor, sessionVariables: sessionVars };

  // Clamp cursor to buffer length
  const safeBufferCursor = Math.min(cursor, buffer.length);

  // Create a scratch file: session + newline + buffer
  const prefix = sessionContent + "\n";
  const combined = prefix + buffer;
  const combinedCursor = prefix.length + safeBufferCursor;

  const sf = ts.createSourceFile("scratch.ts", combined, ts.ScriptTarget.Latest, true);
  const node = findNodeAtPos(sf, combinedCursor);

  // ── String literal ────────────────────────────────────────────────────────
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    const callExpr = findAncestor(node, ts.isCallExpression) as ts.CallExpression | undefined;
    if (callExpr) {
      const callee = extractCalleeInfo(callExpr, combinedCursor);
      const stringStart = node.getStart(sf) + 1; // +1 for opening quote
      const stringPrefix = combined.slice(stringStart, combinedCursor);
      return { ...base, position: { kind: "stringLiteral", callee, prefix: stringPrefix } };
    }
  }

  // ── Object literal key ────────────────────────────────────────────────────
  const objLiteral = findAncestor(
    node,
    (n) => ts.isObjectLiteralExpression(n),
  ) as ts.ObjectLiteralExpression | undefined;
  if (objLiteral) {
    const callExpr = findAncestor(objLiteral, ts.isCallExpression) as
      | ts.CallExpression
      | undefined;
    if (callExpr) {
      const callee = extractCalleeInfo(callExpr, combinedCursor);
      const alreadyPresentKeys = objLiteral.properties
        .filter(ts.isPropertyAssignment)
        .map((p) => (ts.isIdentifier(p.name) ? p.name.text : ""))
        .filter(Boolean);

      // The prefix is the identifier at cursor (if any)
      const keyPrefix = ts.isIdentifier(node) ? node.text : "";
      return {
        ...base,
        position: { kind: "objectLiteralKey", callee, alreadyPresentKeys, prefix: keyPrefix },
      };
    }
  }

  // ── Property access ───────────────────────────────────────────────────────
  if (ts.isPropertyAccessExpression(node)) {
    const objectName = ts.isIdentifier(node.expression) ? node.expression.text : "";
    const prefix = node.name.text;
    return { ...base, position: { kind: "propertyAccess", objectName, prefix } };
  }

  // Parent is PropertyAccessExpression and node is the name (Identifier after dot)
  if (ts.isIdentifier(node) && node.parent && ts.isPropertyAccessExpression(node.parent)) {
    const propAccess = node.parent as ts.PropertyAccessExpression;
    const objectName = ts.isIdentifier(propAccess.expression)
      ? (propAccess.expression as ts.Identifier).text
      : "";
    return {
      ...base,
      position: { kind: "propertyAccess", objectName, prefix: node.text },
    };
  }

  // ── Call argument ─────────────────────────────────────────────────────────
  const callExpr = findAncestor(node, ts.isCallExpression) as ts.CallExpression | undefined;
  if (callExpr) {
    const callee = extractCalleeInfo(callExpr, combinedCursor);
    const argPrefix = ts.isIdentifier(node) ? node.text : "";
    return { ...base, position: { kind: "callArgument", callee, prefix: argPrefix } };
  }

  // ── Identifier at root ────────────────────────────────────────────────────
  if (ts.isIdentifier(node)) {
    return { ...base, position: { kind: "identifier", prefix: node.text } };
  }

  // ── Check if just after a dot in the buffer ───────────────────────────────
  // Handles the case where the cursor is right after a dot and the AST
  // may not have resolved the property access node yet.
  const textBefore = buffer.slice(0, safeBufferCursor);
  const dotMatch = /(\w+)\.$/.exec(textBefore);
  if (dotMatch) {
    return {
      ...base,
      position: { kind: "propertyAccess", objectName: dotMatch[1], prefix: "" },
    };
  }

  // ── Identifier fallback ───────────────────────────────────────────────────
  const identMatch = /(\w*)$/.exec(textBefore);
  if (identMatch && identMatch[1].length > 0) {
    return { ...base, position: { kind: "identifier", prefix: identMatch[1] } };
  }

  return { ...base, position: { kind: "none" } };
}

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

type IncomingMessage = {
  type: string;
  requestId?: number;
  buffer?: string;
  cursor?: number;
  source?: string;
  sources?: string[];
};

function handlePortMessage(msg: { data: IncomingMessage }): void {
  const data = msg.data;

  switch (data.type) {
    case "langservice:parse": {
      // Lazy initialization on first parse request
      if (!languageService) {
        try {
          initLanguageService();
        } catch (err) {
          errorCount++;
          console.error("[lang-service-process] Language service init failed:", err);
          port?.postMessage({
            type: "langservice:parse:response",
            requestId: data.requestId,
            context: {
              buffer: data.buffer ?? "",
              cursor: data.cursor ?? 0,
              sessionVariables: [],
              position: { kind: "none" },
            } satisfies CompletionContext,
          });
          return;
        }
      }

      const start = Date.now();
      let context: CompletionContext;
      try {
        context = extractContext(data.buffer ?? "", data.cursor ?? 0);
      } catch (err) {
        errorCount++;
        console.error("[lang-service-process] extractContext error:", err);
        context = {
          buffer: data.buffer ?? "",
          cursor: data.cursor ?? 0,
          sessionVariables: [],
          position: { kind: "none" },
        };
      }

      const elapsed = Date.now() - start;
      parseCount++;
      totalParseMs += elapsed;

      port?.postMessage({
        type: "langservice:parse:response",
        requestId: data.requestId,
        context,
      });
      break;
    }

    case "langservice:session-append": {
      const src = data.source ?? "";
      sessionContent += (sessionContent ? "\n" : "") + src;
      if (languageService) {
        setVirtualFile(SESSION_FILENAME, sessionContent);
      }
      break;
    }

    case "langservice:session-reset": {
      sessionContent = "";
      if (languageService) {
        setVirtualFile(SESSION_FILENAME, "");
      }
      break;
    }

    case "langservice:session-restore": {
      const sources = data.sources ?? [];
      sessionContent = sources.join("\n");
      if (languageService) {
        setVirtualFile(SESSION_FILENAME, sessionContent);
      }
      break;
    }

    case "langservice:status": {
      port?.postMessage({
        type: "langservice:status:response",
        requestId: data.requestId,
        ready: isReady,
      });
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Health reporting
// ---------------------------------------------------------------------------

function reportHealth(): void {
  const memoryMb = process.memoryUsage().heapUsed / (1024 * 1024);
  const avgParseMs = parseCount > 0 ? totalParseMs / parseCount : 0;
  port?.postMessage({
    type: "langservice:health",
    memoryMb: Math.round(memoryMb * 10) / 10,
    avgParseMs: Math.round(avgParseMs * 10) / 10,
    parseCount,
    errorCount,
  });
}

setInterval(reportHealth, 30_000).unref();

// ---------------------------------------------------------------------------
// Startup: receive MessagePort from main process
// ---------------------------------------------------------------------------

parentPort.once("message", (event: Electron.MessageEvent) => {
  port = event.ports[0] as unknown as MessagePort;

  port.on("message", handlePortMessage);
  port.start();

  console.log("[lang-service-process] MessagePort connected");
});
