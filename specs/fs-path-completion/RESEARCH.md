# Research: FS Path Completion in Strings

**Spec:** `specs/fs-path-completion`  
**Created:** 2026-03-15  
**Status:** Complete

## Problem Statement

Users want tab completion while typing quoted path arguments for filesystem utilities such as `fs.ls("Insyn`. Today the REPL only completes top-level globals and dot-method names, so quoted path fragments receive no assistance.

## Background

Bounce exposes filesystem helpers through the renderer-side `fs` object. These methods resolve paths relative to a persisted cwd stored in `SettingsStore`. Completion currently lives entirely in `src/renderer/tab-completion.ts` and is synchronous.

## Related Work / Prior Art

- Shells complete path segments incrementally and usually append `/` for directories.
- Editor REPLs commonly scope string completion to known path-taking APIs rather than attempting filename completion in arbitrary strings.

## FluCoMa Algorithm Details

None.

## Technical Constraints

- Existing completion logic is synchronous, but filesystem inspection happens through async Electron IPC.
- The feature should stay narrowly scoped to avoid surprising completions in ordinary JavaScript strings.
- Path resolution must respect Bounce's stored cwd and `~` expansion behavior.

## Audio Processing Considerations

None.

## Terminal UI Considerations

- Ghost text and cycling behavior should match existing tab completion UX.
- Completion should not block or corrupt prompt redraws while async filesystem lookups are in flight.

## Cross-Platform Considerations

- Path resolution must work on macOS, Linux, and Windows.
- Inserted path text should be safe inside JavaScript strings; forward slashes are preferable to backslashes for inserted completions.

## Open Questions

- Should completion include hidden entries?
- Should path-taking methods complete only directories or any filesystem entry?

## Research Findings

- `TabCompletion.update()` is currently synchronous and only supports identifier and dot-method completion.
- `BounceApp.redrawCommandLine()` recomputes completion state on every edit; async completion therefore needs stale-request protection.
- `fs.ls`, `fs.la`, `fs.cd`, and `fs.walk` all take a directory path as their first argument, making them a good first scope for quoted-string completion.
- Existing main-process helpers already centralize cwd-relative path resolution via `resolvePath()`.
- `fs.ls` and `fs.la` already distinguish hidden-entry behavior, which can be mirrored in completion.

## Next Steps

- Add a main-process IPC endpoint dedicated to path completion.
- Make renderer completion refresh async-safe.
- Parse only the first quoted argument of `fs.ls`, `fs.la`, `fs.cd`, and `fs.walk`.
- Return directory-only candidates, appending `/` to accepted completions.
