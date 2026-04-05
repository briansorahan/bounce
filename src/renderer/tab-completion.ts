import type { PredictionResult } from "../shared/completer.js";

export type CompletionAction =
  | { kind: "accept"; newBuffer: string; newCursorPosition: number }
  | { kind: "redraw" };

const DEBOUNCE_MS = 150;
const TRIGGER_CHARS = new Set([".", "(", "{"]);

/**
 * Tab completion powered by the REPL Intelligence Layer via IPC.
 *
 * update() sends a debounced completion:request to the main process (or fires
 * immediately for trigger characters and explicit Tab/Up/Down presses).
 * When results arrive the onMatchesChanged callback triggers a ghost text
 * re-render in app.ts without blocking the prompt display.
 */
export class TabCompletion {
  private matches: PredictionResult[] = [];
  private selectedIndex = 0;
  private ghostLines = 0;
  private lastBuffer = "";
  private lastCursor = 0;
  private updateRequestId = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingResolve: (() => void) | null = null;
  private onMatchesChangedCb: (() => void) | null = null;

  /** @deprecated No-op — kept for call-site compatibility during Phase 5 migration. */
  setApi(_api: Record<string, unknown>): void {}

  /** @deprecated No-op — kept for call-site compatibility during Phase 5 migration. */
  setBindingsProvider(_provider: () => Record<string, unknown>): void {}

  /**
   * Register a callback invoked when IPC results arrive and ghost text should
   * be refreshed. Called from app.ts constructor.
   */
  setOnMatchesChanged(cb: () => void): void {
    this.onMatchesChangedCb = cb;
  }

  get matchCount(): number {
    return this.matches.length;
  }

  /**
   * Request completions for the current buffer/cursor position.
   *
   * When immediate=true (trigger chars, Tab, Up/Down): fires IPC immediately;
   * returns a Promise that resolves once results have been applied.
   *
   * When immediate=false (normal keystrokes): debounces DEBOUNCE_MS ms;
   * returns a Promise that resolves after debounce + IPC. The onMatchesChanged
   * callback fires when results arrive so app.ts can re-render ghost text.
   */
  update(buffer: string, cursor: number, immediate = false): Promise<void> {
    this.lastBuffer = buffer;
    this.lastCursor = cursor;

    // Cancel any in-flight debounce and resolve its waiting Promise
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.pendingResolve) {
      this.pendingResolve();
      this.pendingResolve = null;
    }

    // Empty buffer — no completions
    if (!buffer || cursor === 0) {
      this.applyResults(++this.updateRequestId, []);
      return Promise.resolve();
    }

    const lastChar = buffer[cursor - 1];
    const isTrigger = immediate || (lastChar !== undefined && TRIGGER_CHARS.has(lastChar));

    if (isTrigger) {
      return this.fireRequest(buffer, cursor);
    }

