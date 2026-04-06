# AnalysisService — Lead Developer Agent

## Purpose
AnalysisService runs all FluCoMa DSP algorithms (onset detection, NMF, MFCC, spectral shape) in a dedicated utility process. This keeps the main process and IPC router responsive during CPU-intensive analysis of large audio buffers.

## Position in the Dependency Graph
- **Dependencies**: none (FluCoMa native addon loaded by the utility process)
- **Dependents**: NMF handlers, CorpusService, any service that needs audio descriptors

## Architecture: Utility Process + JSON-RPC over MessagePort

```
Main process (AnalysisService supervisor)
  │  postMessage({ id, method, params })
  ▼
analysis/process.ts (utility process)
  │  calls flucoma_native synchronously
  │  postMessage({ id, result }) or postMessage({ id, error })
  ▼
Main process (resolves/rejects Promise for caller)
```

The supervisor (`index.ts`) maintains a `Map<id, { resolve, reject }>` for in-flight requests. Request IDs are monotonically increasing integers.

## RPC Contract
Defined in `src/shared/rpc/analysis.rpc.ts`.

| Method | Algorithm | Input | Output |
|---|---|---|---|
| `onsetSlice` | FluCoMa OnsetSlice | PCM + options | frame positions |
| `ampSlice` | FluCoMa AmpSlice | PCM + options | frame positions |
| `noveltySlice` | FluCoMa NoveltySlice | PCM + options | frame positions |
| `transientSlice` | FluCoMa TransientSlice | PCM + options | frame positions |
| `bufNMF` | FluCoMa BufNMF | PCM + sampleRate + options | components + activations |
| `mfcc` | FluCoMa MFCCFeature | PCM + options | coefficient matrix |

## Files
```
src/electron/services/analysis/
  index.ts        AnalysisService supervisor (main process)
  process.ts      Utility process entry — FluCoMa calls
  AGENT.md        This file
src/shared/rpc/analysis.rpc.ts
  AnalysisRpc     Contract type + all option/result shapes
```

## Key Invariants
- **No database access**: AnalysisService receives PCM data and returns results. Callers are responsible for fetching PCM from StateService and for persisting features via StateService.
- **Synchronous FluCoMa calls**: FluCoMa's native bindings are synchronous. The utility process handles one request at a time — the Promise-based API in the supervisor serialises requests automatically.
- **PCM serialisation**: `number[]` is used for IPC transport (JSON-serialisable). The process entry converts to `Float32Array` before calling native bindings.

## Testing
Because AnalysisService depends on `flucoma_native` (Electron-ABI native addon), tests must run under Electron. The workflow test for analysis will be `tests/workflows/onset-analysis.workflow.ts`.

For testing the supervisor independently (without the utility process), use a mock `ServiceClient<AnalysisRpc>`:
```ts
const mockAnalysisClient: ServiceClient<AnalysisRpc> = {
  invoke: async (method, params) => {
    if (method === "onsetSlice") return { onsets: [0, 4410, 8820] };
    throw new Error("not implemented");
  },
};
```

## Adding New Algorithms
1. Add the method to `src/shared/rpc/analysis.rpc.ts` (AnalysisRpc interface).
2. Add a `case` in `process.ts` `dispatch()` function.
3. Add the workflow check in `tests/workflows/onset-analysis.workflow.ts` (or a new workflow).
4. Update the IPC bridge handler in `src/electron/ipc/analysis-handlers.ts` to delegate to `analysisService.asClient().invoke(...)`.

## Common Failure Modes
- **Utility process crashes**: FluCoMa is written in C++ — bad input (e.g. empty audio buffer) can cause a native exception. The supervisor detects the crash (`child.on("exit")`) and rejects all in-flight promises. Consider adding a restart policy similar to `LanguageServiceManager`.
- **MessagePort not started**: `port.start()` must be called after attaching the `"message"` listener. If messages arrive before `start()`, they are queued — but start() must come before postMessage() in the same turn of the event loop.
