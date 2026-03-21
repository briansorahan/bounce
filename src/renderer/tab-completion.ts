import { BOUNCE_GLOBALS, COMPLETION_HIDDEN_GLOBALS } from "./repl-evaluator.js";
import { getCallablePropertyNames } from "./runtime-introspection.js";
import type { SampleHashCompletion } from "../shared/ipc-contract.js";

export type CompletionAction =
  | { kind: "accept"; newBuffer: string; newCursorPosition: number }
  | { kind: "redraw" };

type FsPathMethod = "ls" | "la" | "cd" | "walk" | "read";

type CompletionContext =
  | { kind: "global" }
  | { kind: "method" }
  | { kind: "path"; prefix: string }
  | { kind: "hash"; prefix: string; labels: Map<string, string> };

export class TabCompletion {
  private readonly candidates: string[];
  private matches: string[] = [];
  private selectedIndex: number = 0;
  private ghostLines: number = 0; // number of extra lines rendered below prompt
  private lastBuffer: string = "";
  private lastCursorPosition: number = 0;
  private context: CompletionContext = { kind: "global" };
  private api: Record<string, unknown> = {};
  private bindingsProvider: (() => Record<string, unknown>) | null = null;
  private updateRequestId: number = 0;

  constructor() {
    this.candidates = [...BOUNCE_GLOBALS].filter((g) => !COMPLETION_HIDDEN_GLOBALS.has(g)).sort();
  }

  setApi(api: Record<string, unknown>): void {
    this.api = api;
  }

  setBindingsProvider(bindingsProvider: () => Record<string, unknown>): void {
    this.bindingsProvider = bindingsProvider;
  }

  get matchCount(): number {
    return this.matches.length;
  }

  async update(buffer: string, cursorPosition: number): Promise<void> {
    this.lastBuffer = buffer;
    this.lastCursorPosition = cursorPosition;

    const requestId = ++this.updateRequestId;

    if (cursorPosition < buffer.length) {
      this.applyMatches(requestId, [], { kind: "global" });
      return;
    }

    const text = buffer.slice(0, cursorPosition);

    const hashContext = this.extractHashContext(text);
    if (hashContext !== null) {
      const completions = await this.getSampleHashMatches(hashContext.prefix);
      const labels = new Map<string, string>();
      const hashes: string[] = [];
      for (const c of completions) {
        const label = c.filePath?.split("/").pop() ?? "";
        labels.set(c.hash, label);
        hashes.push(c.hash);
      }
      this.applyMatches(requestId, hashes, { kind: "hash", prefix: hashContext.prefix, labels });
      return;
    }

    const pathContext = this.extractFsPathContext(text);
    if (pathContext !== null) {
      const matches = await this.getFsPathMatches(pathContext.method, pathContext.prefix);
      this.applyMatches(requestId, matches, { kind: "path", prefix: pathContext.prefix });
      return;
    }

    const dotMatch = text.match(/([A-Za-z_$][A-Za-z0-9_$]*)\.([A-Za-z_$][A-Za-z0-9_$]*)?$/);
    if (dotMatch) {
      const objName = dotMatch[1];
      const methodPrefix = dotMatch[2] ?? "";
      const obj = this.getCompletionBindings()[objName];
      if (obj && (typeof obj === "function" || typeof obj === "object")) {
        const methods = getCallablePropertyNames(obj)
          .filter((k) => k.startsWith(methodPrefix))
          .sort();
        if (methods.length > 0) {
          this.applyMatches(requestId, methods, { kind: "method" });
          return;
        }
      }
    }

    const prefix = this.extractPrefix(text);
    if (!prefix) {
      this.applyMatches(requestId, [], { kind: "global" });
      return;
    }

    this.applyMatches(
      requestId,
      this.candidates.filter((c) => c.startsWith(prefix)),
      { kind: "global" },
    );
  }

  handleTab(): CompletionAction | null {
    if (this.matches.length === 1) {
      return this.makeAcceptAction(this.matches[0]);
    }
    if (this.matches.length > 1) {
      return this.cycleSelection(1);
    }
    return null;
  }

  handleUp(): CompletionAction | null {
    if (this.matches.length > 1) {
      return this.cycleSelection(-1);
    }
    return null;
  }

  handleDown(): CompletionAction | null {
    if (this.matches.length > 1) {
      return this.cycleSelection(1);
    }
    return null;
  }

  handleEnter(): CompletionAction | null {
    if (this.matches.length > 1) {
      return this.makeAcceptAction(this.matches[this.selectedIndex]);
    }
    return null;
  }

