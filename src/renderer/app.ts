import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { AudioContext } from './audio-context.js';
import { WaveformVisualizer } from './waveform-visualizer.js';

export class BounceApp {
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private audioContext: AudioContext;
  private waveformVisualizer: WaveformVisualizer | null = null;
  private commandBuffer: string = '';
  private cursorPosition: number = 0; // Position within commandBuffer
  private commandHistory: string[] = [];
  private historyIndex: number = -1;
  
  // Reverse search state
  private isReverseSearchMode: boolean = false;
  private searchQuery: string = '';
  private searchResultIndex: number = -1;
  private matchedCommands: string[] = [];
  private savedCommandBuffer: string = '';

  constructor() {
    this.terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#ffffff'
      }
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.audioContext = new AudioContext();

    this.setupEventHandlers();
    this.loadHistoryFromStorage().catch(err => {
      console.error('Failed to load history:', err);
    });

    // Expose terminal and executeCommand for testing
    (window as any).__bounceTerminal = this.terminal;
    (window as any).__bounceExecuteCommand = (cmd: string) => {
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
    this.fitAddon.fit();

    // Load history before showing the prompt
    await this.loadHistoryFromStorage();

    this.printWelcome();
    this.printPrompt();

    // Auto-focus the terminal
    this.terminal.focus();

    window.addEventListener('resize', () => {
      this.fitAddon.fit();
    });

    this.audioContext.setPlaybackUpdateCallback((position) => {
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
      this.terminal.write('\r\n');
      this.executeCommand(this.commandBuffer)
        .then(() => {
          this.printPrompt();
        })
        .catch((error) => {
          console.error('[handleInput] Command execution error:', error);
          this.printPrompt();
        });
      this.commandBuffer = '';
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
      if (data === '\x1b[A') {
        // Up arrow
        this.navigateHistory(1);
      } else if (data === '\x1b[B') {
        // Down arrow
        this.navigateHistory(-1);
      } else if (data === '\x1b[C') {
        // Right arrow
        if (this.cursorPosition < this.commandBuffer.length) {
          this.cursorPosition++;
          this.updateCursorPosition();
        }
      } else if (data === '\x1b[D') {
        // Left arrow
        if (this.cursorPosition > 0) {
          this.cursorPosition--;
          this.updateCursorPosition();
        }
      } else if (data === '\x1bf' || data === '\x1bF') {
        // Alt+F - Move forward one word
        this.moveToNextWord();
      } else if (data === '\x1bb' || data === '\x1bB') {
        // Alt+B - Move backward one word
        this.moveToPreviousWord();
      } else if (data === '\x1b[3;3~' || data === '\x1b\x7f') {
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
    while (this.cursorPosition < this.commandBuffer.length && 
           this.isWordChar(this.commandBuffer[this.cursorPosition])) {
      this.cursorPosition++;
    }
    // Skip non-word characters
    while (this.cursorPosition < this.commandBuffer.length && 
           !this.isWordChar(this.commandBuffer[this.cursorPosition])) {
      this.cursorPosition++;
    }
    this.updateCursorPosition();
  }

  private moveToPreviousWord(): void {
    // Skip non-word characters
    while (this.cursorPosition > 0 && 
           !this.isWordChar(this.commandBuffer[this.cursorPosition - 1])) {
      this.cursorPosition--;
    }
    // Skip to beginning of word (alphanumeric characters)
    while (this.cursorPosition > 0 && 
           this.isWordChar(this.commandBuffer[this.cursorPosition - 1])) {
      this.cursorPosition--;
    }
    this.updateCursorPosition();
  }

  private deleteWordBackward(): void {
    if (this.cursorPosition === 0) return;

    const originalPosition = this.cursorPosition;
    
    // Skip non-word characters
    while (this.cursorPosition > 0 && 
           !this.isWordChar(this.commandBuffer[this.cursorPosition - 1])) {
      this.cursorPosition--;
    }
    // Skip to beginning of word (alphanumeric characters)
    while (this.cursorPosition > 0 && 
           this.isWordChar(this.commandBuffer[this.cursorPosition - 1])) {
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
    this.terminal.write('\r\x1b[K');
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
        this.commandBuffer = '';
      } else {
        this.commandBuffer = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex];
      }

      this.cursorPosition = this.commandBuffer.length;
      this.terminal.write(`> ${this.commandBuffer}`);
    }
  }

  private clearCurrentLine(): void {
    this.terminal.write('\r\x1b[K');
  }

  private printWelcome(): void {
    this.terminal.writeln('\x1b[1;36mBounce - FluCoMa Audio Analysis Tool\x1b[0m');
    this.terminal.writeln('\x1b[90mTypeScript REPL for audio analysis\x1b[0m');
    this.terminal.writeln('');
    this.terminal.writeln('Commands:');
    this.terminal.writeln('  \x1b[33mdisplay "path/to/audio/file"\x1b[0m - Load and visualize audio');
    this.terminal.writeln('  \x1b[33mplay "path/to/audio/file"\x1b[0m - Play audio with cursor');
    this.terminal.writeln('  \x1b[33mstop\x1b[0m - Stop playback');
    this.terminal.writeln('  \x1b[33mhelp\x1b[0m - Show all available commands');
    this.terminal.writeln('  \x1b[33mclear\x1b[0m - Clear terminal screen');
    this.terminal.writeln('');
    this.terminal.writeln('Keyboard Shortcuts:');
    this.terminal.writeln('  \x1b[90mCtrl+R\x1b[0m - Reverse search | \x1b[90mCtrl+P/N\x1b[0m - History | \x1b[90m↑/↓\x1b[0m - History');
    this.terminal.writeln('  \x1b[90mCtrl+A/E\x1b[0m - Line start/end | \x1b[90mCtrl+F/B\x1b[0m - Char forward/back');
    this.terminal.writeln('  \x1b[90mAlt+F/B\x1b[0m - Word forward/back | \x1b[90mAlt+Del\x1b[0m - Delete word | \x1b[90mCtrl+K\x1b[0m - Kill');
    this.terminal.writeln('');
  }

  private printPrompt(): void {
    this.terminal.write('\r\x1b[32m>\x1b[0m ');
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

      const result = await this.audioContext.evaluate(trimmed);
      
      if (result !== undefined) {
        if (typeof result === 'object' && result !== null) {
          this.terminal.writeln(JSON.stringify(result, null, 2));
        } else {
          this.terminal.writeln(String(result));
        }
      }

      if (this.audioContext.getCurrentAudio()) {
        this.updateWaveformVisualization();
      }
    } catch (error) {
      this.terminal.writeln(`\x1b[31mError: ${error instanceof Error ? error.message : String(error)}\x1b[0m`);
    }
  }

