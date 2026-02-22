import { AudioManager } from "./audio-context.js";
import { BounceTerminal } from "./terminal.js";
import { WaveformVisualizer } from "./waveform-visualizer.js";
import { NMFVisualizer } from "./nmf-visualizer.js";
import { VisualizationManager } from "./visualization-manager.js";

interface OnsetSliceOptions {
  threshold?: number;
  minSliceLength?: number;
  filterSize?: number;
  frameDelta?: number;
  metric?: number;
  [key: string]: unknown;
}

interface BufNMFOptions {
  components?: number;
  iterations?: number;
  fftSize?: number;
  hopSize?: number;
  windowSize?: number;
  seed?: number;
}

interface BufNMFResult {
  components: number;
  iterations: number;
  converged: boolean;
  bases: number[][];
  activations: number[][];
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

  constructor() {
    this.terminal = new BounceTerminal();
    this.audioManager = new AudioManager();

    this.setupEventHandlers();
    this.loadHistoryFromStorage().catch((err) => {
      console.error("Failed to load history:", err);
    });

    // Listen for NMF overlay events
    window.electron.onOverlayNMF((data) => {
      this.handleNMFOverlay(data);
    });

    // Expose terminal and executeCommand for testing
    const testWindow = window as Window & {
      __bounceExecuteCommand?: (cmd: string) => void;
    };
    testWindow.__bounceExecuteCommand = (cmd: string) => {
      this.commandBuffer = cmd;
      this.executeCommand(cmd);
    };
  }

  async mount(containerId: string): Promise<void> {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }

    this.terminal.open(container);
    this.terminal.fit();

    // Load history before showing the prompt
    await this.loadHistoryFromStorage();

    this.printWelcome();
    this.printPrompt();

    // Auto-focus the terminal
    this.terminal.focus();

    window.addEventListener("resize", () => {
      this.terminal.fit();
    });

