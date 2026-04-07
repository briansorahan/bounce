# ProcessManagerService — Lead Developer Agent

## Purpose
ProcessManagerService owns the service dependency graph. It knows the declared dependencies between services, computes the correct startup and teardown ordering via topological sort, and orchestrates `start()` / `stop()` calls in the right sequence.

## Current State: Static Dependency List
Services register themselves by calling `processManager.register(descriptor)` with a `ServiceDescriptor` that declares:
- `name` — unique identifier
- `dependencies` — names of services that must be started first
- `start() / stop() / isReady()` callbacks

The current registration is hand-maintained in `src/electron/main.ts`.

## Future: Compile-Time Dependency Injection Graph
The roadmap calls for a `scripts/generate-service-graph.ts` tool that:
1. Uses the TypeScript compiler API (`ts.createSourceFile`, `ts.createProgram`) to parse each service's constructor.
2. Finds parameters typed as `ServiceClient<SomeRpc>` or concrete service types.
3. Resolves which service implements that RPC contract.
4. Emits a generated `src/electron/services/process-manager/service-graph.generated.ts` containing all `register()` calls.

This makes the dependency graph a compile-time artifact rather than runtime configuration — the same TS AST approach used by the language service for tab completion.

## Files
```
src/electron/services/process-manager/
  index.ts        ProcessManagerService implementation
  AGENT.md        This file
```

## Startup Ordering Example
Given services: `State` → `AudioFile` → `Corpus` (each depends on the previous):

```
computeStartOrder() → ["State", "AudioFile", "Corpus"]
startAll()  → State.start(), AudioFile.start(), Corpus.start()
stopAll()   → Corpus.stop(), AudioFile.stop(), State.stop()
```

## Key Invariants
- **Topological sort is deterministic**: Kahn's algorithm is used. If the dependency graph has a cycle, `computeStartOrder()` throws immediately with a clear error message.
- **Stop is reverse of start**: `stopAll()` reverses the start order, ensuring dependents are always stopped before their dependencies.
- **Unknown dependency = hard error**: A service declaring a dependency on an unregistered name throws at `computeStartOrder()` time, not silently at runtime.

## Testing
ProcessManagerService has no Electron or native addon dependencies and can be tested with plain `tsx`:

```ts
const pm = new ProcessManagerService();
pm.register({ name: "state", dependencies: [], start: async () => {}, stop: async () => {}, isReady: () => true });
pm.register({ name: "audio-file", dependencies: ["state"], start: async () => {}, stop: async () => {}, isReady: () => true });
const order = pm.computeStartOrder();
assert.deepEqual(order, ["state", "audio-file"]);
```

Add tests to `src/test.ts` or a dedicated `src/process-manager.test.ts`.

## Common Failure Modes
- **"Cycle detected"**: two services declare each other as dependencies. Restructure so one depends on the other via an abstraction (e.g. a shared event bus or a third service).
- **"Unknown service"**: a `dependencies` array references a name not yet registered. Ensure all `register()` calls happen before `startAll()`.
