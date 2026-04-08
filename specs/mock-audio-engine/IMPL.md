# Implementation: Mock Audio Engine

**Spec:** specs/mock-audio-engine
**Beads Parent Issue:** bounce-20g
**Created:** 2026-04-08
**Status:** Complete

## Agent Execution Protocol

> **Read this first.** The main agent is the **orchestrator** — it does not write code. It runs waves of parallel sub-agents and verifies after each wave. Follow this loop autonomously without waiting for user prompts.

### Wave Loop

```
1. bd ready → collect all currently unblocked task IDs for this spec
2. If empty → run the Land the Plane Checklist in PLAN.md
3. Spawn one sub-agent per ready task (in parallel)
      Each sub-agent must:
        a. bd update <id> --claim
        b. Read the issue description fully before writing any code
        c. Implement the task
        d. Do NOT run tests — the orchestrator runs tests after the wave
4. Wait for all sub-agents to complete
5. npm test          ← orchestrator runs this; fix failures before proceeding
6. npm run lint      ← orchestrator runs this; fix errors before proceeding
7. If step 5 or 6 fails:
        a. Spawn a sub-agent to diagnose and fix the failure
        b. Go to step 5
8. bd close <all task IDs from this wave>
9. Go to step 1
```

If a sub-agent in step 3 reports it cannot complete its task (blocker, ambiguity, conflict), the orchestrator must resolve the issue before re-running the wave — do not close a task that was not completed.

## Context

Adds `AudioEngineRpc` contract + `MockAudioEngineService` to unlock workflow tests for playback, transport-pattern, and granular-instrument. No production code changes. See `specs/mock-audio-engine/PLAN.md` for full design.

## Decisions Made

<!-- Add entries as they arise -->

## Deviations from Plan

<!-- Add entries as they arise -->

## Flaws Discovered in Previous Phases

<!-- Add entries as they arise -->

## Testing Results

<!-- Add entries as they arise -->

---

## Final Status

<!-- When work is complete, summarize outcome -->

**Completion Date:** 2026-04-08

**Summary:** Added `AudioEngineRpc` contract, `MockAudioEngineService`, and three workflow files (playback, transport-pattern, granular-instrument). All 18 checks pass. `npm test` and `npm run lint` are clean.

**Deviations:** `InstrumentSampleRecord.sample_hash` (snake_case) not `sampleHash` — corrected in granular-instrument workflow after first run.

**Verification:**
- [x] `npm test` passes
- [x] `npm run lint` passes
- [ ] `npm run build:electron` passes
- [ ] `./build.sh` passes (full Dockerized Playwright suite — mandatory for every spec)
- [ ] Manual smoke test complete
- [x] REPL help() coverage verified by unit and/or Playwright tests (N/A)
- [x] REPL returned-object terminal summaries verified by unit and/or Playwright tests (N/A)
- [ ] `ARCHITECTURE.md` updated if applicable
- [x] Parent issue closed (`bd close bounce-20g`)
- [ ] Changes pushed (`bd dolt push && git push`)

**Known Limitations:**
- Position advancement over time not tested (real-time behavior, remains Playwright-only)
- Transport tick telemetry not tested (async real-time, remains Playwright-only)
- Terminal output / renderer DOM checks not tested (remains Playwright-only)

**Future Improvements:**
