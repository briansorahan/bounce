---
name: add-terminal-command
description: Guide for adding built-in commands to the xterm TypeScript REPL
version: 1.0.0
created: 2026-02-15
updated: 2026-02-15
tags: [electron, terminal, xterm, renderer, commands]
---

# Skill: Add Terminal Command

This skill guides you through adding new built-in commands to the Electron app's xterm-based TypeScript REPL.

## When to Use This Skill

Use this skill when you need to:
- Add a simple command like `display "file.wav"` or `help`
- Create convenience commands that wrap TypeScript code
- Add commands that interact with the file system or Electron APIs
- Provide user-friendly shortcuts for common operations

## Prerequisites

Before starting, ensure:
- You understand the difference between built-in commands and evaluated TypeScript code
- The command has a clear syntax and purpose
- Required functionality exists (IPC handlers, visualizers, etc.)

## Current Architecture

The terminal currently uses **TypeScript evaluation** for all commands:

```typescript
// User types this:
const audio = await loadAudio('./file.wav')
audio.visualize()

// Code is evaluated with async eval
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
const fn = new AsyncFunction('loadAudio', `return (${code})`);
return await fn(loadAudio);
```

**Limitation:** This requires users to write valid TypeScript/JavaScript syntax.

## Command Types

### Type 1: Simple Built-in Commands

Commands with fixed syntax that don't require TypeScript knowledge:

```bash
display "path/to/file.wav"
help
clear
ls
```

### Type 2: Hybrid Commands

Commands that can work both ways:

```bash
load "file.wav"              # Built-in command
const audio = load("file")   # Also works in TypeScript
```

## Step-by-Step Guide

### Adding a Simple Built-in Command

#### Step 1: Add Command Parser

Create or update command parsing logic in `src/renderer/app.ts`:

```typescript
export class BounceApp {
  // ... existing code ...

  private async executeCommand(command: string): Promise<void> {
    const trimmed = command.trim();
    if (!trimmed) return;

    this.commandHistory.push(trimmed);

    try {
      // Check for built-in commands first
      if (await this.handleBuiltInCommand(trimmed)) {
        return;
      }

      // Fall back to TypeScript evaluation
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
    // Parse command name and arguments
    const parts = this.parseCommand(command);
    if (!parts) return false;

    const { name, args } = parts;

    switch (name) {
      case 'display':
        await this.handleDisplayCommand(args);
        return true;
      
      case 'help':
        this.handleHelpCommand();
        return true;
      
      case 'clear':
        this.terminal.clear();
        return true;
      
      // Add more commands here
      
      default:
        return false;
    }
  }
}
```

#### Step 2: Add Command Parser

Implement a simple command parser:

```typescript
private parseCommand(input: string): { name: string; args: string[] } | null {
  // Match: commandName "arg1" "arg2" or commandName arg1 arg2
  const quotedArgsRegex = /^(\w+)\s+(.+)$/;
  const match = input.match(quotedArgsRegex);
  
  if (!match) {
    // Command with no args
    return { name: input.trim(), args: [] };
  }

  const name = match[1];
  const argsString = match[2];
  
  // Parse quoted arguments: "arg1" "arg2"
  const args: string[] = [];
  const quotedArgRegex = /"([^"]+)"|'([^']+)'|(\S+)/g;
  let argMatch;
  
  while ((argMatch = quotedArgRegex.exec(argsString)) !== null) {
    args.push(argMatch[1] || argMatch[2] || argMatch[3]);
  }
  
  return { name, args };
}
```

#### Step 3: Implement Command Handler

Add the specific command handler:

