# Plan: Mock Audio Engine

**Spec:** specs/mock-audio-engine
**Beads Parent Issue:** bounce-20g
**Created:** 2026-04-08
**Status:** In Progress

## Context

The audio engine (`audio_engine_native`) is a C++ addon that runs as an Electron utility process. Five workflow test tasks are blocked because no mock exists. This spec adds a pure-TypeScript mock that implements the same JSON-RPC surface, enabling workflow tests for playback, transport-pattern, and granular-instrument without hardware or Electron.

See `specs/mock-audio-engine/RESEARCH.md` for full context.

## Approach Summary

1. Define `AudioEngineRpc` — a JSON-RPC contract covering playback, instrument lifecycle, transport, and mixer commands
2. Implement `MockAudioEngineService` — pure TypeScript, records commands, exposes state for assertions
3. Wire into `bootServices()` in `tests/workflows/helpers.ts`
4. Write three workflow files
5. Register them in `tests/workflows/run.ts`

## Architecture Changes

New files added:
- `src/shared/rpc/audio-engine.rpc.ts` — shared contract (production will eventually use this too)
- `tests/workflows/mock-audio-engine.ts` — mock implementation, test-only

Modified files:
- `tests/workflows/helpers.ts` — add `audioEngineClient` to `WorkflowServices` + `bootServices()`
- `tests/workflows/run.ts` — register three new workflows
- `tests/workflows/playback.workflow.ts` (new)
- `tests/workflows/transport-pattern.workflow.ts` (new)
- `tests/workflows/granular-instrument.workflow.ts` (new)

No production code changes (services, IPC handlers, native addons). The `AudioEngineRpc` contract is placed in `src/shared/rpc/` for future reuse but is only consumed by tests in this spec.

## Changes Required

### Native C++ Changes

None.

### TypeScript Changes

**`src/shared/rpc/audio-engine.rpc.ts`** — new file

RPC contract covering:

```typescript
export interface AudioEngineRpc extends RpcContract {
  // Playback
  play:     { params: { sampleHash: string; pcm: number[]; sampleRate: number; loop: boolean; loopStart?: number; loopEnd?: number }; result: void }
  stop:     { params: { sampleHash: string }; result: void }
  stopAll:  { params: Record<string, never>; result: void }
  // Instrument lifecycle
  defineInstrument:  { params: { instrumentId: string; kind: string; polyphony: number }; result: void }
  freeInstrument:    { params: { instrumentId: string }; result: void }
  loadInstrumentSample: { params: { instrumentId: string; note: number; pcm: number[]; sampleRate: number; sampleHash: string; loop: boolean; loopStart: number; loopEnd: number }; result: void }
  instrumentNoteOn:  { params: { instrumentId: string; note: number; velocity: number }; result: void }
  instrumentNoteOff: { params: { instrumentId: string; note: number }; result: void }
  instrumentStopAll: { params: { instrumentId: string }; result: void }
  setInstrumentParam:{ params: { instrumentId: string; paramId: number; value: number }; result: void }
  // Transport
  transportStart:    { params: Record<string, never>; result: void }
  transportStop:     { params: Record<string, never>; result: void }
  setBpm:            { params: { bpm: number }; result: void }
  getBpm:            { params: Record<string, never>; result: { bpm: number } }
  setPattern:        { params: { channelIndex: number; stepsJson: string }; result: void }
  clearPattern:      { params: { channelIndex: number }; result: void }
  // Mock-only: query current state without side effects
  getPlaybackState:  { params: Record<string, never>; result: { activeSampleHashes: string[] } }
  isTransportRunning:{ params: Record<string, never>; result: { running: boolean } }
  getPattern:        { params: { channelIndex: number }; result: { stepsJson: string | null } }
  getInstruments:    { params: Record<string, never>; result: { instrumentIds: string[] } }
}
```

Follows the same pattern as other RPC contracts: `RequestType` objects, `registerAudioEngineHandlers()`, `createAudioEngineClient()`.

Note: `pcm` is `number[]` not `Float32Array` — JSON-RPC serializes typed arrays poorly. The mock stores them as-is; production use would need to handle conversion.

