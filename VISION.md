# Bounce Vision

## Why We're Building Bounce

There is no audio tool on the market that is simultaneously:

- **Free and open-source** — no subscriptions, no vendor lock-in, no black boxes
- **Robust** — stable enough to depend on for serious, sustained work
- **Powerful and extensible** — composable primitives, not a fixed workflow
- **Self-documenting and discoverable** — built-in help, tab completion, and tutorials at every layer
- **Innovative** — reflects trends in cutting-edge academic and research tools

Bounce is being built to be all five. The interface is a terminal REPL because the command line is
the most composable, scriptable, and powerful interface we know. The aesthetic is closer to VCV
Rack than to Ableton: modular, hackable, and built for people who want to understand and extend
their tools rather than be handed a fixed workflow.

## What Is Bounce

Bounce is a terminal-based audio tool built on FluCoMa and miniaudio. Its primary interface is a
JavaScript REPL — all operations are expressed as code. It targets expert users: sound designers,
music producers, and audio researchers who prefer a programmable interface. Today its focus is
corpus analysis and synthesis; over time it will grow to cover a broad range of audio capabilities.

## Product Principles

These define whether a proposed feature belongs in Bounce.

1. **REPL-first.** Every feature must be expressible as a REPL command. If it cannot be invoked
   from code, it is not a Bounce feature.

2. **Self-documenting.** Every exposed object provides `help()`. Every returned value prints a
   useful terminal summary. Tab completion covers all commands and parameters. Discovering what
   Bounce can do should never require reading external documentation.

3. **Hackable and extensible.** Features should compose. The system should feel like VCV Rack —
   modular and open-ended — not like a locked-down application. Users who want to extend or
   script Bounce should find clear seams to do so.

4. **Open-source throughout.** Bounce and all its dependencies must be free and open-source. No
   proprietary SDKs, no subscription services, no black-box components.

5. **Reflects cutting-edge research.** New capabilities should draw on academic and research tools
   (FluCoMa, ML methods, corpus techniques). Bounce should feel like the frontier, not the
   mainstream.

6. **Non-destructive by default.** Operations produce new samples or features; they do not mutate
   originals. Lineage is preserved and queryable.

## Technical Principles

These define whether a proposed implementation approach fits the Bounce architecture.

1. **Service-oriented architecture.** Bounce is a graph of services. Each service is an Electron
   utility process — or the main or renderer process — that exposes its functionality as JSON-RPC.
   New capabilities should be structured as services. The main and renderer processes are services
   and should slot into the architecture the same way any other service does.

2. **The audio utility process is the central service.** Its design drives the design of the rest
   of the system. Architectural decisions made in the audio service establish the patterns that
   other services follow.

3. **Streaming is first-class.** Services need to stream data to each other (audio buffers,
   telemetry, analysis results). Streaming must be a native capability of the service architecture,
   not an afterthought bolted on later.

4. **The renderer is a service, and it will be complex.** The renderer process exposes a typed
   interface and receives state from other services. It is expected to grow significantly and must
   be architected for complexity from the start.

5. **IPC contracts are explicit and typed.** All cross-service communication is defined in shared
   contract files. No ad-hoc message passing outside these contracts.

6. **Native addons are thin wrappers.** C++ handles only what TypeScript cannot do at the required
   performance level (audio I/O, DSP algorithms). Business logic, state, and routing live in
   TypeScript.

7. **Database changes require versioned migrations.** Schema changes follow the established
   migration pattern in `src/electron/database.ts`. No schema changes outside the migration
   system.

8. **New REPL surface uses the decorator registration system.** Namespaces and result types use
   `@namespace` / `@replType` decorators from `src/shared/repl-registry.ts`. Nothing is added
   to a manual globals list.