```typescript
private async handleDisplayCommand(args: string[]): Promise<void> {
  if (args.length === 0) {
    this.terminal.writeln('\x1b[31mError: display requires a file path\x1b[0m');
    this.terminal.writeln('Usage: display "path/to/file.wav"');
    return;
  }

  const filePath = args[0];

  try {
    // Load the audio file
    const audioData = await window.electron.readAudioFile(filePath);
    
    // Create audio object (similar to loadAudio function)
    const audio = {
      audioData: audioData.channelData,
      sampleRate: audioData.sampleRate,
      duration: audioData.duration,
      visualize: () => 'Visualization updated',
      analyzeOnsetSlice: async (options?: any) => {
        const slices = await window.electron.analyzeOnsetSlice(audioData.channelData, options);
        return { slices, visualize: () => 'Slice markers updated' };
      }
    };

    // Set as current audio in context
    this.audioContext.setCurrentAudio(audio);

    // Trigger visualization
    this.updateWaveformVisualization();

    // Print success message
    this.terminal.writeln(`\x1b[32mLoaded: ${filePath}\x1b[0m`);
    this.terminal.writeln(`Duration: ${audioData.duration.toFixed(2)}s, Sample Rate: ${audioData.sampleRate}Hz`);
  } catch (error) {
    this.terminal.writeln(`\x1b[31mError loading file: ${error instanceof Error ? error.message : String(error)}\x1b[0m`);
  }
}

private handleHelpCommand(): void {
  this.terminal.writeln('\x1b[1;36mAvailable Commands:\x1b[0m');
  this.terminal.writeln('');
  this.terminal.writeln('  \x1b[33mdisplay "path/to/file.wav"\x1b[0m - Load and visualize audio file');
  this.terminal.writeln('  \x1b[33mhelp\x1b[0m - Show this help message');
  this.terminal.writeln('  \x1b[33mclear\x1b[0m - Clear terminal screen');
  this.terminal.writeln('');
  this.terminal.writeln('\x1b[1;36mTypeScript REPL:\x1b[0m');
  this.terminal.writeln('  \x1b[33mconst audio = await loadAudio(path)\x1b[0m - Load audio file');
  this.terminal.writeln('  \x1b[33maudio.visualize()\x1b[0m - Show waveform');
  this.terminal.writeln('  \x1b[33mconst slices = await audio.analyzeOnsetSlice(options)\x1b[0m - Analyze onsets');
  this.terminal.writeln('');
}
```

#### Step 4: Update AudioContext (if needed)

If your command needs to store state in `AudioContext`, add a setter:

```typescript
// In src/renderer/audio-context.ts
export class AudioContext {
  private currentAudio: AudioData | null = null;

  setCurrentAudio(audio: AudioData): void {
    this.currentAudio = audio;
  }

  getCurrentAudio(): AudioData | null {
    return this.currentAudio;
  }
}
```

#### Step 5: Update Welcome Message

Add your new command to the welcome message in `printWelcome()`:

```typescript
private printWelcome(): void {
  this.terminal.writeln('\x1b[1;36mBounce - FluCoMa Audio Analysis Tool\x1b[0m');
  this.terminal.writeln('\x1b[90mTypeScript REPL for audio analysis\x1b[0m');
  this.terminal.writeln('');
  this.terminal.writeln('Available commands:');
  this.terminal.writeln('  \x1b[33mdisplay "path/to/file.wav"\x1b[0m - Load and visualize audio file');
  this.terminal.writeln('  \x1b[33mhelp\x1b[0m - Show available commands');
  // ... rest of commands
}
```

### Making Commands Work in Both Modes

To support both `display "file.wav"` AND `const audio = display("file.wav")`:

```typescript
// In src/renderer/audio-context.ts
async evaluate(code: string): Promise<any> {
  // Expose built-in commands as functions
  const display = async (path: string) => {
    return await this.loadAudioFile(path);
  };

  const loadAudio = async (path: string) => {
    return await this.loadAudioFile(path);
  };

  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const fn = new AsyncFunction('loadAudio', 'display', `return (${code})`);
  return await fn(loadAudio, display);
}
```

## Command Syntax Patterns

### Simple Command (No Args)

```typescript
case 'help':
  this.handleHelpCommand();
  return true;
```

### Command with Required Path

```typescript
case 'display':
  if (args.length === 0) {
    this.terminal.writeln('\x1b[31mError: missing path argument\x1b[0m');
    return true;
  }
  await this.handleDisplayCommand(args[0]);
  return true;
```

### Command with Options

```typescript
case 'analyze':
  // analyze onset --threshold 0.5 --function 2
  const options = this.parseOptions(args);
  await this.handleAnalyzeCommand(options);
  return true;

private parseOptions(args: string[]): Record<string, any> {
  const options: Record<string, any> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];
    options[key] = isNaN(Number(value)) ? value : Number(value);
  }
  return options;
}
```

## Critical Patterns

### Always Validate Arguments

```typescript
if (args.length < expectedCount) {
  this.terminal.writeln('\x1b[31mError: insufficient arguments\x1b[0m');
  this.terminal.writeln(`Usage: ${commandName} ${usagePattern}`);
  return;
}
```

### Use Consistent Error Colors

```typescript
// Error messages: red
this.terminal.writeln('\x1b[31mError: ...\x1b[0m');

// Success messages: green
this.terminal.writeln('\x1b[32mSuccess: ...\x1b[0m');

// Info messages: cyan
this.terminal.writeln('\x1b[36mInfo: ...\x1b[0m');

// Commands/syntax: yellow
this.terminal.writeln('\x1b[33mcommand "arg"\x1b[0m');
```

### Handle Async Operations Properly

```typescript
private async handleDisplayCommand(args: string[]): Promise<void> {
  try {
    const result = await someAsyncOperation();
    // Handle result
  } catch (error) {
    this.terminal.writeln(`\x1b[31mError: ${error.message}\x1b[0m`);
  }
}
```

### Return Boolean from Built-in Handler

```typescript
private async handleBuiltInCommand(command: string): Promise<boolean> {
  // Return true if command was handled
  // Return false to fall through to TypeScript eval
  
  switch (name) {
    case 'mycommand':
      await this.handleMyCommand(args);
      return true;  // Command handled
    
    default:
      return false;  // Not a built-in command
  }
}
```

## Common Issues

**Command not recognized**
- Check that `handleBuiltInCommand` returns `true` for your command
- Verify the command name matches exactly (case-sensitive)
- Ensure parser extracts command name correctly

**Arguments not parsed correctly**
- Test with various quote styles: `"quotes"`, `'quotes'`, `no-quotes`
- Check regex patterns match your expected format
- Print parsed args for debugging

**Async operations hang**
- Ensure all async functions use `await`
- Check that Electron IPC handlers exist
- Verify error handling doesn't swallow exceptions

**TypeScript eval conflicts**
- Check built-in commands are handled BEFORE eval
- Ensure built-in handler returns `true` to prevent fallthrough

## Reference Examples

- `src/renderer/app.ts` - `executeCommand()`: Current TypeScript eval implementation
- `src/renderer/audio-context.ts` - `evaluate()`: Function injection for REPL

## Next Steps

After adding a command:
1. Test with various argument formats
2. Add command to help output
3. Update welcome message if it's a common command
4. Consider adding tab completion for the command