**`tests/workflows/mock-audio-engine.ts`** — new file

```typescript
export class MockAudioEngineService implements AudioEngineHandlers {
  private activeSampleHashes = new Set<string>();
  private bpm = 120;
  private transportRunning = false;
  private patterns = new Map<number, string>();
  private instruments = new Set<string>();

  async play(params) { this.activeSampleHashes.add(params.sampleHash); }
  async stop(params) { this.activeSampleHashes.delete(params.sampleHash); }
  async stopAll() { this.activeSampleHashes.clear(); }
  async defineInstrument(params) { this.instruments.add(params.instrumentId); }
  async freeInstrument(params) { this.instruments.delete(params.instrumentId); }
  async loadInstrumentSample() {}
  async instrumentNoteOn() {}
  async instrumentNoteOff() {}
  async instrumentStopAll() {}
  async setInstrumentParam() {}
  async transportStart() { this.transportRunning = true; }
  async transportStop() { this.transportRunning = false; }
  async setBpm(params) {
    if (params.bpm <= 0 || params.bpm > 400) throw new ResponseError(-32602, "BPM out of range");
    this.bpm = params.bpm;
  }
  async getBpm() { return { bpm: this.bpm }; }
  async setPattern(params) { this.patterns.set(params.channelIndex, params.stepsJson); }
  async clearPattern(params) { this.patterns.delete(params.channelIndex); }
  async getPlaybackState() { return { activeSampleHashes: Array.from(this.activeSampleHashes) }; }
  async isTransportRunning() { return { running: this.transportRunning }; }
  async getPattern(params) { return { stepsJson: this.patterns.get(params.channelIndex) ?? null }; }
  async getInstruments() { return { instrumentIds: Array.from(this.instruments) }; }

  listen(connection: MessageConnection) { registerAudioEngineHandlers(connection, this); }
}
```

**`tests/workflows/helpers.ts`** — modifications
- Import `MockAudioEngineService`, `createAudioEngineClient`
- Add `audioEngineClient` to `WorkflowServices` interface
- Wire in `bootServices()` using `createInProcessPair()`

**`tests/workflows/playback.workflow.ts`** — new workflow

Checks:
- `play` a sample → `getPlaybackState` returns its hash as active
- `stop` the sample → `getPlaybackState` no longer contains the hash
- `play` two samples → both appear in active set
- `stopAll` → active set is empty

**`tests/workflows/transport-pattern.workflow.ts`** — new workflow

Checks:
- `setBpm(120)` → `getBpm()` returns 120
- `setBpm(240)` → `getBpm()` returns 240
- `setBpm(-1)` → throws (out of range)
- `setBpm(401)` → throws (out of range)
- `transportStart` → `isTransportRunning` returns true
- `transportStop` → `isTransportRunning` returns false
- `setPattern(0, stepsJson)` → `getPattern(0)` returns the json
- `clearPattern(0)` → `getPattern(0)` returns null

**`tests/workflows/granular-instrument.workflow.ts`** — new workflow

Uses `instrumentClient` for state (no audio engine needed for state tests) and `audioEngineClient` for note-on/off routing:

Checks:
- `createInstrument({ name: 'drums', kind: 'sampler', ... })` → `listInstruments` contains it
- `createInstrument({ name: 'bass', kind: 'granular', ... })` → list contains both
- `addInstrumentSample(...)` → `getInstrumentSamples` contains the sample
- `deleteInstrument('drums')` → not in list, `listInstruments` returns only 'bass'
- `instrumentNoteOn({ instrumentId: 'bass', note: 60, velocity: 100 })` (via audioEngineClient) — no error
- `instrumentNoteOff({ instrumentId: 'bass', note: 60 })` (via audioEngineClient) — no error

**`tests/workflows/run.ts`** — add imports and registrations for the three new workflows.

### Terminal UI Changes

None. This spec adds no REPL-facing surface.

### REPL Interface Contract

None. Workflow tests are internal infrastructure, not REPL surface.

#### REPL Contract Checklist

Not applicable — no REPL surface area.

### Configuration/Build Changes

None — `src/shared/rpc/audio-engine.rpc.ts` is picked up automatically by existing tsconfig files.

