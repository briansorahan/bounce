# Development Notes

This document covers internals and developer-only tooling that are not part of the user-facing REPL documentation.

## Adding New REPL Commands

When adding a new command to a namespace (or creating a new namespace), the help system is driven by JSDoc annotations. Here's how it works and what you need to do.

### How the help system works

Command help metadata (`CommandHelp`) is **auto-generated** from JSDoc on command functions. The generator (`scripts/generate-help.ts`) runs automatically as part of `npm run build:electron` and produces `*-commands.generated.ts` files in `src/renderer/namespaces/`.

Do **not** hand-edit the `*-commands.generated.ts` files — they will be overwritten on the next build.

### Adding a command to an existing namespace

1. Add your function inside the namespace builder, wrapped with `withHelp()`:

```typescript
newCommand: withHelp(
  /**
   * One-line summary of what this command does.
   *
   * Optional longer description. Can be multi-line.
   * @param argName Description of the argument.
   * @param optionalArg Description of the optional argument.
   * @example ns.newCommand("value")
   * @example ns.newCommand("value", true)
   */
  function newCommand(argName: string, optionalArg?: boolean): BounceResult {
    // implementation
  },
  nsCommands[N], // index into the generated array — add a placeholder entry first
),
```

2. Run the generator to produce the updated `*-commands.generated.ts`:

```bash
npm run generate:help
```

3. The generated array now has an entry for `newCommand`. The `nsCommands[N]` reference in `withHelp()` uses the array index corresponding to the command's position.

### Adding a new namespace

1. Create `src/renderer/namespaces/my-namespace.ts` following the pattern of `fs-namespace.ts`.

2. Tag the builder function with `@namespace`:

```typescript
/** @namespace myns */
export function buildMyNamespace(deps: NamespaceDeps) {
  const myns = {
    toString: () => renderNamespaceHelp("myns", "My namespace description", mynsCommands).toString(),
    help: () => renderNamespaceHelp("myns", "My namespace description", mynsCommands),

    doThing: withHelp(
      /**
       * Does a thing.
       * @param input The input value.
       * @example myns.doThing("hello")
       */
      function doThing(input: string): BounceResult {
        // implementation
      },
      mynsCommands[0],
    ),
  };
  return { myns };
}
```

3. Run `npm run generate:help` — this produces `src/renderer/namespaces/myns-commands.generated.ts`.

4. Import the generated array at the top of your file:

```typescript
import { mynsCommands } from "./myns-commands.generated.js";
```

5. Wire the namespace into `src/renderer/bounce-api.ts` (import + call the builder).

6. Run `npm run build:electron` to verify everything compiles.

### The validator

`src/help-codegen.test.ts` (run via `npm test`) enforces:

- Every namespace file in `src/renderer/namespaces/` has a `@namespace` tag
- Every `@namespace` tag has a corresponding generated file
- Generated `CommandHelp` entries agree with actual function signatures (param names, types, optionality)
- Every namespace wired into `bounce-api.ts` is covered by the generator
- No generated file is stale (JSDoc edited but generator not re-run)

If you edit JSDoc and forget to run `npm run generate:help`, the validator will catch it.



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