    return new Promise<void>((resolve) => {
      this.pendingResolve = resolve;
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        this.pendingResolve = null;
        this.fireRequest(this.lastBuffer, this.lastCursor).then(resolve, resolve);
      }, DEBOUNCE_MS);
    });
  }

  handleTab(): CompletionAction | null {
    if (this.matches.length === 1) return this.makeAcceptAction(this.matches[0]);
    if (this.matches.length > 1) return this.cycleSelection(1);
    return null;
  }

  handleUp(): CompletionAction | null {
    if (this.matches.length > 1) return this.cycleSelection(-1);
    return null;
  }

  handleDown(): CompletionAction | null {
    if (this.matches.length > 1) return this.cycleSelection(1);
    return null;
  }

  handleEnter(): CompletionAction | null {
    if (this.matches.length > 1) return this.makeAcceptAction(this.matches[this.selectedIndex]);
    return null;
  }

  ghostText(): string {
    if (this.matches.length === 0) {
      this.ghostLines = 0;
      return "";
    }

    const prefix = this.getActivePrefix();

    if (this.matches.length === 1) {
      const match = this.matches[0];
      const rest = match.label.slice(prefix.length);
      const suffix = this.needsSuffix(match) ? "()" : "";
      this.ghostLines = 0;
      return `\x1b7\x1b[90m${rest}${suffix}\x1b[0m\x1b8`;
    }

    this.ghostLines = this.matches.length;
    let result = "\x1b7";
    for (let i = 0; i < this.matches.length; i++) {
      const match = this.matches[i];
      const suffix = this.needsSuffix(match) ? "()" : "";
      const detail = match.detail ? ` ${match.detail}` : "";
      const label = `${match.label}${suffix}${detail}`;
      if (i === this.selectedIndex) {
        result += `\r\n\x1b[1;36m> ${label}\x1b[0m`;
      } else {
        result += `\r\n\x1b[90m  ${label}\x1b[0m`;
      }
    }
    result += "\x1b8";
    return result;
  }

  eraseGhostText(): string {
    if (this.ghostLines === 0) return "";
    let result = "\x1b7";
    for (let i = 0; i < this.ghostLines; i++) {
      result += "\r\n\x1b[2K";
    }
    result += "\x1b8";
    this.ghostLines = 0;
    return result;
  }

  reset(): void {
    this.matches = [];
    this.selectedIndex = 0;
    this.ghostLines = 0;
    this.lastBuffer = "";
    this.lastCursor = 0;
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.pendingResolve) {
      this.pendingResolve();
      this.pendingResolve = null;
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async fireRequest(buffer: string, cursor: number): Promise<void> {
    const requestId = ++this.updateRequestId;

    const api = typeof window !== "undefined"
      ? (window.electron as typeof window.electron & {
          requestCompletion?: (b: string, c: number, id: number) => Promise<PredictionResult[]>;
        })
      : undefined;

    if (!api?.requestCompletion) {
      this.applyResults(requestId, []);
      return;
    }

    try {
      const results = await api.requestCompletion(buffer, cursor, requestId);
      this.applyResults(requestId, results);
    } catch {
      this.applyResults(requestId, []);
    }
  }

  private applyResults(requestId: number, results: PredictionResult[]): void {
    if (requestId !== this.updateRequestId) return;

    const changed =
      this.matches.length !== results.length ||
      this.matches.some((m, i) => m.label !== results[i]?.label);

    if (changed || results.length === 0) {
      this.selectedIndex = 0;
    } else if (this.selectedIndex >= results.length) {
      this.selectedIndex = results.length - 1;
    }

    this.matches = results;
    this.onMatchesChangedCb?.();
  }

  private cycleSelection(delta: number): CompletionAction {
    this.selectedIndex =
      (this.selectedIndex + delta + this.matches.length) % this.matches.length;
    return { kind: "redraw" };
  }

  private makeAcceptAction(match: PredictionResult): CompletionAction {
    const prefix = this.getActivePrefix();
    const insertText = match.insertText ?? match.label;
    const base = this.lastBuffer.slice(0, this.lastCursor - prefix.length);
    const after = this.lastBuffer.slice(this.lastCursor);
    const suffix = this.needsSuffix(match) ? "()" : "";
    const newBuffer = base + insertText + suffix + after;
    const newCursorPosition = base.length + insertText.length + (suffix === "()" ? 1 : 0);
    return { kind: "accept", newBuffer, newCursorPosition };
  }

  private needsSuffix(match: PredictionResult): boolean {
    return match.kind === "namespace" || match.kind === "method" || match.kind === "type";
  }

  /**
   * Determine the prefix that the active completion replaces. Must match
   * makeAcceptAction's slice logic exactly so Tab-accept positions the cursor
   * correctly.
   */
  private getActivePrefix(): string {
    const text = this.lastBuffer.slice(0, this.lastCursor);
    // String literal: prefix is the content after the last quote character
    const strMatch = /['"]([\w./~-]*)$/.exec(text);
    if (strMatch) return strMatch[1];
    // Property access: prefix is the identifier after the dot (possibly empty)
    const dotMatch = /\.([A-Za-z_$][A-Za-z0-9_$]*)$/.exec(text);
    if (dotMatch) return dotMatch[1];
    if (/[A-Za-z_$][A-Za-z0-9_$]*\.$/.test(text)) return "";
    // Identifier
    const identMatch = /([A-Za-z_$][A-Za-z0-9_$]*)$/.exec(text);
    return identMatch ? identMatch[1] : "";
  }
}
