# Development Notes

This document covers internals and developer-only tooling that are not part of the user-facing REPL documentation.

## Debug Logging

Bounce includes a SQLite-backed debug logging system accessible from the REPL. These commands are intentionally omitted from `help()` output as they are only useful when developing or debugging Bounce itself.

### `debug(limit?)`

Shows the most recent entries from the debug log store.

```typescript
await debug()        // show last 20 entries (default)
await debug(50)      // show last 50 entries
```

Log entries include a timestamp, level (`info` / `warn` / `error`), message, and optional JSON data payload.

### `clearDebug()`

Clears all entries from the debug log store.

```typescript
await clearDebug()
```

## Writing Debug Logs

From the main or renderer process, use `window.electron.debugLog(level, message, data?)`:

```typescript
window.electron.debugLog("info", "My message", { someKey: "someValue" });
window.electron.debugLog("warn", "Something looks off");
window.electron.debugLog("error", "Something failed", { error: err.message });
```

Logs are persisted to the SQLite database and survive app restarts.
