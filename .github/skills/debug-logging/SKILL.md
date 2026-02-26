# Debug Logging Skill

Always use the SQLite-backed debug logging system instead of `console.log` in the Bounce application.

## Why Use Debug Logging

1. **Persistence** - Logs are stored in SQLite and survive app restarts
2. **Queryable** - Can search, filter, and analyze logs using SQL
3. **Centralized** - All logs in one place, accessible via `debug` command
4. **Timestamped** - Automatic timestamps for debugging timing issues
5. **Structured** - Support for additional data as JSON

## Usage

### In Renderer Process (TypeScript)

```typescript
// Basic log
window.electron.debugLog('info', 'Message here');

// With structured data
window.electron.debugLog('info', 'User action', { 
  action: 'click',
  element: 'button-id' 
});

// Error logging
window.electron.debugLog('error', 'Operation failed', { 
  error: error instanceof Error ? error.message : String(error),
  context: 'additional info'
});

// Warning
window.electron.debugLog('warn', 'Deprecated feature used', { 
  feature: 'oldAPI',
  replacement: 'newAPI' 
});
```

### Log Levels

- `'info'` - General information, tracing execution flow
- `'warn'` - Warnings about potential issues
- `'error'` - Errors that occurred

### Viewing Logs

In the terminal UI:

```bash
# Show last 20 logs (default)
debug

# Show last 50 logs
debug 50

# Clear all debug logs
clear-debug
```

### SQLite Direct Access

From the command line:

```bash
cd ~/Library/Application\ Support/bounce
sqlite3 bounce.db "
  SELECT 
    level,
    message,
    data,
    datetime(timestamp/1000, 'unixepoch', 'localtime') as time
  FROM debug_logs 
  ORDER BY timestamp DESC 
  LIMIT 20;
"
```

## Best Practices

### DO Use Debug Logging For

✅ Function entry/exit in complex workflows
```typescript
window.electron.debugLog('info', '[ModuleName] Function started', { params });
// ... work ...
window.electron.debugLog('info', '[ModuleName] Function completed', { result });
```

✅ Important state changes
```typescript
window.electron.debugLog('info', '[AudioContext] Audio loaded', {
  duration: audio.duration,
  sampleRate: audio.sampleRate
});
```

✅ Error conditions with context
```typescript
catch (error) {
  window.electron.debugLog('error', '[AnalysisEngine] Failed to process', {
    error: error.message,
    filePath,
    options
  });
}
```

✅ Performance-critical operations
```typescript
const startTime = Date.now();
// ... operation ...
window.electron.debugLog('info', '[Renderer] Operation timing', {
  operation: 'waveformDraw',
  durationMs: Date.now() - startTime
});
```

### DO NOT Use Debug Logging For

❌ High-frequency events (resize, mouse move, audio processing loop)
- These will fill up the database quickly
- Use console.log for these if needed temporarily

❌ Sensitive user data
- File paths are OK
- Don't log file contents, passwords, tokens, etc.

❌ Development-only debugging
- Use `console.log` for temporary debugging during development
- Convert to debug logs if the information is valuable long-term

## Naming Convention

Use a consistent prefix pattern to make logs searchable:

```typescript
// Module-based prefixes
window.electron.debugLog('info', '[VizManager] Creating panel', data);
window.electron.debugLog('info', '[OnsetSlice] Analysis complete', data);
window.electron.debugLog('info', '[AudioContext] Playback started', data);
window.electron.debugLog('info', '[Terminal] Command executed', data);
```

This makes it easy to filter logs:

```sql
SELECT * FROM debug_logs 
WHERE message LIKE '[VizManager]%' 
ORDER BY timestamp DESC;
```

## Example: Comprehensive Function Logging

```typescript
private async handleAnalysis(filePath: string): Promise<void> {
  try {
    window.electron.debugLog('info', '[Analysis] Starting', { filePath });
    
    const audio = await this.loadAudio(filePath);
    window.electron.debugLog('info', '[Analysis] Audio loaded', {
      samples: audio.length,
      duration: audio.duration
    });
    
    const results = await this.analyze(audio);
    window.electron.debugLog('info', '[Analysis] Complete', {
      resultCount: results.length
    });
    
    return results;
    
  } catch (error) {
    window.electron.debugLog('error', '[Analysis] Failed', {
      filePath,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
```

## Structured Data Tips

The `data` parameter is stored as JSON. Keep it:

**Simple and flat when possible:**
```typescript
✅ { width: 800, height: 600, canvasId: 'viz-0' }
❌ { config: { display: { canvas: { dimensions: { w: 800, h: 600 } } } } }
```

**Include relevant context:**
```typescript
✅ { operation: 'resize', canvasId: 'viz-0', oldSize: '800x600', newSize: '1024x768' }
❌ { size: '1024x768' }  // What canvas? What operation?
```

## Integration with Existing Code

When you find `console.log` statements:

**Before:**
```typescript
console.log('Starting analysis for', filePath);
console.log('Found', results.length, 'results');
```

**After:**
```typescript
window.electron.debugLog('info', '[Analysis] Starting', { filePath });
window.electron.debugLog('info', '[Analysis] Results found', { 
  count: results.length 
});
```

## Database Schema

The debug logs are stored in the `debug_logs` table:

```sql
CREATE TABLE debug_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,           -- 'info', 'warn', 'error'
  message TEXT NOT NULL,         -- Human-readable message
  data TEXT,                     -- JSON string of additional data
  timestamp INTEGER NOT NULL,    -- Unix timestamp in milliseconds
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_debug_logs_timestamp ON debug_logs(timestamp DESC);
```

## Performance Considerations

- Debug logging is asynchronous (IPC to main process)
- Does not block the renderer
- Minimal performance impact for reasonable logging volumes
- Database is indexed for fast queries
- Logs auto-rotate/expire (not implemented yet, but planned)

## See Also

- `.github/skills/database-management.md` - SQLite operations for the bounce database
- `src/electron/database.ts` - Database implementation
- `src/electron/preload.ts` - IPC bridge for debug logging
