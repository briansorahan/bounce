#include <napi.h>
#include "audio-engine.h"
#include <memory>

// ---------------------------------------------------------------------------
// AudioEngineWrapper — wraps AudioEngine as a Napi::ObjectWrap
// ---------------------------------------------------------------------------
class AudioEngineWrapper : public Napi::ObjectWrap<AudioEngineWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    explicit AudioEngineWrapper(const Napi::CallbackInfo& info);
    ~AudioEngineWrapper();

private:
    Napi::Value Play(const Napi::CallbackInfo& info);
    Napi::Value Stop(const Napi::CallbackInfo& info);
    Napi::Value StopAll(const Napi::CallbackInfo& info);
    Napi::Value OnPosition(const Napi::CallbackInfo& info);
    Napi::Value OnEnded(const Napi::CallbackInfo& info);

    std::unique_ptr<AudioEngine> engine_;

    // Threadsafe functions for telemetry callbacks
    Napi::ThreadSafeFunction positionTsfn_;
    Napi::ThreadSafeFunction endedTsfn_;
};

// ---------------------------------------------------------------------------
Napi::Object AudioEngineWrapper::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "AudioEngine", {
        InstanceMethod("play",       &AudioEngineWrapper::Play),
        InstanceMethod("stop",       &AudioEngineWrapper::Stop),
        InstanceMethod("stopAll",    &AudioEngineWrapper::StopAll),
        InstanceMethod("onPosition", &AudioEngineWrapper::OnPosition),
        InstanceMethod("onEnded",    &AudioEngineWrapper::OnEnded),
    });

    Napi::FunctionReference* ctor = new Napi::FunctionReference();
    *ctor = Napi::Persistent(func);
    env.SetInstanceData(ctor);

    exports.Set("AudioEngine", func);
    return exports;
}

AudioEngineWrapper::AudioEngineWrapper(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<AudioEngineWrapper>(info) {
    engine_ = std::make_unique<AudioEngine>();
    if (!engine_->start()) {
        Napi::Error::New(info.Env(), "AudioEngine: failed to start miniaudio device")
            .ThrowAsJavaScriptException();
    }
}

AudioEngineWrapper::~AudioEngineWrapper() {
    if (positionTsfn_) positionTsfn_.Release();
    if (endedTsfn_)    endedTsfn_.Release();
}

// ---------------------------------------------------------------------------
// play(hash: string, pcm: Float32Array, sampleRate: number, loop: boolean)
// ---------------------------------------------------------------------------
Napi::Value AudioEngineWrapper::Play(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 4) {
        Napi::TypeError::New(env, "play(hash, pcm, sampleRate, loop) requires 4 arguments")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string hash      = info[0].As<Napi::String>();
    auto        typedArr  = info[1].As<Napi::Float32Array>();
    double      sr        = info[2].As<Napi::Number>().DoubleValue();
    bool        loop      = info[3].As<Napi::Boolean>().Value();

    const float* pcm     = typedArr.Data();
    int          nSamples = static_cast<int>(typedArr.ElementLength());

    engine_->play(hash, pcm, nSamples, sr, loop);
    return env.Undefined();
}

// ---------------------------------------------------------------------------
// stop(hash: string)
// ---------------------------------------------------------------------------
Napi::Value AudioEngineWrapper::Stop(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) {
        Napi::TypeError::New(env, "stop(hash) requires 1 argument")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    std::string hash = info[0].As<Napi::String>();
    engine_->stopSample(hash);
    return env.Undefined();
}

// ---------------------------------------------------------------------------
// stopAll()
// ---------------------------------------------------------------------------
Napi::Value AudioEngineWrapper::StopAll(const Napi::CallbackInfo& info) {
    engine_->stopAll();
    return info.Env().Undefined();
}

// ---------------------------------------------------------------------------
// onPosition(callback: (hash: string, pos: number) => void)
// ---------------------------------------------------------------------------
Napi::Value AudioEngineWrapper::OnPosition(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "onPosition(callback) requires a function argument")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    if (positionTsfn_) positionTsfn_.Release();

    positionTsfn_ = Napi::ThreadSafeFunction::New(
        env, info[0].As<Napi::Function>(),
        "BouncePositionCallback", 0, 1);

    engine_->onPosition([this](const std::string& hash, int pos) {
        struct Data { std::string hash; int pos; };
        auto* d = new Data{hash, pos};
        positionTsfn_.NonBlockingCall(d, [](Napi::Env env, Napi::Function cb, Data* data) {
            cb.Call({ Napi::String::New(env, data->hash),
                      Napi::Number::New(env, data->pos) });
            delete data;
        });
    });

    return env.Undefined();
}

// ---------------------------------------------------------------------------
// onEnded(callback: (hash: string) => void)
// ---------------------------------------------------------------------------
Napi::Value AudioEngineWrapper::OnEnded(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "onEnded(callback) requires a function argument")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    if (endedTsfn_) endedTsfn_.Release();

    endedTsfn_ = Napi::ThreadSafeFunction::New(
        env, info[0].As<Napi::Function>(),
        "BounceEndedCallback", 0, 1);

    engine_->onEnded([this](const std::string& hash) {
        auto* h = new std::string(hash);
        endedTsfn_.NonBlockingCall(h, [](Napi::Env env, Napi::Function cb, std::string* data) {
            cb.Call({ Napi::String::New(env, *data) });
            delete data;
        });
    });

    return env.Undefined();
}

// ---------------------------------------------------------------------------
// Module init
// ---------------------------------------------------------------------------
Napi::Object InitAudioEngine(Napi::Env env, Napi::Object exports) {
    return AudioEngineWrapper::Init(env, exports);
}

NODE_API_MODULE(audio_engine_native, InitAudioEngine)
