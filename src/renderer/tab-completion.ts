import { BOUNCE_GLOBALS } from "./repl-evaluator.js";

export type CompletionAction =
  | { kind: "accept"; newBuffer: string; newCursorPosition: number }
  | { kind: "redraw" };

type FsPathMethod = "ls" | "la" | "cd" | "walk";

type CompletionContext =
  | { kind: "global" }
  | { kind: "method" }
  | { kind: "path"; prefix: string };

export class TabCompletion {
  private readonly candidates: string[];
  private matches: string[] = [];
  private selectedIndex: number = 0;
  private ghostLines: number = 0; // number of extra lines rendered below prompt
  private lastBuffer: string = "";
  private lastCursorPosition: number = 0;
  private context: CompletionContext = { kind: "global" };
  private api: Record<string, unknown> = {};
  private updateRequestId: number = 0;

  constructor() {
    this.candidates = [...BOUNCE_GLOBALS].sort();
  }

  setApi(api: Record<string, unknown>): void {
    this.api = api;
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

    const pathContext = this.extractFsPathContext(text);
    if (pathContext !== null) {
      const matches = await this.getFsPathMatches(pathContext.method, pathContext.prefix);
      this.applyMatches(requestId, matches, { kind: "path", prefix: pathContext.prefix });
      return;
    }

    const dotMatch = text.match(/([a-zA-Z][a-zA-Z0-9]*)\.([a-zA-Z][a-zA-Z0-9]*)?$/);
    if (dotMatch) {
      const objName = dotMatch[1];
      const methodPrefix = dotMatch[2] ?? "";
      const obj = this.api[objName];
      if (obj && (typeof obj === "function" || typeof obj === "object")) {
        const methods = this.getCallablePropertyNames(obj)
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

    if (this.matches.length === 1) {
      const suffix = this.matches[0].slice(prefix.length) + (this.context.kind === "path" ? "" : "()");
      this.ghostLines = 0;
      return `\x1b7\x1b[90m${suffix}\x1b[0m\x1b8`;
    }

    this.ghostLines = this.matches.length;
    let result = "\x1b7";
    for (let i = 0; i < this.matches.length; i++) {
      const label = this.matches[i] + (this.context.kind === "path" ? "" : "()");
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
    if (this.context.kind === "method") {
      const m = text.match(/\.([a-zA-Z][a-zA-Z0-9]*)$/);
      return m ? m[1] : "";
    }
    return this.extractPrefix(text);
  }

  private extractPrefix(text: string): string {
    const m = text.match(/[a-zA-Z][a-zA-Z0-9]*$/);
    return m ? m[0] : "";
  }

  private makeAcceptAction(fullName: string): CompletionAction {
    const prefix = this.getActivePrefix();
    const base = this.lastBuffer.slice(
      0,
      this.lastCursorPosition - prefix.length,
    );
    const after = this.lastBuffer.slice(this.lastCursorPosition);
    const suffix = this.context.kind === "path" ? "" : "()";
    const newBuffer = base + fullName + suffix + after;
    const newCursorPosition =
      base.length + fullName.length + (this.context.kind === "path" ? 0 : 1);
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
    const match = text.match(/\bfs\.(ls|la|cd|walk)\(\s*(["'])([^"']*)$/);
    if (!match) {
      return null;
    }

    return {
      method: match[1] as FsPathMethod,
      prefix: match[3],
    };
  }

  private async getFsPathMatches(method: FsPathMethod, prefix: string): Promise<string[]> {
    if (typeof window === "undefined") {
      return [];
    }

    return window.electron.fsCompletePath(method, prefix);
  }

  private getCallablePropertyNames(obj: object): string[] {
    const names = new Set<string>();
    let current: object | null = obj;

    while (current !== null && current !== Object.prototype) {
      for (const name of Object.getOwnPropertyNames(current)) {
        if (name === "constructor") continue;
        const descriptor = Object.getOwnPropertyDescriptor(current, name);
        if (descriptor && typeof descriptor.value === "function") {
          names.add(name);
        }
      }
      current = Object.getPrototypeOf(current);
    }

    return [...names];
  }
}