## Testing Strategy

### Unit Tests

No new unit tests needed. The mock is itself the test double.

### E2E Tests

The three new workflow files provide the coverage. They run via `tsx tests/workflows/run.ts` (included in `npm test`).

The following are permanently deferred to Playwright only (not in scope):
- Position advancement over time (`playback.spec.ts` — real-time)
- Transport tick telemetry firing (`transport-pattern.spec.ts` — real-time async)
- Terminal output checks (`granular-instrument.spec.ts` — renderer DOM)

### Manual Testing

None required beyond `npm test`.

## Success Criteria

- `tsx tests/workflows/run.ts` passes with the three new workflows reporting all checks green
- `npm test` passes
- `npm run lint` passes
- `bounce-wf-playback`, `bounce-wf-transport-pattern`, and `bounce-wf-granular-instrument` can be closed

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| `Float32Array` serialization over JSON-RPC | Use `number[]` in RPC params; mock stores them as arrays |
| BPM validation range mismatch with production | Follow Playwright test: 1–400 is valid, ≤0 or >400 is invalid |

## Task Graph

| Issue | Title | Depends On |
|-------|-------|-----------|
| bounce-cz2 | Define AudioEngineRpc contract | — |
| bounce-h7k | Implement MockAudioEngineService | bounce-cz2 |
| bounce-hpi | Wire mock into bootServices() | bounce-h7k |
| bounce-2hb | playback.workflow.ts | bounce-hpi |
| bounce-n8e | transport-pattern.workflow.ts | bounce-hpi |
| bounce-a1k | granular-instrument.workflow.ts | bounce-hpi |
| bounce-ef8 | Register workflows in run.ts | bounce-2hb, bounce-n8e, bounce-a1k |

```bash
bd create --title="Define AudioEngineRpc contract" ...          # → bounce-cz2
bd create --title="Implement MockAudioEngineService" ...        # → bounce-h7k
bd create --title="Wire MockAudioEngineService into bootServices()" ...  # → bounce-hpi
bd create --title="Create playback.workflow.ts" ...             # → bounce-2hb
bd create --title="Create transport-pattern.workflow.ts" ...    # → bounce-n8e
bd create --title="Create granular-instrument.workflow.ts" ...  # → bounce-a1k
bd create --title="Register new workflows in run.ts" ...        # → bounce-ef8
bd dep add bounce-h7k bounce-cz2
bd dep add bounce-hpi bounce-h7k
bd dep add bounce-2hb bounce-hpi
bd dep add bounce-n8e bounce-hpi
bd dep add bounce-a1k bounce-hpi
bd dep add bounce-ef8 bounce-2hb
bd dep add bounce-ef8 bounce-n8e
bd dep add bounce-ef8 bounce-a1k
bd dep add bounce-20g bounce-ef8
```

## Land the Plane Checklist

```bash
npm test                    # All unit tests must pass — fix failures before proceeding
npm run lint                # No lint errors — fix before proceeding
npm run build:electron      # TypeScript must compile cleanly
./build.sh                  # Full Dockerized Playwright suite — mandatory, no exceptions
npm run dev:electron        # Manual smoke test
```

After all checks pass:
- [ ] Update `ARCHITECTURE.md` if the process model, IPC protocol, data flows, database schema, native addon surface, or renderer architecture changed
- [ ] If REPL surface area changed: verify unit and/or Playwright tests cover `help()` and returned-object display
- [ ] Fill in `## Final Status` in IMPL.md
- [ ] Set `**Status:** Complete` at the top of IMPL.md
- [ ] Commit all spec files and implementation
- [ ] `bd close bounce-20g`
- [ ] `bd dolt push && git push`

## Plan Consistency Checklist

- [x] All sections agree on backwards compatibility requirements (no breaking changes)
- [x] All sections agree on the data model / schema approach (mock state only, no DB)
- [x] REPL-facing changes define help() coverage and returned-object terminal summaries (N/A)
- [x] Testing strategy names unit and/or Playwright coverage for REPL help/display behavior where applicable (N/A)
- [x] No contradictory constraints exist between sections
- [x] Any revised decisions have had stale/opposing content removed
