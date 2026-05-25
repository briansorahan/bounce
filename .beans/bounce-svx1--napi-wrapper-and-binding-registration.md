---
# bounce-svx1
title: NAPI wrapper and binding registration
status: completed
type: task
priority: normal
created_at: 2026-05-20T19:46:45Z
updated_at: 2026-05-21T20:48:04Z
parent: bounce-obqi
blocked_by:
    - bounce-ow17
---

Create the NAPI wrapper for AdditiveSynth and register it in the flucoma_native addon.

Files to create:
- native/src/additive_synth.cpp — NAPI wrapper

Files to modify:
- native/src/addon.cpp — Add InitAdditiveSynth forward declaration and call
- binding.gyp — Add native/src/additive_synth.cpp to flucoma_native sources list
- src/native.d.ts — Add TypeScript type declarations
- src/index.ts — Re-export renderAdditive (if not already re-exporting all of native)

NAPI wrapper (native/src/additive_synth.cpp):
- namespace flucoma_native
- Function RenderAdditive(const Napi::CallbackInfo& info):
  1. Parse options object: fundamentalHz (required), numPartials (required),
     spectralTilt (required), durationSec (required), sampleRate (optional, default 44100),
     fftSize (optional, default 2048)
  2. Call AdditiveSynth::render(opts)
  3. Create Float32Array from result vector, return it
  4. Catch std::invalid_argument, throw Napi::Error
- Function InitAdditiveSynth(Napi::Env env, Napi::Object exports):
  exports.Set('renderAdditive', Napi::Function::New(env, RenderAdditive))

TypeScript declaration to add to src/native.d.ts:
  interface AdditiveRenderOptions {
    fundamentalHz: number;
    numPartials: number;
    spectralTilt: number;
    durationSec: number;
    sampleRate?: number;
    fftSize?: number;
  }
  function renderAdditive(options: AdditiveRenderOptions): Float32Array;

Include paths: binding.gyp must include third_party/hisstools in the include_dirs
for the flucoma_native target (already present — verify it covers SIMDSupport.hpp).

After implementation, run: npm run rebuild && npm test