  private async handleBuiltInCommand(command: string): Promise<boolean> {
    const parts = this.parseCommand(command);
    if (!parts) return false;

    const { name, args } = parts;

    switch (name) {
      case 'display':
        await this.handleDisplayCommand(args);
        return true;
      
      case 'play':
        await this.handlePlayCommand(args);
        return true;
      
      case 'stop':
        this.handleStopCommand();
        return true;
      
      case 'debug':
        await this.handleDebugCommand(args);
        return true;
      
      case 'clear-debug':
        await this.handleClearDebugCommand();
        return true;
      
      case 'help':
        this.handleHelpCommand();
        return true;
      
      case 'clear':
        this.terminal.clear();
        return true;
      
      case 'analyze':
        await this.handleAnalyzeCommand(args);
        return true;
      
      default:
        return false;
    }
  }

  private parseCommand(input: string): { name: string; args: string[] } | null {
    const quotedArgsRegex = /^(\w+)\s+(.+)$/;
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
      this.terminal.writeln('\x1b[31mError: display requires a file path\x1b[0m');
      this.terminal.writeln('Usage: display "path/to/audio/file"');
      return;
    }

    const filePath = args[0];

    const supportedExtensions = ['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac', '.opus'];
    const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
    
    if (!supportedExtensions.includes(ext)) {
      this.terminal.writeln('\x1b[31mError: unsupported file format\x1b[0m');
      this.terminal.writeln('Supported formats: WAV, MP3, OGG, FLAC, M4A, AAC, OPUS');
      return;
    }

