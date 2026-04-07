# StateService — Lead Developer Agent

## Purpose
StateService is the single source of truth for all durable application state in Bounce. It owns the SQLite database (via `DatabaseManager`) and the settings JSON file (via `SettingsStore`). No other service reads from or writes to SQLite directly — all persistence is mediated by this service's RPC contract.

## Position in the Dependency Graph
- **Dependencies**: none (leaf node — starts first, stops last)
- **Dependents**: AudioFileService, CorpusService, ReplIntelligenceService, and any future service that needs persistent state

## RPC Contract
Defined in `src/shared/rpc/state.rpc.ts`. Key methods:

| Method | Purpose |
|---|---|
| `storeRawSample` | Persist a file-backed audio sample (idempotent on hash) |
| `getSampleByHash` | Look up a sample by full SHA-256 hex hash |
| `getRawMetadata` | Get filesystem path for a raw sample |
| `listSamples` | List all samples in the current project |
| `getCwd` | Current working directory for path resolution |
| `getCurrentProject` | Active project record |

## Files
```
src/electron/services/state/
  storage.ts           IStateStorage interface (no Electron imports)
  database-storage.ts  DatabaseStateStorage — SQLite + settings file (Electron-only)
  index.ts             StateService — business logic, takes IStateStorage
  AGENT.md             This file
src/shared/rpc/state.rpc.ts
  StateRpc             Contract type + all shared data shapes
tests/workflows/
  in-memory-storage.ts InMemoryStateStorage — Map-backed, no native deps, for tests
```

## Key Invariants
- **No Electron imports in index.ts**: StateService itself has zero Electron dependencies. All Electron-specific code lives in `database-storage.ts`.
- **Constructor takes IStateStorage**: `new StateService(storage)`. In production, pass a `DatabaseStateStorage`. In tests, pass an `InMemoryStateStorage`.
- **Idempotent writes**: `storeRawSample` does nothing if the hash already exists in the current project.
- **Project scoping**: All sample/feature/instrument data is scoped to the current project. `getCurrentProject()` reflects the project set at construction time (or after `load-project` IPC).
- **Close on teardown**: Call `stateService.close()` which delegates to `storage.close()`.

## Testing
StateService tests run under plain Node via `tsx` — no Electron required:

```ts
import { StateService } from "src/electron/services/state";
import { InMemoryStateStorage } from "tests/workflows/in-memory-storage";

const stateService = new StateService(new InMemoryStateStorage());
const client = stateService.asClient();
// ... use client.invoke(...) to test state operations
stateService.close(); // no-op for in-memory storage
```

## Adding New State
1. Add the method signature to `src/shared/rpc/state.rpc.ts` (StateRpc interface).
2. Implement it in `index.ts` (calls through to `DatabaseManager`).
3. If the method requires a new DB column or table, add a migration in `src/electron/database.ts` following the guide in `.github/skills/add-database-migration/SKILL.md`.
4. Update this AGENT.md if the invariants or contract change.

## Common Failure Modes
- **`SQLITE_CANTOPEN`**: `dataDir` does not exist or is not writable. Ensure the directory is created before constructing StateService.
- **Missing project context**: `listSamples`, `storeRawSample` etc. require `currentProjectId` to be set. The constructor calls `ensureDefaultProject()` which guarantees this on first boot, but a corrupted DB may lose the project row.
- **Native addon ABI mismatch**: `better-sqlite3` is built for Electron's Node ABI. Running under system Node (e.g. plain `tsx`) will throw. Always test via `electron --no-sandbox`.
