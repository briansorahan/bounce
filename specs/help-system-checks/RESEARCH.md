# Research: Help System Checks

**Spec:** specs/help-system-checks  
**Created:** 2026-03-28  
**Status:** Complete

## Problem Statement

The help system in Bounce has grown organically. Each namespace and command defines its own help text inline, using ad-hoc patterns. There is no single source of truth for command metadata, no guarantee that every command has a `.help()` method, and no automated verification that namespace-level `help()` output actually lists every command exposed in that namespace.

We need:
1. A data structure that serves as the single source of truth for help metadata per command.
2. Namespace `help()` methods that automatically derive one-line summaries from that data structure.
3. Every command to always expose a `.help()` method, powered by the same data structure.
4. Unit tests verifying complete help coverage and namespace summary correctness.

## Background

Bounce provides a terminal REPL with ~11 namespace objects (`sn`, `vis`, `fs`, `proj`, `env`, `corpus`, `midi`, `transport`, `pat`, `mx`, `inst`) plus global functions (`help`, `clear`, `debug`, `clearDebug`, `errors`). Users discover functionality by calling `help()` (global overview) or `namespace.help()` (namespace reference) or `namespace.command.help()` (detailed command usage).

The current implementation is functional but fragile — help text is embedded as string literals scattered across namespace builder files, and there's no compile-time or test-time guarantee of completeness.

## Related Work / Prior Art

- **Python `argparse`/`click`**: Declarative command metadata generates both CLI help and docs.
- **Ruby `ri`/`rdoc`**: Structured docstrings become browsable help.
- **SuperCollider**: Class-level help files with structured metadata (description, arguments, examples).
- **Node.js `commander`**: Command objects carry description, options, and examples as data.

The common pattern: **command metadata is data, not ad-hoc strings**. Help output is rendered from that data, not hand-maintained.

## FluCoMa Algorithm Details

N/A — this spec is about the help system infrastructure, not FluCoMa algorithms.

## Technical Constraints

- Help metadata must be available at runtime in the renderer process (no IPC for help rendering).
- The data structure must be importable by both namespace builders and unit tests.
- Must not break existing REPL evaluation, tab completion, or promise-chaining patterns.
- `command.help()` must continue to return `BounceResult` (ANSI-formatted text) for terminal display.
- The `Object.assign(fn, { help })` pattern and the post-construction type-cast assignment pattern must both remain viable — or be unified.

## Audio Processing Considerations

N/A — help system is purely UI/metadata.

## Terminal UI Considerations

### Namespace help() output format
Currently, each namespace `help()` returns a hand-crafted block like:
```
sn — Sample namespace
  sn.read(path)       Load an audio file from disk
  sn.load(hash)       Load a stored sample by hash
  sn.list()           List all samples in the current project
  ...
```

The new system should generate this automatically from command metadata, ensuring every command is listed and summaries stay in sync.

### Command help() output format
Currently, each command `help()` returns detailed usage:
```
sn.read(path)

  Load an audio file from disk and return a Sample object.

  path  File path (absolute, relative, or ~)

  Examples:  sn.read("kick.wav")
             sn.read("~/samples/loop.flac")
```

This detailed format should also be derivable from the metadata, but with freedom for custom rendering.

### REPL interface impact
- `sn.read.help()` must keep working — the function object must have a `.help` property.
- `SamplePromise.help()` already works via the thenable wrapper — no change needed there.
- Tab completion already discovers `.help` via `getCallablePropertyNames()` prototype walk — no change needed.

## Cross-Platform Considerations

N/A — purely TypeScript/renderer-side. ANSI codes work identically on all platforms via xterm.js.

## Current State Audit

### Construction Patterns (3 in use today)

**Pattern A: Object.assign()** — used by `vis`, `fs`, `env`, `inst`, `globals`
```typescript
const cmd = Object.assign(
  function cmd(...) { ... },
  { help: () => new BounceResult(...) }
);
```

**Pattern B: Class + post-assignment** — used by `sn`, `proj`
```typescript
(sn.read as typeof sn.read & { help?: () => BounceResult }).help = () =>
  new BounceResult([...].join("\n"));
```

**Pattern C: Direct object literal** — used by `midi`, `transport`, `corpus`, `pat`
```typescript
const ns = { cmd: async () => { ... }, help: () => new BounceResult(...) };
// individual commands have NO .help
```

### Help Coverage Matrix