    this.audioManager.setPlaybackUpdateCallback((position) => {
      this.updatePlaybackCursor(position);
    });
  }

  private setupEventHandlers(): void {
    this.terminal.onData((data) => {
      this.handleInput(data);
    });
  }

  private handleInput(data: string): void {
    const code = data.charCodeAt(0);

    // Check for Ctrl+R (ASCII 18)
    if (code === 18) {
      this.handleReverseSearch();
      return;
    }

    // Handle macOS Option key combinations (these come as Unicode characters)
    // Option+b produces ∫ (integral sign, code 8747)
    // Option+f produces ƒ (function sign, code 402)
    if (code === 8747) {
      // Option+b - Move backward one word
      this.moveToPreviousWord();
      return;
    } else if (code === 402) {
      // Option+f - Move forward one word
      this.moveToNextWord();
      return;
    }

    // If in search mode, handle search input differently
    if (this.isReverseSearchMode) {
      this.handleSearchInput(data);
      return;
    }

    // Normal mode input handling
    if (code === 13) {
      // Enter
      this.terminal.write("\r\n");
      this.executeCommand(this.commandBuffer)
        .then(() => {
          this.printPrompt();
        })
        .catch((error) => {
          console.error("[handleInput] Command execution error:", error);
          this.printPrompt();
        });
      this.commandBuffer = "";
      this.cursorPosition = 0;
      this.historyIndex = -1;
    } else if (code === 127) {
      // Backspace
      if (this.cursorPosition > 0) {
        this.commandBuffer =
          this.commandBuffer.slice(0, this.cursorPosition - 1) +
          this.commandBuffer.slice(this.cursorPosition);
        this.cursorPosition--;
        this.redrawCommandLine();
      }
    } else if (code === 1) {
      // Ctrl+A - Move to beginning
      this.cursorPosition = 0;
      this.updateCursorPosition();
    } else if (code === 5) {
      // Ctrl+E - Move to end
      this.cursorPosition = this.commandBuffer.length;
      this.updateCursorPosition();
    } else if (code === 6) {
      // Ctrl+F - Move forward one character
      if (this.cursorPosition < this.commandBuffer.length) {
        this.cursorPosition++;
        this.updateCursorPosition();
      }
    } else if (code === 2) {
      // Ctrl+B - Move backward one character
      if (this.cursorPosition > 0) {
        this.cursorPosition--;
        this.updateCursorPosition();
      }
    } else if (code === 11) {
      // Ctrl+K - Kill (delete) from cursor to end of line
      if (this.cursorPosition < this.commandBuffer.length) {
        this.commandBuffer = this.commandBuffer.slice(0, this.cursorPosition);
        this.redrawCommandLine();
      }
    } else if (code === 16) {
      // Ctrl+P - Previous command (like up arrow)
      this.navigateHistory(1);
    } else if (code === 14) {
      // Ctrl+N - Next command (like down arrow)
      this.navigateHistory(-1);
    } else if (code === 27) {
      // ESC sequences (arrows, Alt+f, Alt+b)
      if (data === "\x1b[A") {
        // Up arrow
        this.navigateHistory(1);
      } else if (data === "\x1b[B") {
        // Down arrow
        this.navigateHistory(-1);
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
    } else if (code >= 32) {
      // Regular character
      this.commandBuffer =
        this.commandBuffer.slice(0, this.cursorPosition) +
        data +
        this.commandBuffer.slice(this.cursorPosition);
      this.cursorPosition++;
      this.redrawCommandLine();
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

    this.redrawCommandLine();
  }

  private redrawCommandLine(): void {
    // Clear the current line and redraw with cursor at correct position
    this.terminal.write("\r\x1b[K");
    this.terminal.write(`\x1b[32m>\x1b[0m ${this.commandBuffer}`);
    // Move cursor to correct position
    const targetColumn = 3 + this.cursorPosition; // 3 = "> " prompt (including space)
    this.terminal.write(`\r\x1b[${targetColumn}G`);
  }

  private updateCursorPosition(): void {
    // Move cursor to correct position without redrawing
    const targetColumn = 3 + this.cursorPosition; // 3 = "> " prompt (including space)
    this.terminal.write(`\r\x1b[${targetColumn}G`);
  }

  private navigateHistory(direction: number): void {
    if (this.commandHistory.length === 0) {
      return;
    }

    const newIndex = this.historyIndex + direction;

    if (newIndex >= -1 && newIndex < this.commandHistory.length) {
      this.clearCurrentLine();
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
      this.terminal.write(`> ${this.commandBuffer}`);
    }
  }

  private clearCurrentLine(): void {
    this.terminal.write("\r\x1b[K");
  }

  private printWelcome(): void {
    this.terminal.writeln(
      "\x1b[1;36mBounce - FluCoMa Audio Analysis Tool\x1b[0m",
    );
    this.terminal.writeln("\x1b[90mTypeScript REPL for audio analysis\x1b[0m");
    this.terminal.writeln("");
    this.terminal.writeln("Commands:");
    this.terminal.writeln(
      '  \x1b[33mdisplay "path/to/audio/file"\x1b[0m - Load and visualize audio',
    );
    this.terminal.writeln(
      '  \x1b[33mplay "path/to/audio/file"\x1b[0m - Play audio with cursor',
    );
    this.terminal.writeln("  \x1b[33mstop\x1b[0m - Stop playback");
    this.terminal.writeln(
      "  \x1b[33mhelp\x1b[0m - Show all available commands",
    );
    this.terminal.writeln("  \x1b[33mclear\x1b[0m - Clear terminal screen");
    this.terminal.writeln("");
    this.terminal.writeln("Keyboard Shortcuts:");
    this.terminal.writeln(
      "  \x1b[90mCtrl+R\x1b[0m - Reverse search | \x1b[90mCtrl+P/N\x1b[0m - History | \x1b[90m↑/↓\x1b[0m - History",
    );
    this.terminal.writeln(
      "  \x1b[90mCtrl+A/E\x1b[0m - Line start/end | \x1b[90mCtrl+F/B\x1b[0m - Char forward/back",
    );
    this.terminal.writeln(
      "  \x1b[90mAlt+F/B\x1b[0m - Word forward/back | \x1b[90mAlt+Del\x1b[0m - Delete word | \x1b[90mCtrl+K\x1b[0m - Kill",
    );
    this.terminal.writeln("");
  }

  private printPrompt(): void {
    this.terminal.write("\r\x1b[32m>\x1b[0m ");
  }

  private async executeCommand(command: string): Promise<void> {
    const trimmed = command.trim();
    if (!trimmed) return;

    this.commandHistory.push(trimmed);
    await window.electron.saveCommand(trimmed);

    try {
      if (await this.handleBuiltInCommand(trimmed)) {
        return;
      }

      const result = await this.audioManager.evaluate(trimmed);

      if (result !== undefined) {
        if (typeof result === "object" && result !== null) {
          this.terminal.writeln(JSON.stringify(result, null, 2));
        } else {
          this.terminal.writeln(String(result));
        }
      }

      if (this.audioManager.getCurrentAudio()) {
        this.updateWaveformVisualization();
      }
    } catch (error) {
      this.terminal.writeln(
        `\x1b[31mError: ${error instanceof Error ? error.message : String(error)}\x1b[0m`,
      );
    }
  }

  private async handleBuiltInCommand(command: string): Promise<boolean> {
    const parts = this.parseCommand(command);
    if (!parts) return false;

    const { name, args } = parts;
    await window.electron.debugLog(
      "info",
      "[App] handleBuiltInCommand processing",
      { name, args },
    );

    switch (name) {
      case "display":
        await this.handleDisplayCommand(args);
        return true;

      case "play":
        await this.handlePlayCommand(args);
        return true;

      case "stop":
        this.handleStopCommand();
        return true;

      case "debug":
        await this.handleDebugCommand(args);
        return true;

      case "clear-debug":
        await this.handleClearDebugCommand();
        return true;

      case "help":
        this.handleHelpCommand(args);
        return true;

      case "clear":
        window.electron.debugLog("info", "[App] Clear command executing", {
          hasVisualizer: !!this.waveformVisualizer,
        });
        this.terminal.clear();
        // Also clear waveform visualization
        if (this.waveformVisualizer) {
          window.electron.debugLog(
            "info",
            "[App] Clearing waveform visualizer",
          );
          this.waveformVisualizer = null;
          const container = document.getElementById("waveform-container");
          if (container) {
            container.style.display = "none";
          }
        }
        window.electron.debugLog("info", "[App] Clear command complete", {
          hasVisualizer: !!this.waveformVisualizer,
        });
        return true;

      case "analyze":
        await this.handleAnalyzeCommand(args);
        return true;

      case "analyze-nmf":
        await this.handleAnalyzeNmfCommand(args);
        return true;

      case "slice":
        await this.handleSliceCommand(args);
        return true;

      case "list":
        await this.handleListCommand(args);
        return true;

      case "play-slice":
        await this.handlePlaySliceCommand(args);
        return true;

      case "visualize-nmf":
        await this.handleVisualizeNmfCommand(args);
        return true;

      default:
        return false;
    }
  }

  private parseCommand(input: string): { name: string; args: string[] } | null {
    const quotedArgsRegex = /^([\w-]+)\s+(.+)$/;
    const match = input.match(quotedArgsRegex);

    if (!match) {
      return { name: input.trim(), args: [] };
    }

    const name = match[1];
    const argsString = match[2];

    const args: string[] = [];
    const quotedArgRegex = /"([^"]+)"|'([^']+)'|(\S+)/g;
    let argMatch;

    while ((argMatch = quotedArgRegex.exec(argsString)) !== null) {
      args.push(argMatch[1] || argMatch[2] || argMatch[3]);
    }

    return { name, args };
  }

  private async handleDisplayCommand(args: string[]): Promise<void> {
    if (args.length === 0) {
      this.terminal.writeln(
        "\x1b[31mError: display requires a file path or hash\x1b[0m",
      );
      this.terminal.writeln(
        'Usage: display "path/to/audio/file" or display <hash>',
      );
      return;
    }

    const filePathOrHash = args[0];

    // Check if it's a hash (8+ hex characters without path separators)
    const isHash =
      /^[0-9a-f]{8,}$/i.test(filePathOrHash) &&
      !filePathOrHash.includes("/") &&
      !filePathOrHash.includes("\\");

    if (!isHash) {
      // It's a file path, validate extension
      const supportedExtensions = [
        ".wav",
        ".mp3",
        ".ogg",
        ".flac",
        ".m4a",
        ".aac",
        ".opus",
      ];
      const ext = filePathOrHash
        .toLowerCase()
        .substring(filePathOrHash.lastIndexOf("."));

      if (!supportedExtensions.includes(ext)) {
        this.terminal.writeln("\x1b[31mError: unsupported file format\x1b[0m");
        this.terminal.writeln(
          "Supported formats: WAV, MP3, OGG, FLAC, M4A, AAC, OPUS",
        );
        return;
      }
    }

    try {
      const audioData = await window.electron.readAudioFile(filePathOrHash);

      const audio = {
        audioData: audioData.channelData,
        sampleRate: audioData.sampleRate,
        duration: audioData.duration,
        filePath: filePathOrHash,
        hash: audioData.hash,
        visualize: () => "Visualization updated",
        analyzeOnsetSlice: async (options?: OnsetSliceOptions) => {
          const slices = await window.electron.analyzeOnsetSlice(
            audioData.channelData,
            options,
          );
          return { slices, visualize: () => "Slice markers updated" };
        },
      };

      this.audioManager.setCurrentAudio(audio);
      this.updateWaveformVisualization();

      const shortHash = audioData.hash.substring(0, 8);
      this.terminal.writeln(`\x1b[32mLoaded: ${audioData.filePath}\x1b[0m`);
      this.terminal.writeln(
        `Duration: ${audioData.duration.toFixed(2)}s, Sample Rate: ${audioData.sampleRate}Hz`,
      );
      this.terminal.writeln(`Hash: ${shortHash}`);
    } catch (error) {
      this.terminal.writeln(
        `\x1b[31mError loading file: ${error instanceof Error ? error.message : String(error)}\x1b[0m`,
      );
    }
  }

  private async handlePlayCommand(args: string[]): Promise<void> {
    if (args.length === 0) {
      this.terminal.writeln(
        "\x1b[31mError: play requires a file path or hash\x1b[0m",
      );
      this.terminal.writeln('Usage: play "path/to/audio/file" or play <hash>');
      return;
    }

    const filePathOrHash = args[0];
    const currentAudio = this.audioManager.getCurrentAudio();

    // If already loaded, just play it
    if (
      currentAudio &&
      (currentAudio.filePath === filePathOrHash ||
        currentAudio.hash?.startsWith(filePathOrHash))
    ) {
      try {
        await this.audioManager.playAudio(
          currentAudio.audioData,
          currentAudio.sampleRate,
        );
        this.terminal.writeln(
          `\x1b[32mPlaying: ${currentAudio.hash?.substring(0, 8) || filePathOrHash}\x1b[0m`,
        );
      } catch (error) {
        this.terminal.writeln(
          `\x1b[31mError playing audio: ${error instanceof Error ? error.message : String(error)}\x1b[0m`,
        );
      }
      return;
    }

    // Otherwise load and play
    await this.handleDisplayCommand(args);

    const audio = this.audioManager.getCurrentAudio();
    if (audio) {
      try {
        await this.audioManager.playAudio(audio.audioData, audio.sampleRate);
        this.terminal.writeln(
          `\x1b[32mPlaying: ${audio.hash?.substring(0, 8) || filePathOrHash}\x1b[0m`,
        );
      } catch (error) {
        this.terminal.writeln(
          `\x1b[31mError playing audio: ${error instanceof Error ? error.message : String(error)}\x1b[0m`,
        );
      }
    }
  }

  private handleStopCommand(): void {
    this.audioManager.stopAudio();
    this.terminal.writeln("\x1b[32mPlayback stopped\x1b[0m");
  }

  private async handleDebugCommand(args: string[]): Promise<void> {
    const limit = args.length > 0 ? parseInt(args[0]) : 20;
    const logs = await window.electron.getDebugLogs(limit);

    this.terminal.writeln(
      `\x1b[1;36mDebug Logs (${logs.length} entries):\x1b[0m`,
    );
    this.terminal.writeln("");

    for (const log of logs.reverse()) {
      const levelColor =
        log.level === "error"
          ? "\x1b[31m"
          : log.level === "warn"
            ? "\x1b[33m"
            : "\x1b[90m";

      const timestamp = new Date(log.timestamp).toISOString();
      const data = log.data ? ` ${log.data}` : "";

      this.terminal.writeln(
        `${levelColor}[${timestamp}] ${log.level.toUpperCase()}: ${log.message}${data}\x1b[0m`,
      );
    }

    if (logs.length === 0) {
      this.terminal.writeln("\x1b[90mNo debug logs found\x1b[0m");
    }
  }

  private async handleClearDebugCommand(): Promise<void> {
    await window.electron.clearDebugLogs();
    this.terminal.writeln("\x1b[32mDebug logs cleared\x1b[0m");
  }

  private async handleAnalyzeCommand(args: string[]): Promise<void> {
    if (args.length < 2) {
      this.terminal.writeln(
        "\x1b[31mError: analyze requires a subcommand and arguments\x1b[0m",
      );
      this.terminal.writeln(
        'Usage: analyze onset-slice "path/to/audio/file" [options]',
      );
      return;
    }

    const subcommand = args[0];
    const filePath = args[1];

    switch (subcommand) {
      case "onset-slice":
        await this.handleOnsetSliceCommand(filePath, args.slice(2));
        break;

      case "nmf":
        await this.handleNMFCommandNew(filePath, args.slice(2));
        break;

      default:
        this.terminal.writeln(
          `\x1b[31mUnknown analysis type: ${subcommand}\x1b[0m`,
        );
        this.terminal.writeln("Available: onset-slice, nmf");
    }
  }

  private async handleAnalyzeNmfCommand(args: string[]): Promise<void> {
    if (args.length < 1) {
      this.terminal.writeln(
        "\x1b[31mError: analyze-nmf requires an argument\x1b[0m",
      );
      this.terminal.writeln("Usage: analyze-nmf <sample-hash> [options]");
      this.terminal.writeln("Options:");
      this.terminal.writeln(
        "  --components <N>  Number of components (default: 10)",
      );
      this.terminal.writeln(
        "  --iterations <N>  Number of iterations (default: 100)",
      );
      this.terminal.writeln("  --fft-size <N>    FFT size (default: 2048)");
      return;
    }

    const sampleHash = args[0];
    window.electron.debugLog("info", "[AnalyzeNMF] Starting analysis", {
      sampleHash,
      args,
    });

    try {
      // Call the main process analyze-nmf command (stores feature in database)
      const result = await window.electron.analyzeNMF(args);

      if (result.success) {
        this.terminal.writeln(`\x1b[32m${result.message}\x1b[0m`);

        // Trigger visualization overlay on the waveform
        window.electron.debugLog(
          "info",
          "[AnalyzeNMF] Triggering visualization",
          { sampleHash },
        );
        await window.electron.visualizeNMF(sampleHash);
      } else {
        this.terminal.writeln(`\x1b[31m${result.message}\x1b[0m`);
      }
    } catch (error) {
      window.electron.debugLog("error", "[AnalyzeNMF] Error", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.terminal.writeln(
        `\x1b[31mError: ${error instanceof Error ? error.message : String(error)}\x1b[0m`,
      );
    }
  }

  private async handleOnsetSliceCommand(
    filePath: string,
    optionArgs: string[],
  ): Promise<void> {
    try {
      window.electron.debugLog("info", "[OnsetSlice] Starting analysis", {
        filePath,
      });

      // Load audio if not already loaded
      const currentAudio = this.audioManager.getCurrentAudio();
      if (!currentAudio || currentAudio.filePath !== filePath) {
        window.electron.debugLog("info", "[OnsetSlice] Loading audio file", {
          filePath,
        });
        await this.handleDisplayCommand([filePath]);
      }

      const audio = this.audioManager.getCurrentAudio();
      if (!audio || !audio.hash) {
        this.terminal.writeln("\x1b[31mFailed to load audio file\x1b[0m");
        window.electron.debugLog("error", "[OnsetSlice] Failed to load audio", {
          filePath,
        });
        return;
      }

      window.electron.debugLog("info", "[OnsetSlice] Audio loaded, analyzing", {
        samples: audio.audioData.length,
        sampleRate: audio.sampleRate,
        hash: audio.hash,
      });
      this.terminal.writeln("\x1b[36mAnalyzing onset slices...\x1b[0m");

      // Parse options from command line if provided
      const options = this.parseOnsetSliceOptions(optionArgs);
      const slices = await window.electron.analyzeOnsetSlice(
        audio.audioData,
        options,
      );

      window.electron.debugLog("info", "[OnsetSlice] Analysis complete", {
        sliceCount: slices.length,
        options,
      });

      // Store feature in database
      const featureId = await window.electron.storeFeature(
        audio.hash,
        "onset-slice",
        slices,
        options,
      );

      window.electron.debugLog("info", "[OnsetSlice] Feature stored", {
        featureId,
      });

      // Store slices in audio context
      this.audioManager.setCurrentSlices(slices);

      // Redraw waveform with onset markers
      this.updateWaveformVisualization();

      this.terminal.writeln(
        `\x1b[32mFound ${slices.length} onset slices\x1b[0m`,
      );
      this.terminal.writeln(`Feature ID: ${featureId}`);

      // Check if this was a duplicate
      const feature = await window.electron.getMostRecentFeature(
        audio.hash,
        "onset-slice",
      );
      if (feature && feature.id === featureId) {
        const shortHash = feature.feature_hash.substring(0, 8);
        this.terminal.writeln(`Feature Hash: ${shortHash}`);
      }
    } catch (error) {
      window.electron.debugLog("error", "[OnsetSlice] Error in analysis", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.terminal.writeln(
        `\x1b[31mError analyzing onset slices: ${error instanceof Error ? error.message : String(error)}\x1b[0m`,
      );
    }
  }

  private parseOnsetSliceOptions(args: string[]): OnsetSliceOptions {
    const options: OnsetSliceOptions = {};

    for (let i = 0; i < args.length; i += 2) {
      const key = args[i];
      const value = args[i + 1];

      if (!value) continue;

      switch (key) {
        case "--threshold":
          options.threshold = parseFloat(value);
          break;
        case "--min-slice-length":
          options.minSliceLength = parseInt(value);
          break;
        case "--filter-size":
          options.filterSize = parseInt(value);
          break;
      }
    }

    return options;
  }

  private async handleNMFCommandNew(
    sampleHashOrPath: string,
    optionArgs: string[],
  ): Promise<void> {
    try {
      window.electron.debugLog("info", "[NMF] Starting analysis", {
        input: sampleHashOrPath,
      });

      // Build args array: [sampleHash, ...options]
      const args = [sampleHashOrPath, ...optionArgs];

      // Call main process analyze-nmf command
      const result = await window.electron.analyzeNMF(args);

      if (result.success) {
        this.terminal.writeln(`\x1b[32m${result.message}\x1b[0m`);
      } else {
        this.terminal.writeln(`\x1b[31m${result.message}\x1b[0m`);
      }
    } catch (error) {
      window.electron.debugLog("error", "[NMF] Error in analysis", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.terminal.writeln(
        `\x1b[31mError performing NMF: ${error instanceof Error ? error.message : String(error)}\x1b[0m`,
      );
    }
  }

  private async handleNMFCommand(
    filePath: string,
    optionArgs: string[],
  ): Promise<void> {
    try {
      window.electron.debugLog("info", "[NMF] Starting analysis", { filePath });

      // Load audio if not already loaded
      const currentAudio = this.audioManager.getCurrentAudio();
      if (!currentAudio || currentAudio.filePath !== filePath) {
        window.electron.debugLog("info", "[NMF] Loading audio file", {
          filePath,
        });
        await this.handleDisplayCommand([filePath]);
      }

      const audio = this.audioManager.getCurrentAudio();
      if (!audio || !audio.hash) {
        this.terminal.writeln("\x1b[31mFailed to load audio file\x1b[0m");
        window.electron.debugLog("error", "[NMF] Failed to load audio", {
          filePath,
        });
        return;
      }

      window.electron.debugLog("info", "[NMF] Audio loaded, analyzing", {
        samples: audio.audioData.length,
        sampleRate: audio.sampleRate,
        hash: audio.hash,
      });
      this.terminal.writeln("\x1b[36mPerforming NMF decomposition...\x1b[0m");

      // Parse options from command line if provided
      const options = this.parseNMFOptions(optionArgs);
      const result = await window.electron.analyzeBufNMF(
        audio.audioData,
        audio.sampleRate,
        options,
      );

      window.electron.debugLog("info", "[NMF] Analysis complete", {
        components: result.components,
        iterations: result.iterations,
        converged: result.converged,
        options,
      });

      // Store feature in database - pass as array of numbers (flattened)
      const flattenedData = [
        result.components,
        result.iterations,
        result.converged ? 1 : 0,
        ...result.bases.flat(),
        ...result.activations.flat(),
      ];
      const featureId = await window.electron.storeFeature(
        audio.hash,
        "nmf",
        flattenedData,
        { ...options, components: result.components },
      );

      window.electron.debugLog("info", "[NMF] Feature stored", { featureId });

      this.terminal.writeln(`\x1b[32mNMF decomposition complete\x1b[0m`);
      this.terminal.writeln(`Components: ${result.components}`);
      this.terminal.writeln(`Iterations: ${result.iterations}`);
      this.terminal.writeln(`Converged: ${result.converged ? "Yes" : "No"}`);
      this.terminal.writeln(`Feature ID: ${featureId}`);

      // Check if this was a duplicate
      const feature = await window.electron.getMostRecentFeature(
        audio.hash,
        "nmf",
      );
      if (feature && feature.id === featureId) {
        const shortHash = feature.feature_hash.substring(0, 8);
        this.terminal.writeln(`Feature Hash: ${shortHash}`);
      }

      // Create visualization
      window.electron.debugLog("info", "[NMF] Creating visualization");
      await this.visualizeNMF(result, audio.sampleRate);
    } catch (error) {
      window.electron.debugLog("error", "[NMF] Error in analysis", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.terminal.writeln(
        `\x1b[31mError performing NMF: ${error instanceof Error ? error.message : String(error)}\x1b[0m`,
      );
    }
  }

  private parseNMFOptions(args: string[]): BufNMFOptions {
    const options: BufNMFOptions = {};

    for (let i = 0; i < args.length; i += 2) {
      const key = args[i];
      const value = args[i + 1];

      if (!value) continue;

      switch (key) {
        case "--components":
          options.components = parseInt(value);
          break;
        case "--iterations":
          options.iterations = parseInt(value);
          break;
        case "--fft-size":
          options.fftSize = parseInt(value);
          break;
        case "--hop-size":
          options.hopSize = parseInt(value);
          break;
        case "--window-size":
          options.windowSize = parseInt(value);
          break;
        case "--seed":
          options.seed = parseInt(value);
          break;
      }
    }

    return options;
  }

  private async visualizeNMF(
    result: BufNMFResult,
    sampleRate: number,
  ): Promise<void> {
    try {
      // Get or create visualization manager
      const vizContainer = document.getElementById("visualizations-container");
      if (!vizContainer) {
        window.electron.debugLog(
          "error",
          "[NMF] Visualization container not found",
        );
        return;
      }

      const vizManager = new VisualizationManager("visualizations-container");

      window.electron.debugLog("info", "[NMF] Adding visualization panel");

      const viz = vizManager.addVisualization("NMF Decomposition", 400);
      const canvas = viz.canvas;

      if (!canvas) {
        window.electron.debugLog("error", "[NMF] Failed to get canvas", {
          vizId: viz.id,
        });
        return;
      }

      window.electron.debugLog("info", "[NMF] Creating NMF visualizer", {
        vizId: viz.id,
        components: result.components,
        basesCount: result.bases.length,
        activationsCount: result.activations.length,
      });

      // Create visualizer
      new NMFVisualizer(canvas, {
        bases: result.bases,
        activations: result.activations,
        sampleRate: sampleRate,
        components: result.components,
      });

      window.electron.debugLog("info", "[NMF] Visualization complete");
    } catch (error) {
      window.electron.debugLog("error", "[NMF] Visualization error", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleSliceCommand(_args: string[]): Promise<void> {
    try {
      window.electron.debugLog("info", "[Slice] Starting slice creation");

      // Get most recent audio
      const audio = this.audioManager.getCurrentAudio();
      if (!audio || !audio.hash) {
        this.terminal.writeln(
          '\x1b[31mNo audio loaded. Use "play" or "display" first.\x1b[0m',
        );
        return;
      }

      // Get most recent feature for this sample
      const feature = await window.electron.getMostRecentFeature(
        audio.hash,
        "onset-slice",
      );
      if (!feature) {
        this.terminal.writeln(
          '\x1b[31mNo onset-slice analysis found. Use "analyze onset-slice" first.\x1b[0m',
        );
        return;
      }

      window.electron.debugLog("info", "[Slice] Found feature", {
        featureId: feature.id,
      });

      // Parse feature data
      const slicePositions = JSON.parse(feature.feature_data) as number[];

      this.terminal.writeln(
        `\x1b[36mCreating ${slicePositions.length - 1} slices from feature ${feature.id}...\x1b[0m`,
      );

      // Create slices in database
      const sliceIds = await window.electron.createSlices(
        audio.hash,
        feature.id,
        slicePositions,
      );

      window.electron.debugLog("info", "[Slice] Slices created", {
        count: sliceIds.length,
        firstId: sliceIds[0],
        lastId: sliceIds[sliceIds.length - 1],
      });

      this.terminal.writeln(`\x1b[32mCreated ${sliceIds.length} slices\x1b[0m`);
      this.terminal.writeln(
        `Slice IDs: ${sliceIds[0]} - ${sliceIds[sliceIds.length - 1]}`,
      );
      this.terminal.writeln("");
      this.terminal.writeln(
        '\x1b[36mTip: Use "play-slice <id>" to play individual slices\x1b[0m',
      );
    } catch (error) {
      window.electron.debugLog("error", "[Slice] Error creating slices", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.terminal.writeln(
        `\x1b[31mError creating slices: ${error instanceof Error ? error.message : String(error)}\x1b[0m`,
      );
    }
  }

  private async handlePlaySliceCommand(args: string[]): Promise<void> {
    if (args.length === 0) {
      this.terminal.writeln("\x1b[31mUsage: play-slice <slice-id>\x1b[0m");
      return;
    }

    const sliceId = parseInt(args[0]);
    if (isNaN(sliceId)) {
      this.terminal.writeln(
        "\x1b[31mInvalid slice ID. Must be a number.\x1b[0m",
      );
      return;
    }

    try {
      window.electron.debugLog("info", "[PlaySlice] Loading slice", {
        sliceId,
      });

      // Get slice from database
      const slice = await window.electron.getSlice(sliceId);
      if (!slice) {
        this.terminal.writeln(`\x1b[31mSlice ${sliceId} not found\x1b[0m`);
        return;
      }

      // Get the sample
      const sample = await window.electron.getSampleByHash(slice.sample_hash);
      if (!sample) {
        this.terminal.writeln("\x1b[31mSample not found for slice\x1b[0m");
        return;
      }

      window.electron.debugLog("info", "[PlaySlice] Sample loaded", {
        sampleHash: slice.sample_hash.substring(0, 8),
        startSample: slice.start_sample,
        endSample: slice.end_sample,
      });

      // Convert Buffer back to Float32Array
      const fullAudioData = new Float32Array(
        sample.audio_data.buffer,
        sample.audio_data.byteOffset,
        sample.audio_data.byteLength / Float32Array.BYTES_PER_ELEMENT,
      );

      // Extract slice segment
      const startSample = slice.start_sample;
      const endSample = slice.end_sample;
      const lengthSamples = endSample - startSample;
      const duration = lengthSamples / sample.sample_rate;

      // Extract channel data for the slice
      const sliceChannelData = fullAudioData.slice(startSample, endSample);

      // Create audio object for playback (slices don't have onset markers)
      const audio = {
        audioData: sliceChannelData,
        sampleRate: sample.sample_rate,
        duration: duration,
        filePath: `Slice ${sliceId} from ${sample.file_path}`,
        hash: sample.hash,
        visualize: () => "Visualization not available for slices",
        analyzeOnsetSlice: async () => ({
          slices: [],
          visualize: () => "Not available",
        }),
      };

      // Set as current audio (this clears any previous onset slices)
      this.audioManager.setCurrentAudio(audio);

      window.electron.debugLog("debug", "[PlaySlice] Before clearSlices", {
        slicesPresent: !!this.audioManager.getCurrentSlices(),
      });

      this.audioManager.clearSlices(); // Explicitly clear slices

      window.electron.debugLog("debug", "[PlaySlice] After clearSlices", {
        slicesPresent: !!this.audioManager.getCurrentSlices(),
      });

      await this.audioManager.playAudio(audio.audioData, audio.sampleRate);

      // Update waveform visualization (without slice markers)
      this.updateWaveformVisualization();

      this.terminal.writeln(`\x1b[32mPlaying slice ${sliceId}\x1b[0m`);
      this.terminal.writeln(
        `Slice ${slice.slice_index}: ${startSample} - ${endSample} (${duration.toFixed(3)}s)`,
      );

      window.electron.debugLog("info", "[PlaySlice] Playback started", {
        sliceId,
      });
    } catch (error) {
      window.electron.debugLog("error", "[PlaySlice] Error playing slice", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.terminal.writeln(
        `\x1b[31mError playing slice: ${error instanceof Error ? error.message : String(error)}\x1b[0m`,
      );
    }
  }

  private async handleVisualizeNmfCommand(args: string[]): Promise<void> {
    await window.electron.debugLog(
      "info",
      "[App] visualize-nmf command called",
      { args },
    );
    if (args.length === 0) {
      this.terminal.writeln(
        "\x1b[31mUsage: visualize-nmf <sample-hash>\x1b[0m",
      );
      return;
    }

    const hash = args[0];

    window.electron.debugLog(
      "info",
      "[Renderer] handleVisualizeNmfCommand called",
      { hash },
    );

    try {
      window.electron.debugLog("info", "[Renderer] Calling visualizeNMF IPC", {
        hash,
      });
      await window.electron.visualizeNMF(hash);
      window.electron.debugLog(
        "info",
        "[Renderer] visualizeNMF IPC completed",
        { hash },
      );
      this.terminal.writeln(
        `\x1b[32mNMF visualization overlaid for sample ${hash}\x1b[0m`,
      );
    } catch (error) {
      window.electron.debugLog("error", "[Renderer] visualizeNMF IPC failed", {
        hash,
        error: String(error),
      });
      this.terminal.writeln(
        `\x1b[31mError: ${error instanceof Error ? error.message : String(error)}\x1b[0m`,
      );
    }
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

  private async handleListCommand(args: string[]): Promise<void> {
    if (args.length === 0) {
      this.terminal.writeln(
        "\x1b[31mUsage: list <samples|features|slices>\x1b[0m",
      );
      return;
    }

    const what = args[0].toLowerCase();

    try {
      switch (what) {
        case "samples":
          await this.listSamples();
          break;

        case "features":
          await this.listFeatures();
          break;

        case "slices":
          await this.listSlices();
          break;

        default:
          this.terminal.writeln(`\x1b[31mUnknown list target: ${what}\x1b[0m`);
          this.terminal.writeln("Available: samples, features, slices");
          break;
      }
    } catch (error) {
      this.terminal.writeln(
        `\x1b[31mError listing ${what}: ${error instanceof Error ? error.message : String(error)}\x1b[0m`,
      );
    }
  }

  private async listSamples(): Promise<void> {
    const samples = await window.electron.listSamples();

    if (samples.length === 0) {
      this.terminal.writeln("\x1b[33mNo samples in database\x1b[0m");
      return;
    }

    this.terminal.writeln("\x1b[1;36mStored Samples:\x1b[0m");
    this.terminal.writeln("");

    for (const sample of samples) {
      const shortHash = sample.hash.substring(0, 8);
      const sizeMB = (sample.data_size / 1024 / 1024).toFixed(2);
      const fileName = sample.file_path.split("/").pop();

      this.terminal.writeln(`  \x1b[33m${sample.id}\x1b[0m: ${fileName}`);
      this.terminal.writeln(
        `     Hash: ${shortHash}  Duration: ${sample.duration.toFixed(2)}s  Size: ${sizeMB} MB`,
      );
      this.terminal.writeln(
        `     ${sample.sample_rate}Hz, ${sample.channels} channel(s)`,
      );
    }

    this.terminal.writeln("");
    this.terminal.writeln(`Total: ${samples.length} sample(s)`);
  }

  private async listFeatures(): Promise<void> {
    const features = await window.electron.listFeatures();

    if (features.length === 0) {
      this.terminal.writeln("\x1b[33mNo features in database\x1b[0m");
      return;
    }

    this.terminal.writeln("\x1b[1;36mAnalysis Features:\x1b[0m");
    this.terminal.writeln("");

    for (const feature of features) {
      const shortSampleHash = feature.sample_hash.substring(0, 8);
      const shortFeatureHash = feature.feature_hash.substring(0, 8);
      const timestamp = new Date(feature.created_at).toLocaleString();

      this.terminal.writeln(
        `  \x1b[33m${feature.id}\x1b[0m: ${feature.feature_type}`,
      );
      this.terminal.writeln(
        `     Sample: ${shortSampleHash}  Feature Hash: ${shortFeatureHash}`,
      );
      this.terminal.writeln(
        `     Slices: ${feature.slice_count}  Created: ${timestamp}`,
      );
      if (feature.options) {
        this.terminal.writeln(`     Options: ${feature.options}`);
      }
    }

    this.terminal.writeln("");
    this.terminal.writeln(`Total: ${features.length} feature(s)`);
  }

  private async listSlices(): Promise<void> {
    const slicesSummary = await window.electron.listSlicesSummary();

    if (slicesSummary.length === 0) {
      this.terminal.writeln("\x1b[33mNo slices in database\x1b[0m");
      return;
    }

    this.terminal.writeln("\x1b[1;36mSlices by Sample:\x1b[0m");
    this.terminal.writeln("");

    let totalSlices = 0;
    for (const summary of slicesSummary) {
      const shortHash = summary.sample_hash.substring(0, 8);
      const fileName = summary.file_path.split("/").pop();

      this.terminal.writeln(`  \x1b[33m${shortHash}\x1b[0m: ${fileName}`);
      this.terminal.writeln(
        `     ${summary.slice_count} slices (IDs: ${summary.min_slice_id} - ${summary.max_slice_id})`,
      );
      this.terminal.writeln(`     Feature ID: ${summary.feature_id}`);

      totalSlices += summary.slice_count;
    }

    this.terminal.writeln("");
    this.terminal.writeln(
      `Total: ${totalSlices} slice(s) across ${slicesSummary.length} sample(s)`,
    );
  }

  private handleHelpCommand(args: string[]): void {
    // If a specific command is requested, show detailed help
    if (args.length > 0) {
      this.showCommandHelp(args[0].toLowerCase());
      return;
    }

    // Otherwise show general help
    this.terminal.writeln("\x1b[1;36mAvailable Commands:\x1b[0m");
    this.terminal.writeln("");
    this.terminal.writeln(
      '  \x1b[33mdisplay "path/to/audio/file"\x1b[0m - Load and visualize audio file',
    );
    this.terminal.writeln("    Supports: WAV, MP3, OGG, FLAC, M4A, AAC, OPUS");
    this.terminal.writeln(
      '  \x1b[33mplay "path/to/audio/file"\x1b[0m - Play audio file with cursor visualization',
    );
    this.terminal.writeln("  \x1b[33mstop\x1b[0m - Stop audio playback");
    this.terminal.writeln(
      '  \x1b[33manalyze onset-slice "path/to/audio/file"\x1b[0m - Analyze onset slices',
    );
    this.terminal.writeln(
      "    Options: --threshold, --min-slice-length, --filter-size, etc.",
    );
    this.terminal.writeln(
      "  \x1b[33mslice\x1b[0m - Create slices from most recent onset analysis",
    );
    this.terminal.writeln(
      "  \x1b[33mplay-slice <id>\x1b[0m - Play an individual slice",
    );
    this.terminal.writeln(
      "  \x1b[33mlist samples\x1b[0m - List all stored audio samples",
    );
    this.terminal.writeln(
      "  \x1b[33mlist features\x1b[0m - List all analysis features",
    );
    this.terminal.writeln(
      "  \x1b[33mlist slices\x1b[0m - List slice summary by sample",
    );
    this.terminal.writeln(
      "  \x1b[33mdebug [limit]\x1b[0m - Show debug logs (default: 20)",
    );
    this.terminal.writeln(
      "  \x1b[33mclear-debug\x1b[0m - Clear all debug logs",
    );
    this.terminal.writeln(
      "  \x1b[33mhelp [command]\x1b[0m - Show this help message or help for a specific command",
    );
    this.terminal.writeln("  \x1b[33mclear\x1b[0m - Clear terminal screen");
    this.terminal.writeln("");
    this.terminal.writeln(
      "\x1b[36mFor detailed help on a command, type: help <command>\x1b[0m",
    );
    this.terminal.writeln("");
    this.terminal.writeln("\x1b[1;36mKeyboard Shortcuts:\x1b[0m");
    this.terminal.writeln(
      "  \x1b[33mCtrl+R\x1b[0m - Reverse search command history",
    );
    this.terminal.writeln("  \x1b[33m↑/↓\x1b[0m - Navigate command history");
    this.terminal.writeln("  \x1b[33mEsc / Ctrl+G\x1b[0m - Exit search mode");
    this.terminal.writeln("");
    this.terminal.writeln("\x1b[1;36mTypeScript REPL:\x1b[0m");
    this.terminal.writeln(
      "  \x1b[33mconst audio = await loadAudio(path)\x1b[0m - Load audio file",
    );
    this.terminal.writeln("  \x1b[33maudio.visualize()\x1b[0m - Show waveform");
    this.terminal.writeln(
      "  \x1b[33mconst slices = await audio.analyzeOnsetSlice(options)\x1b[0m - Analyze onsets",
    );
    this.terminal.writeln("");
  }

  private showCommandHelp(command: string): void {
    switch (command) {
      case "play":
        this.terminal.writeln("\x1b[1;36mCommand: play\x1b[0m");
        this.terminal.writeln("");
        this.terminal.writeln(
          '\x1b[33mUsage:\x1b[0m play "path/to/audio/file"',
        );
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mDescription:\x1b[0m");
        this.terminal.writeln(
          "  Loads and plays an audio file with real-time cursor visualization.",
        );
        this.terminal.writeln(
          "  The waveform is displayed with a moving playback cursor.",
        );
        this.terminal.writeln(
          "  Audio data is automatically stored in the database with a content hash.",
        );
        this.terminal.writeln("");
        this.terminal.writeln(
          "\x1b[33mSupported formats:\x1b[0m WAV, MP3, OGG, FLAC, M4A, AAC, OPUS",
        );
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mExample:\x1b[0m");
        this.terminal.writeln('  play "/Users/username/Music/song.flac"');
        break;

      case "display":
        this.terminal.writeln("\x1b[1;36mCommand: display\x1b[0m");
        this.terminal.writeln("");
        this.terminal.writeln(
          '\x1b[33mUsage:\x1b[0m display "path/to/audio/file"',
        );
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mDescription:\x1b[0m");
        this.terminal.writeln(
          "  Loads and visualizes an audio file without playing it.",
        );
        this.terminal.writeln(
          "  Use this to view the waveform or prepare for analysis.",
        );
        this.terminal.writeln("");
        this.terminal.writeln(
          "\x1b[33mSupported formats:\x1b[0m WAV, MP3, OGG, FLAC, M4A, AAC, OPUS",
        );
        break;

      case "stop":
        this.terminal.writeln("\x1b[1;36mCommand: stop\x1b[0m");
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mUsage:\x1b[0m stop");
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mDescription:\x1b[0m");
        this.terminal.writeln("  Stops the currently playing audio.");
        break;

      case "analyze":
        this.terminal.writeln("\x1b[1;36mCommand: analyze\x1b[0m");
        this.terminal.writeln("");
        this.terminal.writeln(
          '\x1b[33mUsage:\x1b[0m analyze onset-slice "path/to/audio/file" [options]',
        );
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mDescription:\x1b[0m");
        this.terminal.writeln(
          "  Analyzes onset positions in an audio file using FluidOnsetSlice.",
        );
        this.terminal.writeln(
          "  Results are stored in the database as a feature with a unique hash.",
        );
        this.terminal.writeln(
          "  Onset markers are displayed on the waveform visualization.",
        );
        this.terminal.writeln(
          "  Running the same analysis twice returns the existing feature (deduplication).",
        );
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mOptions:\x1b[0m");
        this.terminal.writeln(
          "  --threshold <value>        Detection threshold (default: 0.5)",
        );
        this.terminal.writeln(
          "  --min-slice-length <n>     Minimum samples between slices (default: 2)",
        );
        this.terminal.writeln(
          "  --filter-size <n>          Smoothing filter size (default: 5)",
        );
        this.terminal.writeln(
          "  --frame-size <n>           Analysis frame size (default: 512)",
        );
        this.terminal.writeln(
          "  --hop-size <n>             Hop size between frames (default: 512)",
        );
        this.terminal.writeln(
          "  --metric <0-9>             Detection metric (default: 0)",
        );
        this.terminal.writeln(
          "  --function <0-16>          Detection function (default: 0)",
        );
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mExample:\x1b[0m");
        this.terminal.writeln('  analyze onset-slice "audio.wav"');
        this.terminal.writeln(
          '  analyze onset-slice "audio.wav" --threshold 0.3 --min-slice-length 4410',
        );
        this.terminal.writeln("");
        this.terminal.writeln('  analyze nmf "audio.wav"');
        this.terminal.writeln(
          '  analyze nmf "audio.wav" --components 5 --iterations 200',
        );
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mNMF Options:\x1b[0m");
        this.terminal.writeln(
          "  --components <n>           Number of NMF components (default: 1)",
        );
        this.terminal.writeln(
          "  --iterations <n>           Number of iterations (default: 100)",
        );
        this.terminal.writeln(
          "  --fft-size <n>             FFT size (default: 1024)",
        );
        this.terminal.writeln(
          "  --hop-size <n>             Hop size (default: -1, auto)",
        );
        this.terminal.writeln(
          "  --window-size <n>          Window size (default: -1, auto)",
        );
        this.terminal.writeln(
          "  --seed <n>                 Random seed (default: -1, random)",
        );
        break;

      case "slice":
        this.terminal.writeln("\x1b[1;36mCommand: slice\x1b[0m");
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mUsage:\x1b[0m slice");
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mDescription:\x1b[0m");
        this.terminal.writeln(
          "  Creates slice records from the most recent onset-slice analysis.",
        );
        this.terminal.writeln(
          "  Each slice has a start and end sample position.",
        );
        this.terminal.writeln(
          "  Slices are stored in the database and can be exported or played.",
        );
        this.terminal.writeln(
          "  Uses implicit context - operates on most recent audio and feature.",
        );
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mWorkflow:\x1b[0m");
        this.terminal.writeln(
          '  1. play "audio.wav"                 # Load audio',
        );
        this.terminal.writeln(
          '  2. analyze onset-slice "audio.wav"  # Find onsets',
        );
        this.terminal.writeln(
          "  3. slice                            # Create slice records",
        );
        break;

      case "play-slice":
        this.terminal.writeln("\x1b[1;36mCommand: play-slice\x1b[0m");
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mUsage:\x1b[0m play-slice <slice-id>");
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mDescription:\x1b[0m");
        this.terminal.writeln("  Plays back an individual slice by its ID.");
        this.terminal.writeln(
          "  The slice audio is extracted from the stored sample and played.",
        );
        this.terminal.writeln(
          "  Useful for auditioning slices before exporting.",
        );
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mArguments:\x1b[0m");
        this.terminal.writeln(
          "  slice-id    The numeric ID of the slice to play",
        );
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mExample:\x1b[0m");
        this.terminal.writeln("  play-slice 1     # Play slice with ID 1");
        this.terminal.writeln("  play-slice 42    # Play slice with ID 42");
        this.terminal.writeln("");
        this.terminal.writeln(
          '\x1b[33mTip:\x1b[0m Use "slice" command first to create slices from analysis',
        );
        break;

      case "list":
        this.terminal.writeln("\x1b[1;36mCommand: list\x1b[0m");
        this.terminal.writeln("");
        this.terminal.writeln(
          "\x1b[33mUsage:\x1b[0m list <samples|features|slices>",
        );
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mDescription:\x1b[0m");
        this.terminal.writeln("  Lists items stored in the database.");
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mSubcommands:\x1b[0m");
        this.terminal.writeln(
          "  list samples    Show all stored audio samples with metadata",
        );
        this.terminal.writeln(
          "  list features   Show all analysis features with slice counts",
        );
        this.terminal.writeln(
          "  list slices     Show slice summary grouped by sample",
        );
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mExample:\x1b[0m");
        this.terminal.writeln("  list samples");
        this.terminal.writeln("  list features");
        this.terminal.writeln("  list slices");
        break;

      case "debug":
        this.terminal.writeln("\x1b[1;36mCommand: debug\x1b[0m");
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mUsage:\x1b[0m debug [limit]");
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mDescription:\x1b[0m");
        this.terminal.writeln("  Shows recent debug logs from the database.");
        this.terminal.writeln(
          "  Logs include timestamps, levels (INFO, ERROR, etc.), and data.",
        );
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mArguments:\x1b[0m");
        this.terminal.writeln(
          "  limit    Number of log entries to show (default: 20)",
        );
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mExample:\x1b[0m");
        this.terminal.writeln("  debug       # Show last 20 logs");
        this.terminal.writeln("  debug 50    # Show last 50 logs");
        break;

      case "clear-debug":
        this.terminal.writeln("\x1b[1;36mCommand: clear-debug\x1b[0m");
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mUsage:\x1b[0m clear-debug");
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mDescription:\x1b[0m");
        this.terminal.writeln("  Deletes all debug logs from the database.");
        break;

      case "clear":
        this.terminal.writeln("\x1b[1;36mCommand: clear\x1b[0m");
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mUsage:\x1b[0m clear");
        this.terminal.writeln("");
        this.terminal.writeln("\x1b[33mDescription:\x1b[0m");
        this.terminal.writeln("  Clears the terminal screen.");
        break;

      default:
        this.terminal.writeln(
          `\x1b[31mNo help available for command: ${command}\x1b[0m`,
        );
        this.terminal.writeln(
          "Type \x1b[33mhelp\x1b[0m to see all available commands.",
        );
        break;
    }
  }

  private updateWaveformVisualization(): void {
    const audio = this.audioManager.getCurrentAudio();
    if (!audio) return;

    const container = document.getElementById("waveform-container");
    if (!container) return;

    container.classList.add("active");

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

  private updatePlaybackCursor(position: number): void {
    const audio = this.audioManager.getCurrentAudio();
    if (!audio || !this.waveformVisualizer) return;

    this.waveformVisualizer.updatePlaybackCursor(
      position,
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

    if (code === 27) {
      // Esc - exit search mode without executing
      this.exitSearchMode(false);
    } else if (code === 3) {
      // Ctrl+C - cancel search
      this.exitSearchMode(false);
    } else if (code === 7) {
      // Ctrl+G - cancel search (bash-style)
      this.exitSearchMode(false);
    } else if (code === 13) {
      // Enter - execute matched command
      this.exitSearchMode(true).catch((error) => {
        console.error("Error executing command from search:", error);
      });
    } else if (code === 127) {
      // Backspace - remove character from search
      if (this.searchQuery.length > 0) {
        this.searchQuery = this.searchQuery.slice(0, -1);
        this.performSearch();
      }
    } else if (code >= 32) {
      // Regular character - add to search query
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

  private async exitSearchMode(executeCommand: boolean): Promise<void> {
    this.isReverseSearchMode = false;

    this.clearCurrentLine();

    if (executeCommand && this.searchResultIndex >= 0) {
      const command = this.matchedCommands[this.searchResultIndex];
      this.terminal.write(`> ${command}`);
      this.terminal.write("\r\n");
      await this.executeCommand(command);
      this.commandBuffer = "";
    } else {
      // Restore saved buffer if not executing
      this.commandBuffer = this.savedCommandBuffer;
    }

    this.searchQuery = "";
    this.searchResultIndex = -1;
    this.matchedCommands = [];
    this.savedCommandBuffer = "";
    this.printPrompt();
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
}
