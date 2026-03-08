import { BOUNCE_GLOBALS } from "./repl-evaluator.js";

export type CompletionAction =
  | { kind: "accept"; newBuffer: string; newCursorPosition: number }
  | { kind: "redraw" };

export class TabCompletion {
  private readonly candidates: string[];
  private matches: string[] = [];
  private selectedIndex: number = 0;
  private ghostLines: number = 0; // number of extra lines rendered below prompt
  private lastBuffer: string = "";
  private lastCursorPosition: number = 0;

  constructor() {
    this.candidates = [...BOUNCE_GLOBALS].sort();
  }

  get matchCount(): number {
    return this.matches.length;
  }

  update(buffer: string, cursorPosition: number): void {
    this.lastBuffer = buffer;
    this.lastCursorPosition = cursorPosition;
    this.selectedIndex = 0;

    // Only complete when cursor is at the end of the buffer
    if (cursorPosition < buffer.length) {
      this.matches = [];
      return;
    }

    const prefix = this.extractPrefix(buffer.slice(0, cursorPosition));
    if (!prefix) {
      this.matches = [];
      return;
    }

    this.matches = this.candidates.filter((c) => c.startsWith(prefix));
  }

  handleTab(): CompletionAction | null {
    if (this.matches.length === 1) {
      return this.makeAcceptAction(this.matches[0]);
    }
    if (this.matches.length > 1) {
      this.selectedIndex = (this.selectedIndex + 1) % this.matches.length;
      return { kind: "redraw" };
    }
    return null;
  }

  handleEnter(): CompletionAction | null {
    if (this.matches.length > 1) {
      return this.makeAcceptAction(this.matches[this.selectedIndex]);
    }
    return null;
  }

  /**
   * Returns an ANSI string to write after the prompt line that renders ghost
   * text. Uses DEC save/restore cursor (\x1b7 / \x1b8) so the terminal cursor
   * stays at the correct prompt position after writing.
   *
   * Single match: dim suffix on the same line after the cursor.
   * Multiple matches: dim/highlighted list on lines below the prompt.
   * No matches: empty string.
   */
  ghostText(): string {
    if (this.matches.length === 0) {
      this.ghostLines = 0;
      return "";
    }

    const prefix = this.extractPrefix(
      this.lastBuffer.slice(0, this.lastCursorPosition),
    );

    if (this.matches.length === 1) {
      const suffix = this.matches[0].slice(prefix.length) + "()";
      this.ghostLines = 0;
      return `\x1b7\x1b[90m${suffix}\x1b[0m\x1b8`;
    }

    // Multi-match: render candidate list below the current line
    this.ghostLines = this.matches.length;
    let result = "\x1b7";
    for (let i = 0; i < this.matches.length; i++) {
      if (i === this.selectedIndex) {
        result += `\r\n\x1b[1;36m> ${this.matches[i]}()\x1b[0m`;
      } else {
        result += `\r\n\x1b[90m  ${this.matches[i]}()\x1b[0m`;
      }
    }
    result += "\x1b8";
    return result;
  }

  /**
   * Returns an ANSI string that erases the multi-match ghost lines previously
   * written below the prompt. Single-match inline ghost text on the same line
   * is cleared implicitly by the \r\x1b[K the caller writes when redrawing.
   */
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
  }

  private extractPrefix(text: string): string {
    const m = text.match(/[a-zA-Z][a-zA-Z0-9]*$/);
    return m ? m[0] : "";
  }

  private makeAcceptAction(fullName: string): CompletionAction {
    const prefix = this.extractPrefix(
      this.lastBuffer.slice(0, this.lastCursorPosition),
    );
    const base = this.lastBuffer.slice(
      0,
      this.lastCursorPosition - prefix.length,
    );
    const after = this.lastBuffer.slice(this.lastCursorPosition);
    const newBuffer = base + fullName + "()" + after;
    // Place cursor between the parens so the user can type arguments
    const newCursorPosition = base.length + fullName.length + 1;
    return { kind: "accept", newBuffer, newCursorPosition };
  }
}
