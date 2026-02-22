import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

export class BounceTerminal {
  private xterm: Terminal;
  private fitAddon: FitAddon;

  constructor() {
    this.xterm = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        black: "#000000",
        red: "#cd3131",
        green: "#0dbc79",
        yellow: "#e5e510",
        blue: "#2472c8",
        magenta: "#bc3fbc",
        cyan: "#11a8cd",
        white: "#e5e5e5",
        brightBlack: "#666666",
        brightRed: "#f14c4c",
        brightGreen: "#23d18b",
        brightYellow: "#f5f543",
        brightBlue: "#3b8eea",
        brightMagenta: "#d670d6",
        brightCyan: "#29b8db",
        brightWhite: "#ffffff",
      },
    });
    this.fitAddon = new FitAddon();
    this.xterm.loadAddon(this.fitAddon);
  }

  clear() {
    this.xterm.clear();
  }

  fit() {
    this.fitAddon.fit();
  }

  focus() {
    this.xterm.focus();
  }

  onData(handler: (data: string) => void) {
    this.xterm.onData(handler);
  }

  open(container: HTMLElement): void {
    this.xterm.open(container);
  }

  write(content: string) {
    this.xterm.write(content);
  }

  writeln(content: string) {
    this.xterm.writeln(content);
  }
}
