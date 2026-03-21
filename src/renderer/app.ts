import { AudioManager, type PlaybackCursorState } from "./audio-context.js";
import { BounceTerminal } from "./terminal.js";
import { WaveformVisualizer } from "./waveform-visualizer.js";
import { ReplEvaluator } from "./repl-evaluator.js";
import { buildBounceApi, BounceResult } from "./bounce-api.js";
import { TabCompletion } from "./tab-completion.js";
import { VisualizationSceneManager } from "./visualization-scene-manager.js";

enum ControlCode {
  CTRL_A = 1,
  CTRL_B = 2,
  CTRL_C = 3,
  CTRL_E = 5,
  CTRL_F = 6,
  CTRL_G = 7,
  CTRL_K = 11,
  ENTER = 13,
  CTRL_N = 14,
  CTRL_P = 16,
  CTRL_R = 18,
  ESC = 27,
  BACKSPACE = 127,
  SPACE = 32,
  OPTION_F = 402,
  OPTION_B = 8747,
}

export class BounceApp {
  private terminal: BounceTerminal;
  private audioManager: AudioManager;
  public waveformVisualizer: WaveformVisualizer | null = null;
  private commandBuffer: string = "";
  private cursorPosition: number = 0; // Position within commandBuffer
  private commandHistory: string[] = [];
  private historyIndex: number = -1;

  // Reverse search state
  private isReverseSearchMode: boolean = false;
  private searchQuery: string = "";
  private searchResultIndex: number = -1;
  private matchedCommands: string[] = [];
  private savedCommandBuffer: string = "";
  private inputLines: string[] = [];
  private replEvaluator!: ReplEvaluator;
  private completion: TabCompletion;
  private redrawVersion: number = 0;
  private sceneManager: VisualizationSceneManager;

  constructor() {
    this.terminal = new BounceTerminal();
    this.audioManager = new AudioManager();
    this.completion = new TabCompletion();
    this.sceneManager = new VisualizationSceneManager(() => this.terminal.fit());
    const bounceApi = buildBounceApi({
      terminal: this.terminal,
      audioManager: this.audioManager,
      sceneManager: this.sceneManager,
      onProjectLoad: () => this.refreshForProject(),
      runtime: {
        listScopeEntries: () => this.replEvaluator.listScopeEntries(),
        hasScopeValue: (name: string) => this.replEvaluator.hasScopeValue(name),
        getScopeValue: (name: string) => this.replEvaluator.getScopeValue(name),
        serializeScope: () => this.replEvaluator.serializeScope(),
      },
    });
    this.replEvaluator = new ReplEvaluator(bounceApi);
    this.completion.setApi(bounceApi);
    this.completion.setBindingsProvider(() => this.replEvaluator.getCompletionBindings());

    this.setupEventHandlers();
    this.loadHistoryFromStorage().catch((err) => {
      console.error("Failed to load history:", err);
    });

    // Listen for NMF overlay events
    window.electron.onOverlayNMF((data) => {
      this.handleNMFOverlay(data);
    });

    // Listen for native engine playback telemetry
    if (window.electron.onPlaybackPosition) {
      window.electron.onPlaybackPosition((hash, positionInSamples) => {
        this.audioManager.updateNativePosition(hash, positionInSamples);
      });
    }
    if (window.electron.onPlaybackEnded) {
      window.electron.onPlaybackEnded((hash) => {
        this.audioManager.removeNativePlayback(hash);
      });
    }
    if (window.electron.onPlaybackError) {
      window.electron.onPlaybackError((data) => {
        this.terminal.writeln(`\x1b[31m[playback error] ${data.code}: ${data.message}\x1b[0m`);
      });
    }

    window.addEventListener("beforeunload", () => {
      const entries = this.replEvaluator.serializeScope();
      void window.electron.saveReplEnv(entries);
    });

    // Expose terminal and executeCommand for testing
    const testWindow = window as Window & {
      __bounceExecuteCommand?: (cmd: string) => Promise<void>;
      __bounceGetPlaybackStates?: () => PlaybackCursorState[];
    };
    testWindow.__bounceExecuteCommand = (cmd: string) => {
      this.commandBuffer = cmd;
      return this.executeCommand(cmd);
    };
    testWindow.__bounceGetPlaybackStates = () => this.audioManager.getPlaybackStates();
  }