  ghostText(): string {
    if (this.matches.length === 0) {
      this.ghostLines = 0;
      return "";
    }

    const prefix = this.getActivePrefix();
    const isStringArg = this.context.kind === "path" || this.context.kind === "hash";

    if (this.matches.length === 1) {
      const suffix = this.matches[0].slice(prefix.length) + (isStringArg ? "" : "()");
      this.ghostLines = 0;
      return `\x1b7\x1b[90m${suffix}\x1b[0m\x1b8`;
    }

    this.ghostLines = this.matches.length;
    let result = "\x1b7";
    for (let i = 0; i < this.matches.length; i++) {
      let label: string;
      if (this.context.kind === "hash") {
        const meta = this.context.labels.get(this.matches[i]) ?? "";
        label = meta ? `${this.matches[i]} ${meta}` : this.matches[i];
      } else {
        label = this.matches[i] + (isStringArg ? "" : "()");
      }
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
    this.lastCursorPosition = 0;
    this.context = { kind: "global" };
  }

  private getActivePrefix(): string {
    const text = this.lastBuffer.slice(0, this.lastCursorPosition);
    if (this.context.kind === "path") {
      return this.context.prefix;
    }
    if (this.context.kind === "hash") {
      return this.context.prefix;
    }
    if (this.context.kind === "method") {
      const m = text.match(/\.([A-Za-z_$][A-Za-z0-9_$]*)$/);
      return m ? m[1] : "";
    }
    return this.extractPrefix(text);
  }

  private extractPrefix(text: string): string {
    const m = text.match(/[A-Za-z_$][A-Za-z0-9_$]*$/);
    return m ? m[0] : "";
  }

  private getCompletionBindings(): Record<string, unknown> {
    return this.bindingsProvider ? this.bindingsProvider() : this.api;
  }

  private makeAcceptAction(fullName: string): CompletionAction {
    const prefix = this.getActivePrefix();
    const base = this.lastBuffer.slice(
      0,
      this.lastCursorPosition - prefix.length,
    );
    const after = this.lastBuffer.slice(this.lastCursorPosition);
    const isStringArg = this.context.kind === "path" || this.context.kind === "hash";
    const suffix = isStringArg ? "" : "()";
    const newBuffer = base + fullName + suffix + after;
    const newCursorPosition =
      base.length + fullName.length + (isStringArg ? 0 : 1);
    return { kind: "accept", newBuffer, newCursorPosition };
  }

  private cycleSelection(delta: number): CompletionAction {
    this.selectedIndex =
      (this.selectedIndex + delta + this.matches.length) % this.matches.length;
    return { kind: "redraw" };
  }

  private applyMatches(
    requestId: number,
    matches: string[],
    context: CompletionContext,
  ): void {
    if (requestId !== this.updateRequestId) {
      return;
    }

    const matchesChanged =
      this.matches.length !== matches.length ||
      this.matches.some((match, index) => match !== matches[index]);
    const contextChanged =
      this.context.kind !== context.kind ||
      (this.context.kind === "path" &&
        context.kind === "path" &&
        this.context.prefix !== context.prefix) ||
      (this.context.kind === "hash" &&
        context.kind === "hash" &&
        this.context.prefix !== context.prefix);

    if (matchesChanged || contextChanged) {
      this.selectedIndex = 0;
    } else if (matches.length === 0) {
      this.selectedIndex = 0;
    } else if (this.selectedIndex >= matches.length) {
      this.selectedIndex = matches.length - 1;
    }

    this.matches = matches;
    this.context = context;
  }

  private extractFsPathContext(text: string): { method: FsPathMethod; prefix: string } | null {
    const match = text.match(/\b(?:fs\.(ls|la|cd|walk)|sn\.read)\(\s*(["'])([^"']*)$/);
    if (!match) {
      return null;
    }

    return {
      method: (match[1] ?? "read") as FsPathMethod,
      prefix: match[3],
    };
  }

  private extractHashContext(text: string): { prefix: string } | null {
    const match = text.match(/\bsn\.load\(\s*(["'])([^"']*)$/);
    if (!match) {
      return null;
    }

    return { prefix: match[2] };
  }

  private async getFsPathMatches(method: FsPathMethod, prefix: string): Promise<string[]> {
    if (typeof window === "undefined") {
      return [];
    }

    return window.electron.fsCompletePath(method, prefix);
  }

  private async getSampleHashMatches(prefix: string): Promise<SampleHashCompletion[]> {
    if (typeof window === "undefined") {
      return [];
    }

    return window.electron.completeSampleHash(prefix);
  }
}
