#include <napi.h>
#include "../include/additive-synth/additive-synth.hpp"
#include <cstring>
#include <stdexcept>

namespace flucoma_native {

Napi::Value RenderAdditive(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Expect exactly 1 argument: an options object
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Expected an options object").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::Object opts = info[0].As<Napi::Object>();

    // --- Parse required fields ---

    // fundamentalHz (required, number)
    if (!opts.Has("fundamentalHz") || !opts.Get("fundamentalHz").IsNumber()) {
        Napi::TypeError::New(env, "fundamentalHz is required and must be a number").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    float fundamentalHz = opts.Get("fundamentalHz").As<Napi::Number>().FloatValue();

    // numPartials (required, number)
    if (!opts.Has("numPartials") || !opts.Get("numPartials").IsNumber()) {
        Napi::TypeError::New(env, "numPartials is required and must be a number").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    int numPartials = opts.Get("numPartials").As<Napi::Number>().Int32Value();

    // spectralTilt (required, number)
    if (!opts.Has("spectralTilt") || !opts.Get("spectralTilt").IsNumber()) {
        Napi::TypeError::New(env, "spectralTilt is required and must be a number").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    float spectralTilt = opts.Get("spectralTilt").As<Napi::Number>().FloatValue();

    // durationSec (required, number)
    if (!opts.Has("durationSec") || !opts.Get("durationSec").IsNumber()) {
        Napi::TypeError::New(env, "durationSec is required and must be a number").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    float durationSec = opts.Get("durationSec").As<Napi::Number>().FloatValue();

    // --- Parse optional fields ---

    // sampleRate (optional, default 44100)
    float sampleRate = 44100.0f;
    if (opts.Has("sampleRate") && opts.Get("sampleRate").IsNumber()) {
        sampleRate = opts.Get("sampleRate").As<Napi::Number>().FloatValue();
    }

    // fftSize (optional, default 2048)
    int fftSize = 2048;
    if (opts.Has("fftSize") && opts.Get("fftSize").IsNumber()) {
        fftSize = opts.Get("fftSize").As<Napi::Number>().Int32Value();
    }

    // Build RenderOptions and call the algorithm
    bounce::RenderOptions renderOpts;
    renderOpts.fundamentalHz = fundamentalHz;
    renderOpts.numPartials   = numPartials;
    renderOpts.spectralTilt  = spectralTilt;
    renderOpts.durationSec   = durationSec;
    renderOpts.sampleRate    = sampleRate;
    renderOpts.fftSize       = fftSize;

    std::vector<float> result;
    try {
        result = bounce::AdditiveSynth::render(renderOpts);
    } catch (const std::invalid_argument& e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Undefined();
    } catch (const std::exception& e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // Convert std::vector<float> result to Float32Array
    Napi::ArrayBuffer buf = Napi::ArrayBuffer::New(env, result.size() * sizeof(float));
    std::memcpy(buf.Data(), result.data(), result.size() * sizeof(float));
    return Napi::Float32Array::New(env, result.size(), buf, 0);
}

Napi::Object InitAdditiveSynth(Napi::Env env, Napi::Object exports) {
    exports.Set("renderAdditive", Napi::Function::New(env, RenderAdditive));
    return exports;
}

} // namespace flucoma_native