  async mount(containerId: string): Promise<void> {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }

    this.terminal.open(container);
    this.terminal.fit();

    // Load history and scope before showing the prompt
    await this.loadHistoryFromStorage();
    await this.loadScopeFromStorage();

    this.printWelcome();
    this.printPrompt();

    // Auto-focus the terminal
    this.terminal.focus();

    window.addEventListener("resize", () => {
      this.terminal.fit();
    });

    this.setupDivider(container);

    this.audioManager.setPlaybackUpdateCallback((playbacks) => {
      this.updatePlaybackCursor(playbacks);
    });
  }

  private setupDivider(terminalEl: HTMLElement): void {
    const divider = document.getElementById("divider");
    if (!divider) return;

    let isDragging = false;
    let startY = 0;
    let startHeight = 0;

    divider.addEventListener("mousedown", (e) => {
      isDragging = true;
      startY = e.clientY;
      startHeight = terminalEl.getBoundingClientRect().height;
      divider.classList.add("dragging");
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      requestAnimationFrame(() => {
        const delta = e.clientY - startY;
        const minHeight = 60;
        const maxHeight = window.innerHeight - 60;
        const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + delta));
        terminalEl.style.height = `${newHeight}px`;
        window.dispatchEvent(new Event("resize"));
      });
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      divider.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.dispatchEvent(new Event("resize"));
    });
  }

  private setupEventHandlers(): void {
    this.terminal.onData((data) => {
      void this.handleInput(data);
    });
  }

  private async handleInput(data: string): Promise<void> {
    const code = data.charCodeAt(0);

    if (code === ControlCode.CTRL_R) {
      if (!this.isReverseSearchMode) {
        // Erase ghost text before entering search mode
        this.terminal.write(this.completion.eraseGhostText());
        this.completion.reset();
      }
      this.handleReverseSearch();
      return;
    }

    // Handle macOS Option key combinations (these come as Unicode characters)
    // Option+b produces ∫ (integral sign)
    // Option+f produces ƒ (function sign)
    if (code === ControlCode.OPTION_B) {
      this.moveToPreviousWord();
      return;
    } else if (code === ControlCode.OPTION_F) {
      this.moveToNextWord();
      return;
    }

    if (this.isReverseSearchMode) {
      this.handleSearchInput(data);
      return;
    }

    // Normal mode input handling
    if (code === ControlCode.ENTER) {
      // Multi-match completion: Enter pastes selected candidate without executing
      const completionAction = this.completion.handleEnter();
      if (completionAction !== null && completionAction.kind === "accept") {
        this.commandBuffer = completionAction.newBuffer;
        this.cursorPosition = completionAction.newCursorPosition;
        void this.redrawCommandLine();
        return;
      }
      this.terminal.write("\r\n");
      const accumulated = [...this.inputLines, this.commandBuffer].join("\n");
      if (!this.commandBuffer.trim() && this.inputLines.length === 0) {
        this.printPrompt();
      } else if (this.replEvaluator.isComplete(accumulated)) {
        this.executeCommand(accumulated)
          .then(() => {
            this.printPrompt();
          })
          .catch((error) => {
            console.error("[handleInput] Command execution error:", error);
            this.printPrompt();
          });
        this.inputLines = [];
        this.historyIndex = -1;
      } else {
        this.inputLines.push(this.commandBuffer);
        this.terminal.write("\x1b[90m...\x1b[0m ");
      }
      this.commandBuffer = "";
      this.cursorPosition = 0;
    } else if (code === ControlCode.BACKSPACE) {
      if (this.cursorPosition > 0) {
        this.commandBuffer =
          this.commandBuffer.slice(0, this.cursorPosition - 1) +
          this.commandBuffer.slice(this.cursorPosition);
        this.cursorPosition--;
        void this.redrawCommandLine();
      }
    } else if (code === ControlCode.CTRL_A) {
      this.cursorPosition = 0;
      this.updateCursorPosition();
    } else if (code === ControlCode.CTRL_E) {
      this.cursorPosition = this.commandBuffer.length;
      this.updateCursorPosition();
    } else if (code === ControlCode.CTRL_F) {
      if (this.cursorPosition < this.commandBuffer.length) {
        this.cursorPosition++;
        this.updateCursorPosition();
      }
    } else if (code === ControlCode.CTRL_B) {
      if (this.cursorPosition > 0) {
        this.cursorPosition--;
        this.updateCursorPosition();
      }
    } else if (code === ControlCode.CTRL_K) {
      if (this.cursorPosition < this.commandBuffer.length) {
        this.commandBuffer = this.commandBuffer.slice(0, this.cursorPosition);
        void this.redrawCommandLine();
      }
    } else if (code === ControlCode.CTRL_P) {
      this.navigateHistory(1);
    } else if (code === ControlCode.CTRL_N) {
      this.navigateHistory(-1);
    } else if (code === ControlCode.ESC) {
      // ESC sequences (arrows, Alt+f, Alt+b)
      if (data === "\x1b[A") {
        // Up arrow
        await this.completion.update(this.commandBuffer, this.cursorPosition);
        const action = this.completion.handleUp();
        if (action !== null) {
          this.terminal.write(this.completion.eraseGhostText());
          this.terminal.write(this.completion.ghostText());
        } else {
          this.navigateHistory(1);
        }
      } else if (data === "\x1b[B") {
        // Down arrow
        await this.completion.update(this.commandBuffer, this.cursorPosition);
        const action = this.completion.handleDown();
        if (action !== null) {
          this.terminal.write(this.completion.eraseGhostText());
          this.terminal.write(this.completion.ghostText());
        } else {
          this.navigateHistory(-1);
        }
      } else if (data === "\x1b[C") {
        // Right arrow
        if (this.cursorPosition < this.commandBuffer.length) {
          this.cursorPosition++;
          this.updateCursorPosition();
        }
      } else if (data === "\x1b[D") {
        // Left arrow
        if (this.cursorPosition > 0) {
          this.cursorPosition--;
          this.updateCursorPosition();
        }
      } else if (data === "\x1bf" || data === "\x1bF") {
        // Alt+F - Move forward one word
        this.moveToNextWord();
      } else if (data === "\x1bb" || data === "\x1bB") {
        // Alt+B - Move backward one word
        this.moveToPreviousWord();
      } else if (data === "\x1b[3;3~" || data === "\x1b\x7f") {
        // Alt+Delete or Alt+Backspace - Delete previous word
        this.deleteWordBackward();
      } else {
        // Unknown escape sequence - ignore it
      }
    } else if (data === "\t") {
      await this.completion.update(this.commandBuffer, this.cursorPosition);
      const action = this.completion.handleTab();
      if (action === null) return;
      if (action.kind === "accept") {
        this.commandBuffer = action.newBuffer;
        this.cursorPosition = action.newCursorPosition;
        await this.redrawCommandLine();
      } else {
        // Cycle multi-match list: erase old ghost text, render updated selection
        this.terminal.write(this.completion.eraseGhostText());
        this.terminal.write(this.completion.ghostText());
      }
    } else if (code >= ControlCode.SPACE) {
      this.commandBuffer =
        this.commandBuffer.slice(0, this.cursorPosition) +
        data +
        this.commandBuffer.slice(this.cursorPosition);
      this.cursorPosition += data.length;
      await this.redrawCommandLine();
    }
  }

  private isWordChar(char: string): boolean {
    // Consider letters and numbers as word characters
    return /[a-zA-Z0-9]/.test(char);
  }

  private moveToNextWord(): void {
    // Skip current word (alphanumeric characters)
    while (
      this.cursorPosition < this.commandBuffer.length &&
      this.isWordChar(this.commandBuffer[this.cursorPosition])
    ) {
      this.cursorPosition++;
    }
    // Skip non-word characters
    while (
      this.cursorPosition < this.commandBuffer.length &&
      !this.isWordChar(this.commandBuffer[this.cursorPosition])
    ) {
      this.cursorPosition++;
    }
    this.updateCursorPosition();
  }

  private moveToPreviousWord(): void {
    // Skip non-word characters
    while (
      this.cursorPosition > 0 &&
      !this.isWordChar(this.commandBuffer[this.cursorPosition - 1])
    ) {
      this.cursorPosition--;
    }
    // Skip to beginning of word (alphanumeric characters)
    while (
      this.cursorPosition > 0 &&
      this.isWordChar(this.commandBuffer[this.cursorPosition - 1])
    ) {
      this.cursorPosition--;
    }
    this.updateCursorPosition();
  }

  private deleteWordBackward(): void {
    if (this.cursorPosition === 0) return;

    const originalPosition = this.cursorPosition;

    // Skip non-word characters
    while (
      this.cursorPosition > 0 &&
      !this.isWordChar(this.commandBuffer[this.cursorPosition - 1])
    ) {
      this.cursorPosition--;
    }
    // Skip to beginning of word (alphanumeric characters)
    while (
      this.cursorPosition > 0 &&
      this.isWordChar(this.commandBuffer[this.cursorPosition - 1])
    ) {
      this.cursorPosition--;
    }

    // Delete from new cursor position to original position
    this.commandBuffer =
      this.commandBuffer.slice(0, this.cursorPosition) +
      this.commandBuffer.slice(originalPosition);

    void this.redrawCommandLine();
  }

  private async redrawCommandLine(): Promise<void> {
    const redrawVersion = ++this.redrawVersion;
    // Erase multi-match ghost lines below the prompt (single-match inline ghost
    // is on the same line and will be cleared by the \r\x1b[K below)
    this.terminal.write(this.completion.eraseGhostText());
    // Update completion state for the current buffer and cursor position
    await this.completion.update(this.commandBuffer, this.cursorPosition);
    if (redrawVersion !== this.redrawVersion) {
      return;
    }
    // Clear the current line and redraw with cursor at correct position
    this.terminal.write("\r\x1b[K");
    this.terminal.write(`\x1b[32m>\x1b[0m ${this.commandBuffer}`);
    // Move cursor to correct position
    const targetColumn = 3 + this.cursorPosition; // 3 = "> " prompt (including space)
    this.terminal.write(`\r\x1b[${targetColumn}G`);
    // Render ghost text (saves and restores cursor position)
    this.terminal.write(this.completion.ghostText());
  }

  private updateCursorPosition(): void {
    void this.redrawCommandLine();
  }

  private navigateHistory(direction: number): void {
    if (this.commandHistory.length === 0) {
      return;
    }

    const newIndex = this.historyIndex + direction;

    if (newIndex >= -1 && newIndex < this.commandHistory.length) {
      this.historyIndex = newIndex;

      if (this.historyIndex === -1) {
        this.commandBuffer = "";
      } else {
        this.commandBuffer =
          this.commandHistory[
            this.commandHistory.length - 1 - this.historyIndex
          ];
      }

      this.cursorPosition = this.commandBuffer.length;
      void this.redrawCommandLine();
    }
  }

  private clearCurrentLine(): void {
    this.terminal.write("\r\x1b[K");
  }

  private printWelcome(): void {
    this.terminal.writeln("\x1b[1;36mBounce — FluCoMa Audio Analysis REPL\x1b[0m");
    this.terminal.writeln("\x1b[90mTypeScript REPL for audio corpus analysis\x1b[0m");
    this.terminal.writeln("");
    this.terminal.writeln("Type \x1b[33mhelp()\x1b[0m to see available functions.");
    this.terminal.writeln("Variables persist across evaluations. Multi-line input is auto-detected.");
    this.terminal.writeln("");
  }
  private printPrompt(): void {
    this.terminal.writeWhenFlushed("\r\x1b[32m>\x1b[0m ");
  }

  private async executeCommand(source: string): Promise<void> {
    const trimmed = source.trim();
    if (!trimmed) return;

    this.commandHistory.push(trimmed);
    await window.electron.saveCommand(trimmed);

    try {
      const result = await this.replEvaluator.evaluate(trimmed);
      if (result !== undefined) {
        const formatted = this.formatResult(result);
        // BounceResult and string carry their own ANSI formatting; bare values get dim gray.
        if (result instanceof BounceResult || typeof result === "string") {
          this.terminal.writeln(formatted);
        } else {
          this.terminal.writeln(`\x1b[90m${formatted}\x1b[0m`);
        }
      }
    } catch (error) {
      this.terminal.writeln(
        `\x1b[31mError: ${error instanceof Error ? error.message : String(error)}\x1b[0m`,
      );
    }
  }

  private formatResult(value: unknown): string {
    if (value instanceof BounceResult) {
      return value.toString().replace(/\r?\n/g, "\r\n");
    }
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "function") {
      return `[Function: ${(value as { name?: string }).name || "(anonymous)"}]`;
    }
    if (typeof value === "object" && value !== null) {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  private handleNMFOverlay(data: {
    sampleHash: string;
    nmfData: { components: number; basis: number[][]; activations: number[][] };
    featureHash?: string;
  }): void {
    window.electron.debugLog("info", "[NMFOverlay] handleNMFOverlay called", {
      hasVisualizer: !!this.waveformVisualizer,
      sampleHash: data.sampleHash.substring(0, 8),
    });

    if (!this.waveformVisualizer) {
      window.electron.debugLog(
        "warn",
        "[NMFOverlay] No waveform currently displayed",
      );
      this.terminal.writeln(
        "\x1b[31mNo waveform currently displayed. Play a sample first.\x1b[0m",
      );
      this.printPrompt();
      return;
    }

    window.electron.debugLog(
      "info",
      "[NMFOverlay] Overlaying NMF visualization",
      {
        sampleHash: data.sampleHash.substring(0, 8),
        components: data.nmfData.components,
      },
    );

    // Set NMF data on waveform visualizer - it will draw both waveform and overlay
    this.waveformVisualizer.setNMFOverlay({
      components: data.nmfData.components,
      bases: data.nmfData.basis,
      activations: data.nmfData.activations,
    });

    const featureHashShort = data.featureHash
      ? data.featureHash.substring(0, 8)
      : "unknown";
    this.terminal.writeln(
      `\x1b[32mNMF visualization overlaid (${data.nmfData.components} components, feature: ${featureHashShort})\x1b[0m`,
    );
    this.printPrompt();
  }


  private updateWaveformVisualization(): void {
    const audio = this.audioManager.getCurrentAudio();
    if (!audio) return;

    const container = document.getElementById("waveform-container");
    if (!container) return;

    document.body.classList.add("waveform-visible");
    container.classList.add("active");
    this.terminal.fit();

    if (!this.waveformVisualizer) {
      this.waveformVisualizer = new WaveformVisualizer("waveform-canvas");
    }

    if (this.waveformVisualizer) {
      this.waveformVisualizer.setAudioContext(this.audioManager);
      const slices = this.audioManager.getCurrentSlices();
      window.electron.debugLog("debug", "[App] updateWaveformVisualization", {
        audioDataLength: audio.audioData.length,
        slicesCount: slices?.length || 0,
        slicesPresent: !!slices,
      });
      this.waveformVisualizer.drawWaveform(
        audio.audioData,
        audio.sampleRate,
        slices || undefined,
      );
    }
  }

  private hideWaveformVisualization(): void {
    document.body.classList.remove("waveform-visible");
    const container = document.getElementById("waveform-container");
    container?.classList.remove("active");
    this.terminal.fit();
  }

  private updatePlaybackCursor(playbacks: PlaybackCursorState[]): void {
    this.sceneManager.updatePlaybackCursors(playbacks);

    const audio = this.audioManager.getCurrentAudio();
    const activePlayback = audio?.hash
      ? playbacks.find((playback) => playback.hash === audio.hash)
      : undefined;

    if (!audio || !this.waveformVisualizer) return;

    this.waveformVisualizer.updatePlaybackCursor(
      activePlayback?.position ?? 0,
      audio.audioData.length,
    );
  }

  // Reverse search methods
  private handleReverseSearch(): void {
    if (!this.isReverseSearchMode) {
      // Enter search mode
      this.isReverseSearchMode = true;
      this.searchQuery = "";
      this.searchResultIndex = -1;
      this.matchedCommands = [];
      this.savedCommandBuffer = this.commandBuffer;
      this.commandBuffer = "";
      this.updateSearchPrompt();
    } else {
      // Cycle to next match
      this.findNextMatch();
    }
  }

  private handleSearchInput(data: string): void {
    const code = data.charCodeAt(0);

    if (code === ControlCode.ESC) {
      this.exitSearchMode(false);
    } else if (code === ControlCode.CTRL_C) {
      this.exitSearchMode(false);
    } else if (code === ControlCode.CTRL_G) {
      this.exitSearchMode(false);
    } else if (code === ControlCode.ENTER) {
      this.exitSearchMode(true);
    } else if (code === ControlCode.BACKSPACE) {
      if (this.searchQuery.length > 0) {
        this.searchQuery = this.searchQuery.slice(0, -1);
        this.performSearch();
      }
    } else if (code >= ControlCode.SPACE) {
      this.searchQuery += data;
      this.performSearch();
    }
  }

  private performSearch(): void {
    this.matchedCommands = [];

    if (this.searchQuery === "") {
      this.updateSearchPrompt();
      return;
    }

    // Search history in reverse order (most recent first)
    for (let i = this.commandHistory.length - 1; i >= 0; i--) {
      const command = this.commandHistory[i];
      if (command.toLowerCase().includes(this.searchQuery.toLowerCase())) {
        this.matchedCommands.push(command);
      }
    }

    // Set to first match
    this.searchResultIndex = this.matchedCommands.length > 0 ? 0 : -1;
    this.updateSearchPrompt();
  }

  private findNextMatch(): void {
    if (this.matchedCommands.length === 0) return;

    this.searchResultIndex =
      (this.searchResultIndex + 1) % this.matchedCommands.length;
    this.updateSearchPrompt();
  }

  private updateSearchPrompt(): void {
    this.clearCurrentLine();

    const matchedCommand = this.matchedCommands[this.searchResultIndex] || "";
    const highlighted = matchedCommand
      ? this.highlightMatch(matchedCommand, this.searchQuery)
      : "";

    this.terminal.write(
      `(reverse-i-search)\x1b[33m'${this.searchQuery}'\x1b[0m: ${highlighted}`,
    );
  }

  private highlightMatch(command: string, query: string): string {
    if (!query) return command;

    const index = command.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) return command;

    const before = command.substring(0, index);
    const match = command.substring(index, index + query.length);
    const after = command.substring(index + query.length);

    return `${before}\x1b[1;32m${match}\x1b[0m${after}`;
  }

  private exitSearchMode(executeCommand: boolean): void {
    this.isReverseSearchMode = false;

    this.clearCurrentLine();

    if (executeCommand && this.searchResultIndex >= 0) {
      // Paste matched command into prompt without executing
      this.commandBuffer = this.matchedCommands[this.searchResultIndex];
    } else {
      // Restore saved buffer on cancel
      this.commandBuffer = this.savedCommandBuffer;
    }

    this.searchQuery = "";
    this.searchResultIndex = -1;
    this.matchedCommands = [];
    this.savedCommandBuffer = "";
    this.cursorPosition = this.commandBuffer.length;
    void this.redrawCommandLine();
  }

  // History persistence methods
  private async loadHistoryFromStorage(): Promise<void> {
    try {
      const history = await window.electron.getCommandHistory();
      if (Array.isArray(history)) {
        this.commandHistory = history;
      }
    } catch (error) {
      console.error("Failed to load command history:", error);
    }
  }

  private async loadScopeFromStorage(): Promise<void> {
    try {
      this.replEvaluator.clearScope();
      const entries = await window.electron.getReplEnv();
      if (!entries || entries.length === 0) {
        return;
      }
      const restored = await this.replEvaluator.restoreScope(entries);
      if (restored.length > 0) {
        const summary = restored
          .map((name) => {
            const value = this.replEvaluator.getScopeValue(name);
            const kind = typeof value === "function" ? "function" : typeof value;
            return `${name} (${kind})`;
          })
          .join(", ");
        this.terminal.writeln(`\x1b[90mRestored ${restored.length} variable${restored.length === 1 ? "" : "s"}: ${summary}\x1b[0m`);
      }
    } catch (error) {
      console.error("Failed to load scope from storage:", error);
    }
  }

  private async refreshForProject(): Promise<void> {
    await this.loadHistoryFromStorage();
    this.historyIndex = -1;
    this.isReverseSearchMode = false;
    this.searchQuery = "";
    this.searchResultIndex = -1;
    this.matchedCommands = [];
    this.savedCommandBuffer = "";
    await this.loadScopeFromStorage();
  }
}
