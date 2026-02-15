---
name: add-terminal-history-search
description: Guide for implementing reverse history search (Ctrl+R) in the xterm terminal
version: 1.0.0
created: 2026-02-15
updated: 2026-02-15
tags: [terminal, xterm, history, ui, keyboard]
---

# Skill: Add Terminal History Search

This skill guides you through implementing reverse history search (like bash's `Ctrl+R`) in the xterm-based terminal.

## When to Use This Skill

Use this skill when you need to:
- Add reverse search functionality to the terminal
- Implement keyboard shortcuts in xterm
- Add interactive search UI to the terminal
- Enhance command history navigation

## Prerequisites

Before starting, ensure:
- You understand the existing history navigation (up/down arrows)
- You're familiar with xterm keyboard event handling
- The command history is already being tracked (`commandHistory` array)

## Current History Implementation

The terminal already has:
- `commandHistory: string[]` - stores all executed commands
- `historyIndex: number` - current position in history
- Up/down arrow navigation via `navigateHistory()`
- History stored in execution order (oldest first)

Located in: `src/renderer/app.ts` in the `BounceApp` class.

## Reverse Search Design

### User Experience

1. User presses `Ctrl+R` → enters search mode
2. Terminal prompt changes to: `(reverse-i-search)'': `
3. User types search query (e.g., "play")
4. Terminal shows: `(reverse-i-search)'play': play "audio.wav"`
5. Pressing `Ctrl+R` again cycles to next match
6. `Enter` executes the found command
7. `Esc`, `Ctrl+C`, or `Ctrl+G` exits search mode

### Visual States

```
Normal mode:
> _

Search mode (no query):
(reverse-i-search)'': _

Search mode (with query, match found):
(reverse-i-search)'play': play "path/to/file.wav"_

Search mode (no match):
(reverse-i-search)'xyz': _
```

## Step-by-Step Implementation

### Step 1: Add State Variables

Add new state to `BounceApp` class:

```typescript
export class BounceApp {
  private terminal: Terminal;
  private commandBuffer: string = '';
  private commandHistory: string[] = [];
  private historyIndex: number = -1;
  
  // Add these for reverse search
  private isReverseSearchMode: boolean = false;
  private searchQuery: string = '';
  private searchResultIndex: number = -1;
  private matchedCommands: string[] = [];
```

### Step 2: Detect Ctrl+R Keyboard Shortcut

Update `handleInput()` to detect `Ctrl+R`:

```typescript
private handleInput(data: string): void {
  const code = data.charCodeAt(0);

  // Check for Ctrl+R (ASCII 18)
  if (code === 18) {
    this.handleReverseSearch();
    return;
  }

  // If in search mode, handle search input differently
  if (this.isReverseSearchMode) {
    this.handleSearchInput(data);
    return;
  }

  // ... existing input handling for normal mode
}
```

### Step 3: Implement Search Entry

```typescript
private handleReverseSearch(): void {
  if (!this.isReverseSearchMode) {
    // Enter search mode
    this.isReverseSearchMode = true;
    this.searchQuery = '';
    this.searchResultIndex = -1;
    this.matchedCommands = [];
    this.updateSearchPrompt();
  } else {
    // Cycle to next match
    this.findNextMatch();
  }
}

private updateSearchPrompt(): void {
  // Clear current line
  this.clearCurrentLine();
  
  // Show search prompt
  const matchedCommand = this.matchedCommands[this.searchResultIndex] || '';
  this.terminal.write(`(reverse-i-search)\x1b[33m'${this.searchQuery}'\x1b[0m: ${matchedCommand}`);
}
```

### Step 4: Implement Search Input Handling

```typescript
private handleSearchInput(data: string): void {
  const code = data.charCodeAt(0);

  if (code === 27) {
    // Esc - exit search mode
    this.exitSearchMode(false);
  } else if (code === 3) {
    // Ctrl+C - cancel search
    this.exitSearchMode(false);
  } else if (code === 7) {
    // Ctrl+G - cancel search (bash-style)
    this.exitSearchMode(false);
  } else if (code === 13) {
    // Enter - execute matched command
    this.exitSearchMode(true);
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
```

### Step 5: Implement Search Algorithm

```typescript
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
```

### Step 6: Implement Search Exit

```typescript
private exitSearchMode(executeCommand: boolean): void {
  this.isReverseSearchMode = false;
  
  this.clearCurrentLine();
  
  if (executeCommand && this.searchResultIndex >= 0) {
    const command = this.matchedCommands[this.searchResultIndex];
    this.commandBuffer = command;
    this.terminal.write(`> ${command}`);
    this.terminal.write('\r\n');
    this.executeCommand(command);
    this.commandBuffer = '';
  }
  
  this.searchQuery = '';
  this.searchResultIndex = -1;
  this.matchedCommands = [];
  this.printPrompt();
}
```

### Step 7: Update Line Clearing

Ensure `clearCurrentLine()` works for both normal and search prompts:

```typescript
private clearCurrentLine(): void {
  this.terminal.write('\r\x1b[K');
}
```

## Enhanced Features (Optional)

### Highlight Matched Text

Show which part of the command matched:

```typescript
private highlightMatch(command: string, query: string): string {
  const index = command.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return command;
  
  const before = command.substring(0, index);
  const match = command.substring(index, index + query.length);
  const after = command.substring(index + query.length);
  
  return `${before}\x1b[1;32m${match}\x1b[0m${after}`;
}
```

Use in `updateSearchPrompt()`:

```typescript
const matchedCommand = this.matchedCommands[this.searchResultIndex] || '';
const highlighted = matchedCommand ? this.highlightMatch(matchedCommand, this.searchQuery) : '';
this.terminal.write(`(reverse-i-search)\x1b[33m'${this.searchQuery}'\x1b[0m: ${highlighted}`);
```

### Show Match Count

```typescript
const matchInfo = this.matchedCommands.length > 0 
  ? `[${this.searchResultIndex + 1}/${this.matchedCommands.length}]` 
  : '';
this.terminal.write(`${matchInfo}(reverse-i-search)'${this.searchQuery}': ${matchedCommand}`);
```

### Fuzzy Matching

Instead of simple substring matching, implement fuzzy search:

```typescript
private fuzzyMatch(command: string, query: string): boolean {
  const cmdLower = command.toLowerCase();
  const queryLower = query.toLowerCase();
  
  let queryIndex = 0;
  for (let i = 0; i < cmdLower.length && queryIndex < queryLower.length; i++) {
    if (cmdLower[i] === queryLower[queryIndex]) {
      queryIndex++;
    }
  }
  
  return queryIndex === queryLower.length;
}
```

## Critical Patterns

### Always Clear Line Before Updating Prompt

```typescript
this.clearCurrentLine();
// Then write new prompt
```

### Handle Mode Switching Carefully

```typescript
// Always check mode before handling input
if (this.isReverseSearchMode) {
  this.handleSearchInput(data);
  return;
}
// Normal input handling
```

### Preserve Command Buffer

When entering search mode, preserve the current command buffer in case user cancels:

```typescript
private savedCommandBuffer: string = '';

private handleReverseSearch(): void {
  if (!this.isReverseSearchMode) {
    this.savedCommandBuffer = this.commandBuffer;
    // ... enter search mode
  }
}

private exitSearchMode(executeCommand: boolean): void {
  if (!executeCommand) {
    this.commandBuffer = this.savedCommandBuffer;
  }
  // ... rest of exit logic
}
```

### Case-Insensitive Search

```typescript
command.toLowerCase().includes(this.searchQuery.toLowerCase())
```

## Common Issues

**Ctrl+R not detected**
- Check that code === 18 (Ctrl+R sends ASCII 18)
- Ensure browser isn't intercepting the shortcut
- Test in different browsers/terminals

**Prompt not updating**
- Always call `clearCurrentLine()` before writing new prompt
- Ensure `updateSearchPrompt()` is called after every search state change

**Search doesn't find commands**
- Verify `commandHistory` is being populated on command execution
- Check case sensitivity in search
- Ensure search is happening in reverse order (newest first)

**Can't exit search mode**
- Make sure Esc (code 27) and Ctrl+C (code 3) are handled
- Verify `isReverseSearchMode` is set to false on exit

**History navigation breaks after search**
- Reset `historyIndex` to -1 when exiting search mode
- Don't mix history navigation with search mode

## Testing

### Manual Testing

1. Execute several commands
2. Press `Ctrl+R`
3. Type search query
4. Verify matches appear
5. Press `Ctrl+R` again to cycle
6. Press `Enter` to execute
7. Press `Esc` to cancel

### Unit Tests

Create `src/terminal-search.test.ts`:

```typescript
// Test search matching
const history = ['play "a.wav"', 'display "b.wav"', 'play "c.wav"'];
const matches = searchHistory(history, 'play');
assert.strictEqual(matches.length, 2);
assert.strictEqual(matches[0], 'play "c.wav"'); // Most recent first

// Test fuzzy matching
assert.strictEqual(fuzzyMatch('display file.wav', 'dspl'), true);
assert.strictEqual(fuzzyMatch('play audio', 'plau'), true);
```

### E2E Tests

```typescript
test('reverse search finds and executes command', async () => {
  await sendCommand(window, 'help');
  await sendCommand(window, 'clear');
  
  // Simulate Ctrl+R
  await window.evaluate(() => {
    (window as any).__bounceTerminal.write('\x12'); // Ctrl+R
  });
  
  await window.waitForTimeout(200);
  
  // Type search query
  await window.evaluate(() => {
    (window as any).__bounceTerminal.write('hel');
  });
  
  // Verify search prompt visible
  const content = await window.locator('.xterm-rows').textContent();
  if (!content?.includes('reverse-i-search')) {
    throw new Error('Search mode not activated');
  }
});
```

## Reference Examples

- Current history navigation: `src/renderer/app.ts` - `navigateHistory()`
- Keyboard input handling: `src/renderer/app.ts` - `handleInput()`
- Prompt rendering: `src/renderer/app.ts` - `printPrompt()`

## History Persistence

Command history is automatically saved to SQLite database and restored on app restart.

### Database Schema

```sql
CREATE TABLE command_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_command_history_timestamp 
ON command_history(timestamp DESC);
```

### Implementation

**Database Manager** (`src/electron/database.ts`):

```typescript
import Database from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';

export class DatabaseManager {
  private db: Database.Database;

  constructor() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'bounce.db');
    
    this.db = new Database(dbPath);
    this.initializeTables();
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS command_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        command TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_command_history_timestamp 
      ON command_history(timestamp DESC);
    `);
  }

  addCommand(command: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO command_history (command, timestamp) 
      VALUES (?, ?)
    `);
    stmt.run(command, Date.now());
  }

  getCommandHistory(limit: number = 1000): string[] {
    const stmt = this.db.prepare(`
      SELECT command 
      FROM command_history 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    
    const rows = stmt.all(limit) as { command: string }[];
    return rows.map(row => row.command).reverse();
  }

  clearCommandHistory(): void {
    this.db.prepare('DELETE FROM command_history').run();
  }

  close(): void {
    this.db.close();
  }
}
```

**IPC Handlers** (`src/electron/main.ts`):

```typescript
ipcMain.handle('save-command', async (_event, command: string) => {
  try {
    if (dbManager) {
      dbManager.addCommand(command);
    }
  } catch (error) {
    console.error('Failed to save command to database:', error);
  }
});

ipcMain.handle('get-command-history', async () => {
  try {
    return dbManager ? dbManager.getCommandHistory(1000) : [];
  } catch (error) {
    console.error('Failed to load command history:', error);
    return [];
  }
});
```

**Renderer** (`src/renderer/app.ts`):

```typescript
// Load on startup
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

// Save after each command
private async executeCommand(command: string): Promise<void> {
  const trimmed = command.trim();
  if (!trimmed) return;

  this.commandHistory.push(trimmed);
  await window.electron.saveCommand(trimmed);
  // ... rest of execution
}
```

### Database Location

SQLite database is stored at:
- **macOS**: `~/Library/Application Support/Electron/bounce.db`
- **Linux**: `~/.config/Electron/bounce.db`
- **Windows**: `%APPDATA%\Electron\bounce.db`

### History Size Limit

Query is limited to most recent 1000 commands via SQL `LIMIT` clause. Older commands remain in database but aren't loaded into memory.

### Clear History

Add a command to clear history:

```typescript
case 'clear-history':
  await window.electron.clearCommandHistory();
  this.commandHistory = [];
  this.terminal.writeln('Command history cleared');
  return true;
```

### Benefits of SQLite vs localStorage

1. **Structured queries** - Can filter by date, search, etc.
2. **No size limits** - Unlike localStorage's 10MB limit
3. **Concurrent access** - Better handling of multiple processes
4. **Indexing** - Fast lookups with database indexes
5. **Future extensibility** - Easy to add more tables (projects, slices, etc.)

## Next Steps

After implementing reverse search:
1. Add to help command output
2. Update welcome message with `Ctrl+R` tip
3. Consider adding `Ctrl+S` for forward search
4. Add history persistence (save to localStorage)
5. Consider adding history size limits