    try {
      const audioData = await window.electron.readAudioFile(filePath);
      
      const audio = {
        audioData: audioData.channelData,
        sampleRate: audioData.sampleRate,
        duration: audioData.duration,
        filePath: filePath,
        visualize: () => 'Visualization updated',
        analyzeOnsetSlice: async (options?: any) => {
          const slices = await window.electron.analyzeOnsetSlice(audioData.channelData, options);
          return { slices, visualize: () => 'Slice markers updated' };
        }
      };

      this.audioContext.setCurrentAudio(audio);
      this.updateWaveformVisualization();

      this.terminal.writeln(`\x1b[32mLoaded: ${filePath}\x1b[0m`);
      this.terminal.writeln(`Duration: ${audioData.duration.toFixed(2)}s, Sample Rate: ${audioData.sampleRate}Hz`);
    } catch (error) {
      this.terminal.writeln(`\x1b[31mError loading file: ${error instanceof Error ? error.message : String(error)}\x1b[0m`);
    }
  }

  private async handlePlayCommand(args: string[]): Promise<void> {
    if (args.length === 0) {
      this.terminal.writeln('\x1b[31mError: play requires a file path\x1b[0m');
      this.terminal.writeln('Usage: play "path/to/audio/file"');
      return;
    }

    const filePath = args[0];
    const currentAudio = this.audioContext.getCurrentAudio();

    if (currentAudio && currentAudio.filePath === filePath) {
      try {
        await this.audioContext.playAudio(currentAudio.audioData, currentAudio.sampleRate);
        this.terminal.writeln(`\x1b[32mPlaying: ${filePath}\x1b[0m`);
      } catch (error) {
        this.terminal.writeln(`\x1b[31mError playing audio: ${error instanceof Error ? error.message : String(error)}\x1b[0m`);
      }
    } else {
      await this.handleDisplayCommand(args);
      
      const audio = this.audioContext.getCurrentAudio();
      if (audio) {
        try {
          await this.audioContext.playAudio(audio.audioData, audio.sampleRate);
          this.terminal.writeln(`\x1b[32mPlaying: ${filePath}\x1b[0m`);
        } catch (error) {
          this.terminal.writeln(`\x1b[31mError playing audio: ${error instanceof Error ? error.message : String(error)}\x1b[0m`);
        }
      }
    }
  }

  private handleStopCommand(): void {
    this.audioContext.stopAudio();
    this.terminal.writeln('\x1b[32mPlayback stopped\x1b[0m');
  }

  private async handleDebugCommand(args: string[]): Promise<void> {
    const limit = args.length > 0 ? parseInt(args[0]) : 20;
    const logs = await window.electron.getDebugLogs(limit);
    
    this.terminal.writeln(`\x1b[1;36mDebug Logs (${logs.length} entries):\x1b[0m`);
    this.terminal.writeln('');
    
    for (const log of logs.reverse()) {
      const levelColor = log.level === 'error' ? '\x1b[31m' : 
                        log.level === 'warn' ? '\x1b[33m' : 
                        '\x1b[90m';
      
      const timestamp = new Date(log.timestamp).toISOString();
      const data = log.data ? ` ${log.data}` : '';
      
      this.terminal.writeln(`${levelColor}[${timestamp}] ${log.level.toUpperCase()}: ${log.message}${data}\x1b[0m`);
    }
    
    if (logs.length === 0) {
      this.terminal.writeln('\x1b[90mNo debug logs found\x1b[0m');
    }
  }

  private async handleClearDebugCommand(): Promise<void> {
    await window.electron.clearDebugLogs();
    this.terminal.writeln('\x1b[32mDebug logs cleared\x1b[0m');
  }

  private async handleAnalyzeCommand(args: string[]): Promise<void> {
    if (args.length < 2) {
      this.terminal.writeln('\x1b[31mError: analyze requires a subcommand and arguments\x1b[0m');
      this.terminal.writeln('Usage: analyze onset-slice "path/to/audio/file" [options]');
      return;
    }

    const subcommand = args[0];
    const filePath = args[1];

    switch (subcommand) {
      case 'onset-slice':
        await this.handleOnsetSliceCommand(filePath, args.slice(2));
        break;
      
      default:
        this.terminal.writeln(`\x1b[31mUnknown analysis type: ${subcommand}\x1b[0m`);
        this.terminal.writeln('Available: onset-slice');
    }
  }

  private async handleOnsetSliceCommand(filePath: string, optionArgs: string[]): Promise<void> {
    try {
      window.electron.debugLog('info', '[OnsetSlice] Starting analysis', { filePath });
      
      // Load audio if not already loaded
      const currentAudio = this.audioContext.getCurrentAudio();
      if (!currentAudio || currentAudio.filePath !== filePath) {
        window.electron.debugLog('info', '[OnsetSlice] Loading audio file', { filePath });
        await this.handleDisplayCommand([filePath]);
      }

      const audio = this.audioContext.getCurrentAudio();
      if (!audio) {
        this.terminal.writeln('\x1b[31mFailed to load audio file\x1b[0m');
        window.electron.debugLog('error', '[OnsetSlice] Failed to load audio', { filePath });
        return;
      }

      window.electron.debugLog('info', '[OnsetSlice] Audio loaded, analyzing', { 
        samples: audio.audioData.length,
        sampleRate: audio.sampleRate 
      });
      this.terminal.writeln('\x1b[36mAnalyzing onset slices...\x1b[0m');

      // Parse options from command line if provided
      const options = this.parseOnsetSliceOptions(optionArgs);
      const slices = await window.electron.analyzeOnsetSlice(audio.audioData, options);

      window.electron.debugLog('info', '[OnsetSlice] Analysis complete', { 
        sliceCount: slices.length,
        options 
      });
      this.terminal.writeln(`\x1b[32mFound ${slices.length} onset slices\x1b[0m`);

      // Store slices in audio context
      this.audioContext.setCurrentSlices(slices);
      
      // Redraw waveform with onset markers
      this.updateWaveformVisualization();

    } catch (error) {
      window.electron.debugLog('error', '[OnsetSlice] Error in analysis', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      this.terminal.writeln(`\x1b[31mError analyzing onset slices: ${error instanceof Error ? error.message : String(error)}\x1b[0m`);
    }
  }

  private parseOnsetSliceOptions(args: string[]): any {
    const options: any = {};
    
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i];
      const value = args[i + 1];
      
      if (!value) continue;

      switch (key) {
        case '--threshold':
          options.threshold = parseFloat(value);
          break;
        case '--min-slice-length':
          options.minSliceLength = parseInt(value);
          break;
        case '--filter-size':
          options.filterSize = parseInt(value);
          break;
        case '--window-size':
          options.windowSize = parseInt(value);
          break;
        case '--fft-size':
          options.fftSize = parseInt(value);
          break;
        case '--hop-size':
          options.hopSize = parseInt(value);
          break;
        case '--function':
          options.function = parseInt(value);
          break;
      }
    }

    return options;
  }

  private handleHelpCommand(): void {
    this.terminal.writeln('\x1b[1;36mAvailable Commands:\x1b[0m');
    this.terminal.writeln('');
    this.terminal.writeln('  \x1b[33mdisplay "path/to/audio/file"\x1b[0m - Load and visualize audio file');
    this.terminal.writeln('    Supports: WAV, MP3, OGG, FLAC, M4A, AAC, OPUS');
    this.terminal.writeln('  \x1b[33mplay "path/to/audio/file"\x1b[0m - Play audio file with cursor visualization');
    this.terminal.writeln('  \x1b[33mstop\x1b[0m - Stop audio playback');
    this.terminal.writeln('  \x1b[33manalyze onset-slice "path/to/audio/file"\x1b[0m - Analyze onset slices');
    this.terminal.writeln('    Options: --threshold, --min-slice-length, --filter-size, etc.');
    this.terminal.writeln('  \x1b[33mdebug [limit]\x1b[0m - Show debug logs (default: 20)');
    this.terminal.writeln('  \x1b[33mclear-debug\x1b[0m - Clear all debug logs');
    this.terminal.writeln('  \x1b[33mhelp\x1b[0m - Show this help message');
    this.terminal.writeln('  \x1b[33mclear\x1b[0m - Clear terminal screen');
    this.terminal.writeln('');
    this.terminal.writeln('\x1b[1;36mKeyboard Shortcuts:\x1b[0m');
    this.terminal.writeln('  \x1b[33mCtrl+R\x1b[0m - Reverse search command history');
    this.terminal.writeln('  \x1b[33m↑/↓\x1b[0m - Navigate command history');
    this.terminal.writeln('  \x1b[33mEsc / Ctrl+G\x1b[0m - Exit search mode');
    this.terminal.writeln('');
    this.terminal.writeln('\x1b[1;36mTypeScript REPL:\x1b[0m');
    this.terminal.writeln('  \x1b[33mconst audio = await loadAudio(path)\x1b[0m - Load audio file');
    this.terminal.writeln('  \x1b[33maudio.visualize()\x1b[0m - Show waveform');
    this.terminal.writeln('  \x1b[33mconst slices = await audio.analyzeOnsetSlice(options)\x1b[0m - Analyze onsets');
    this.terminal.writeln('');
  }

  private updateWaveformVisualization(): void {
    const audio = this.audioContext.getCurrentAudio();
    if (!audio) return;

    const container = document.getElementById('waveform-container');
    if (!container) return;

    container.classList.add('active');

    if (!this.waveformVisualizer) {
      this.waveformVisualizer = new WaveformVisualizer('waveform-canvas');
    }

    if (this.waveformVisualizer) {
      this.waveformVisualizer.setAudioContext(this.audioContext);
      const slices = this.audioContext.getCurrentSlices();
      this.waveformVisualizer.drawWaveform(audio.audioData, audio.sampleRate, slices || undefined);
    }
  }

  private updatePlaybackCursor(position: number): void {
    const audio = this.audioContext.getCurrentAudio();
    if (!audio || !this.waveformVisualizer) return;

    this.waveformVisualizer.updatePlaybackCursor(position, audio.audioData.length);
  }

  // Reverse search methods
  private handleReverseSearch(): void {
    if (!this.isReverseSearchMode) {
      // Enter search mode
      this.isReverseSearchMode = true;
      this.searchQuery = '';
      this.searchResultIndex = -1;
      this.matchedCommands = [];
      this.savedCommandBuffer = this.commandBuffer;
      this.commandBuffer = '';
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
      this.exitSearchMode(true).catch(error => {
        console.error('Error executing command from search:', error);
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
    
    if (this.searchQuery === '') {
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
    
    this.searchResultIndex = (this.searchResultIndex + 1) % this.matchedCommands.length;
    this.updateSearchPrompt();
  }

  private updateSearchPrompt(): void {
    this.clearCurrentLine();
    
    const matchedCommand = this.matchedCommands[this.searchResultIndex] || '';
    const highlighted = matchedCommand ? this.highlightMatch(matchedCommand, this.searchQuery) : '';
    
    this.terminal.write(`(reverse-i-search)\x1b[33m'${this.searchQuery}'\x1b[0m: ${highlighted}`);
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
      this.terminal.write('\r\n');
      await this.executeCommand(command);
      this.commandBuffer = '';
    } else {
      // Restore saved buffer if not executing
      this.commandBuffer = this.savedCommandBuffer;
    }
    
    this.searchQuery = '';
    this.searchResultIndex = -1;
    this.matchedCommands = [];
    this.savedCommandBuffer = '';
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
      console.error('Failed to load command history:', error);
    }
  }
}