| Namespace | ID | Ns help() | Commands | With help() | Coverage |
|-----------|----|-----------|----------|-------------|----------|
| Sample | `sn` | ✅ | 7 | 7/7 | 100% |
| Instrument | `inst` | ✅ | 4 | 4/4 | 100% |
| Environment | `env` | ✅ | 4 | 4/4 | 100% |
| Filesystem | `fs` | ✅ | 6 | 6/6 | 100% |
| Visualization | `vis` | ✅ | 5 | 5/5 | 100% |
| Project | `proj` | ✅ | 4 | 4/4 | 100% |
| Corpus | `corpus` | ✅ | 3 | 0/3 | **0%** |
| MIDI | `midi` | ✅ | 6 | 0/6 | **0%** |
| Transport | `transport` | ✅ | 3 | 0/3 | **0%** |
| Pattern | `pat` | ✅ | 1 | 0/1 | **0%** |
| Mixer | `mx` | ✅ | 3 | 0/3 | **0%** |
| Globals | (spread) | ✅ | 5 | 5/5 | 100% |

**Summary:** 6 of 12 namespaces/groups have 100% command-level help. 5 namespaces have 0% command-level help. ~19 commands are missing `.help()`.

### Namespace help() accuracy audit

Namespace `help()` output is hand-maintained strings. There is currently **no mechanism** to ensure that when a new command is added to a namespace, the help text is updated to include it. This is a maintenance risk.

## Open Questions

1. ~~Should the metadata structure live in the namespace files themselves or in a separate registry?~~ **Decision: In the namespace files.** Keeps metadata close to implementation and avoids a global registry that drifts.

2. ~~Should we auto-generate the ANSI formatting or let each command customize?~~ **Decision: Provide a standard renderer with escape hatches.** A `renderHelp(meta)` function generates the standard format; commands can override with a custom `BounceResult` if needed.

3. Should returned result objects (e.g. `Sample`, `ChannelControl`, `Pattern`) also have their methods' help derived from metadata? **Deferred** — this spec focuses on namespace-level commands. Result object methods can follow the same pattern later.

## Research Findings

1. **All 11 namespaces + globals already have namespace-level `help()`** — so the framework is there, it just isn't systematic.

2. **The `Object.assign(fn, { help })` pattern is the cleanest** — it's self-contained and type-safe. The post-assignment type-cast pattern is verbose and error-prone.

3. **A metadata interface is straightforward:**
   ```typescript
   interface CommandHelp {
     signature: string;    // e.g. "sn.read(path)"
     summary: string;      // one-line for namespace help()
     detail?: string;      // longer description for command help()
     params?: Array<{ name: string; type: string; description: string; optional?: boolean }>;
     examples?: string[];
   }
   ```

4. **Two rendering functions cover all needs:**
   - `renderNamespaceHelp(name, description, commands: CommandHelp[])` → generates the one-line summary block
   - `renderCommandHelp(cmd: CommandHelp)` → generates the detailed usage block

5. **Unit testing is feasible without the Electron runtime** — namespace builders return plain objects. We can call `help()` and inspect the returned `BounceResult.toString()` to verify content. We can also enumerate the namespace object's callable properties and verify each has a `.help` function property.

6. **The REPL evaluator injects namespaces as local variables** via `AsyncFunction` constructor (see `repl-evaluator.ts:661-690`). Tab completion discovers methods via `getCallablePropertyNames()` which walks the prototype chain for function-valued properties. The `.help` property on a function is already discoverable by this mechanism.

7. **Promise wrappers** (`SamplePromise`, `OnsetFeaturePromise`, etc.) already delegate `.help()` to the resolved value. No change needed for chaining like `sn.read("x").help()`.

## Next Steps

In the PLAN phase:
1. Define the `CommandHelp` interface and rendering functions (likely in a new `src/renderer/help.ts` or `src/renderer/results/help.ts`).
2. Define how each namespace builder will declare its command metadata array and use it to build both the namespace `help()` and individual command `.help()` methods.
3. Identify the cleanest migration path — convert one namespace (e.g. `fs`, which is already clean) as the reference implementation, then convert the rest.
4. Design the unit test: enumerate namespace properties, assert each has `.help`, assert namespace `help()` output mentions each command.
5. Address the 19 missing command-level `.help()` methods across `corpus`, `midi`, `transport`, `pat`, and `mx`.
