/**
 * Language Service Manager — main-process lifecycle manager for the Language
 * Service utility process.
 *
 * Responsibilities:
 *   - Spawn and auto-restart the language service utility process
 *   - Expose a typed API for the REPL Intelligence Layer
 *   - Implement crash loop prevention (3 crashes in 60s → progressive fallback)
 *   - Forward health metrics; warn if memory exceeds threshold
 */

import { utilityProcess, MessageChannelMain, type UtilityProcess } from "electron";
import path from "path";
import type { CompletionContext } from "../shared/completion-context.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingRequest {
  resolve: (ctx: CompletionContext) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface HealthMetrics {
  memoryMb: number;
  avgParseMs: number;
  parseCount: number;
  errorCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CRASH_WINDOW_MS = 60_000;
const CRASH_THRESHOLD = 3;
const REQUEST_TIMEOUT_MS = 5_000;
const MEMORY_WARN_MB = 200;

// ---------------------------------------------------------------------------
// LanguageServiceManager
// ---------------------------------------------------------------------------

export class LanguageServiceManager {
  private process: UtilityProcess | null = null;
  private port: Electron.MessagePortMain | null = null;
  private isReady = false;
  private nextRequestId = 1;

  /** Pending parse requests awaiting a response from the utility process. */
  private pendingRequests = new Map<number, PendingRequest>();

  /** Accumulated session source (for replay after crash). */
  private sessionSources: string[] = [];

  /** Crash tracking for loop prevention. */
  private crashTimestamps: number[] = [];

  /** Current escalation state. */
  private escalationLevel: "full" | "incremental" | "clean-slate" | "disabled" = "full";

  /** One-time callbacks registered via onReady(). */
  private readyCallbacks: Array<() => void> = [];

  private scriptPath: string;

  constructor(scriptPath?: string) {
    this.scriptPath = scriptPath ?? path.join(import.meta.dirname!, "../utility/language-service-process.js");
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start(): void {
    this.spawnProcess();
  }

  shutdown(): void {
    this.isReady = false;
    this.rejectAllPending(new Error("Language service manager shut down"));

    this.port?.close();
    this.port = null;

    if (this.process) {
      const pid = this.process.pid;
      this.process.kill();
      this.process = null;
      if (pid !== undefined) {
        try { process.kill(pid, "SIGKILL"); } catch { /* already dead */ }
      }
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Parse a REPL buffer and return a CompletionContext.
   * If the service is not yet ready, waits up to REQUEST_TIMEOUT_MS for it to
   * become ready before dispatching, then falls back to a "none" context.
   */
  parse(buffer: string, cursor: number): Promise<CompletionContext> {
    if (this.escalationLevel === "disabled") {
      return Promise.resolve(this.noneContext(buffer, cursor));
    }
    if (!this.isReady) {
      return new Promise<CompletionContext>((resolve) => {
        const timer = setTimeout(
          () => resolve(this.noneContext(buffer, cursor)),
          REQUEST_TIMEOUT_MS,
        );
        this.onReady(() => {
          clearTimeout(timer);
          this.parse(buffer, cursor).then(resolve);
        });
      });
    }

    const requestId = this.nextRequestId++;

    return new Promise<CompletionContext>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve(this.noneContext(buffer, cursor));
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(requestId, { resolve, reject, timer });

      this.port?.postMessage({ type: "langservice:parse", requestId, buffer, cursor });
    });
  }

  /** Append a successfully executed REPL command to the virtual session. */
  sessionAppend(source: string): void {
    this.sessionSources.push(source);
    this.port?.postMessage({ type: "langservice:session-append", source });
  }

  /** Clear the virtual session (e.g. on env.clear() or project switch). */
  sessionReset(): void {
    this.sessionSources = [];
    this.port?.postMessage({ type: "langservice:session-reset" });
  }

  /** Restore the virtual session from persisted command history. */
  sessionRestore(sources: string[]): void {
    this.sessionSources = [...sources];
    this.port?.postMessage({ type: "langservice:session-restore", sources });
  }

  isServiceReady(): boolean {
    return this.isReady && this.escalationLevel !== "disabled";
  }

  /**
   * Register a one-time callback invoked when the language service first
   * signals ready. If the service is already ready, the callback fires
   * synchronously on the next tick.
   */
  onReady(cb: () => void): void {
    if (this.isReady) {
      setImmediate(cb);
    } else {
      this.readyCallbacks.push(cb);
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private spawnProcess(): void {
    const { port1, port2 } = new MessageChannelMain();
    this.port = port2;

    this.process = utilityProcess.fork(this.scriptPath, [], {
      serviceName: "bounce-language-service",
    });

    this.process.postMessage({ type: "init" }, [port1]);

    port2.on("message", (event) => this.handlePortMessage(event));
    port2.start();

    this.process.on("exit", (code) => this.handleProcessExit(code));
  }

  private handlePortMessage(event: Electron.MessageEvent): void {
    const data = event.data as {
      type: string;
      requestId?: number;
      context?: CompletionContext;
      ready?: boolean;
      memoryMb?: number;
      avgParseMs?: number;
      parseCount?: number;
      errorCount?: number;
    };

    switch (data.type) {
      case "langservice:ready":
        this.isReady = true;
        console.log("[LanguageServiceManager] Language service ready");
        for (const cb of this.readyCallbacks.splice(0)) cb();
        break;

      case "langservice:parse:response": {
        const pending = this.pendingRequests.get(data.requestId!);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(data.requestId!);
          pending.resolve(data.context!);
        }
        break;
      }

      case "langservice:status:response": {
        const pending = this.pendingRequests.get(data.requestId!);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(data.requestId!);
          // Treat as a parse response with a "none" context placeholder.
          pending.resolve({ buffer: "", cursor: 0, sessionVariables: [], position: { kind: "none" } });
        }
        break;
      }

      case "langservice:health": {
        const memoryMb = data.memoryMb ?? 0;
        if (memoryMb > MEMORY_WARN_MB) {
          console.warn(
            `[LanguageServiceManager] High memory usage: ${memoryMb}MB (threshold: ${MEMORY_WARN_MB}MB)`,
          );
        }
        break;
      }
    }
  }

  private handleProcessExit(code: number | null): void {
    const wasReady = this.isReady;
    this.isReady = false;
    this.port?.close();
    this.port = null;
    this.process = null;

    this.rejectAllPending(new Error(`Language service process exited (code ${code})`));

    if (code === 0 || !wasReady) {
      // Clean exit or process never became ready — don't restart
      return;
    }

    // Record crash
    const now = Date.now();
    this.crashTimestamps = this.crashTimestamps.filter((t) => now - t < CRASH_WINDOW_MS);
    this.crashTimestamps.push(now);

    const crashCount = this.crashTimestamps.length;
    console.error(
      `[LanguageServiceManager] Process crashed (code ${code}); crash count: ${crashCount}`,
    );

    if (crashCount >= CRASH_THRESHOLD) {
      this.escalate();
    } else {
      this.restart();
    }
  }

  private escalate(): void {
    if (this.escalationLevel === "full") {
      console.warn("[LanguageServiceManager] Escalating to incremental restore");
      this.escalationLevel = "incremental";
      this.restart();
    } else if (this.escalationLevel === "incremental") {
      console.warn("[LanguageServiceManager] Escalating to clean-slate mode");
      this.escalationLevel = "clean-slate";
      this.sessionSources = [];
      this.restart();
    } else {
      console.error("[LanguageServiceManager] Language service disabled after repeated crashes");
      this.escalationLevel = "disabled";
    }
  }

  private restart(): void {
    // Brief delay before restarting to avoid a busy-loop
    setTimeout(() => {
      console.log(`[LanguageServiceManager] Restarting (escalation: ${this.escalationLevel})`);
      this.spawnProcess();

      // Wait for ready before restoring session
      const waitReady = setInterval(() => {
        if (this.isReady) {
          clearInterval(waitReady);
          this.restoreSession();
        }
      }, 200);

      // Give up waiting after 30s
      setTimeout(() => clearInterval(waitReady), 30_000);
    }, 500);
  }

  private restoreSession(): void {
    if (this.escalationLevel === "clean-slate" || this.sessionSources.length === 0) return;

    if (this.escalationLevel === "full") {
      this.port?.postMessage({
        type: "langservice:session-restore",
        sources: this.sessionSources,
      });
    } else if (this.escalationLevel === "incremental") {
      // Feed sources one at a time; if the process crashes again, escalation will handle it.
      let i = 0;
      const sendNext = (): void => {
        if (i >= this.sessionSources.length) return;
        this.port?.postMessage({
          type: "langservice:session-append",
          source: this.sessionSources[i++],
        });
        setImmediate(sendNext);
      };
      sendNext();
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      // Resolve with none context rather than reject — completions gracefully degrade
      pending.resolve(this.noneContext("", 0));
      this.pendingRequests.delete(id);
    }
    void err; // suppress unused-variable warning
  }

  private noneContext(buffer: string, cursor: number): CompletionContext {
    return { buffer, cursor, sessionVariables: [], position: { kind: "none" } };
  }
}
