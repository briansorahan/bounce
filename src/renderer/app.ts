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
  private commandHistory: string[] = [];
  private historyIndex: number = -1;

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
  }

  mount(containerId: string): void {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }

    this.terminal.open(container);
    this.fitAddon.fit();

    this.printWelcome();
    this.printPrompt();

    window.addEventListener('resize', () => {
      this.fitAddon.fit();
    });
  }

  private setupEventHandlers(): void {
    this.terminal.onData((data) => {
      this.handleInput(data);
    });
  }

  private handleInput(data: string): void {
    const code = data.charCodeAt(0);

    if (code === 13) {
      this.terminal.write('\r\n');
      this.executeCommand(this.commandBuffer);
      this.commandBuffer = '';
      this.historyIndex = -1;
      this.printPrompt();
    } else if (code === 127) {
      if (this.commandBuffer.length > 0) {
        this.commandBuffer = this.commandBuffer.slice(0, -1);
        this.terminal.write('\b \b');
      }
    } else if (code === 27) {
      if (data === '\x1b[A') {
        this.navigateHistory(-1);
      } else if (data === '\x1b[B') {
        this.navigateHistory(1);
      }
    } else if (code >= 32) {
      this.commandBuffer += data;
      this.terminal.write(data);
    }
  }

  private navigateHistory(direction: number): void {
    if (this.commandHistory.length === 0) return;

    const newIndex = this.historyIndex + direction;
    if (newIndex >= -1 && newIndex < this.commandHistory.length) {
      this.clearCurrentLine();
      this.historyIndex = newIndex;

      if (this.historyIndex === -1) {
        this.commandBuffer = '';
      } else {
        this.commandBuffer = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex];
      }

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
    this.terminal.writeln('Available commands:');
    this.terminal.writeln('  \x1b[33mconst audio = await loadAudio(path)\x1b[0m - Load an audio file');
    this.terminal.writeln('  \x1b[33maudio.visualize()\x1b[0m - Show waveform visualization');
    this.terminal.writeln('  \x1b[33mconst slices = await audio.analyzeOnsetSlice(options)\x1b[0m - Detect onset slices');
    this.terminal.writeln('  \x1b[33mslices.visualize()\x1b[0m - Show slice markers');
    this.terminal.writeln('');
  }

  private printPrompt(): void {
    this.terminal.write('\x1b[32m>\x1b[0m ');
  }

  private async executeCommand(command: string): Promise<void> {
    const trimmed = command.trim();
    if (!trimmed) return;

    this.commandHistory.push(trimmed);

    try {
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

  private updateWaveformVisualization(): void {
    const audio = this.audioContext.getCurrentAudio();
    if (!audio) return;

    if (!this.waveformVisualizer) {
      const container = document.getElementById('waveform-container');
      if (container) {
        container.style.display = 'block';
        this.waveformVisualizer = new WaveformVisualizer('waveform-canvas', 'analysis-canvas');
      }
    }

    if (this.waveformVisualizer) {
      this.waveformVisualizer.drawWaveform(audio.audioData, audio.sampleRate);
      
      const slices = this.audioContext.getCurrentSlices();
      if (slices) {
        this.waveformVisualizer.drawSliceMarkers(slices, audio.audioData.length);
      }
    }
  }
}
