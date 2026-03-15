# Research: Sample Looping

**Spec:** specs/sample-looping  
**Created:** 2026-03-15  
**Status:** Complete

## Problem Statement

Bounce's `Sample` API supports `sample.play()` and `sample.stop()`, but it does not expose a way to continuously loop a sample from the REPL. Users want a `sample.loop()` method that repeats the sample until they explicitly stop playback.

## Background

The current sample API is object-oriented and REPL-first. Playback is routed through a shared `AudioManager` transport owned by the renderer. `sample.play()` loads the sample into the shared current-audio context if needed and then calls `audioManager.playAudio(...)`. `sample.stop()` stops the shared transport.

That makes `sample.loop()` a natural fit as an instance method that uses the same shared transport but enables looping on the current buffer source.

## Related Work / Prior Art

- `sample.play()` already provides the baseline sample-loading and playback flow in `src/renderer/bounce-api.ts`.
- `AudioManager.playAudio()` already creates and starts an `AudioBufferSourceNode`; Web Audio supports looping directly via `sourceNode.loop = true`.
- The sample API already treats playback as shared transport state, so a loop method can follow the same model as `play()` with different transport settings.

## FluCoMa Algorithm Details

None. This is transport/UI behavior only.

## Technical Constraints

- Playback is managed by a singleton-style `AudioManager` in the renderer.
- `AudioBufferSourceNode` is one-shot; looping must be configured before `start()`.
- The playback cursor update logic currently assumes linear playback and will need to wrap around when looping so waveform playback remains meaningful.
- `sample.stop()` should stop both one-shot playback and looping playback.

## Audio Processing Considerations

- Looping should reuse the already-loaded audio buffer and not create duplicate analysis state.
- Playback position reporting should wrap modulo sample length while looping.
- No changes to sample data, decoding, or persistence are required.

## Terminal UI Considerations

This changes the REPL-facing `Sample` surface.

- `Sample.help()` should include `sample.loop()`.
- The returned `Sample` object from `sample.loop()` should print a useful looping summary similar to `sample.play()`.
- Completion for `sample.lo` should work automatically once `loop()` exists on the `Sample` prototype.
- Focused tests should cover help text and returned-object behavior for the new method.

## Cross-Platform Considerations

The implementation uses standard Web Audio looping behavior and should remain cross-platform across Electron-supported platforms.

## Open Questions

1. Should `loop()` accept options like loop start/end points?
   - Recommendation: no for now. Start with full-sample looping only.

2. Should there be a separate `unloop()` method?
   - Recommendation: no. `sample.stop()` should stop looping, consistent with the shared transport model.

## Research Findings

- `AudioManager.playAudio()` is the only shared transport entry point and is the right place to add a loop flag.
- `sample.play()` and derived-sample playback (`playSlice`, `playComponent`, corpus resynthesis) all call `playAudio()`, so adding an optional parameter with a default preserves existing behavior.
- `Sample` method bindings and REPL typings are straightforward to extend with `loop(): Promise<Sample>`.

## Next Steps

- Add a loop-enabled playback path to `AudioManager`.
- Expose `sample.loop()` through `Sample`, `buildBounceApi()`, help text, and typings.
- Add focused tests for help text and loop playback behavior.
