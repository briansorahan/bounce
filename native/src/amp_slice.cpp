#include <napi.h>
#include "../../third_party/flucoma-core/include/flucoma/algorithms/public/EnvelopeSegmentation.hpp"
#include "../../third_party/flucoma-core/include/flucoma/data/FluidMemory.hpp"
#include "../../third_party/flucoma-core/include/flucoma/data/TensorTypes.hpp"
#include <algorithm>
#include <memory>
#include <vector>

namespace flucoma_native {

class AmpSlice : public Napi::ObjectWrap<AmpSlice> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  AmpSlice(const Napi::CallbackInfo& info);
  ~AmpSlice() = default;

private:
  static Napi::FunctionReference constructor;

  Napi::Value Process(const Napi::CallbackInfo& info);
  Napi::Value Reset(const Napi::CallbackInfo& info);

  std::unique_ptr<fluid::algorithm::EnvelopeSegmentation> mAlgorithm;

  int    mFastRampUp{1};
  int    mFastRampDown{1};
  int    mSlowRampUp{100};
  int    mSlowRampDown{100};
  double mOnThreshold{144.0};
  double mOffThreshold{-144.0};
  double mFloor{-144.0};
  int    mMinSliceLength{2};
  double mHighPassFreq{85.0};
  double mSampleRate{44100.0};
};

Napi::FunctionReference AmpSlice::constructor;

Napi::Object AmpSlice::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "AmpSlice", {
    InstanceMethod("process", &AmpSlice::Process),
    InstanceMethod("reset",   &AmpSlice::Reset)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("AmpSlice", func);
  return exports;
}

AmpSlice::AmpSlice(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<AmpSlice>(info) {

  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object opts = info[0].As<Napi::Object>();

    if (opts.Has("fastRampUp") && opts.Get("fastRampUp").IsNumber())
      mFastRampUp = opts.Get("fastRampUp").As<Napi::Number>().Int32Value();
    if (opts.Has("fastRampDown") && opts.Get("fastRampDown").IsNumber())
      mFastRampDown = opts.Get("fastRampDown").As<Napi::Number>().Int32Value();
    if (opts.Has("slowRampUp") && opts.Get("slowRampUp").IsNumber())
      mSlowRampUp = opts.Get("slowRampUp").As<Napi::Number>().Int32Value();
    if (opts.Has("slowRampDown") && opts.Get("slowRampDown").IsNumber())
      mSlowRampDown = opts.Get("slowRampDown").As<Napi::Number>().Int32Value();
    if (opts.Has("onThreshold") && opts.Get("onThreshold").IsNumber())
      mOnThreshold = opts.Get("onThreshold").As<Napi::Number>().DoubleValue();
    if (opts.Has("offThreshold") && opts.Get("offThreshold").IsNumber())
      mOffThreshold = opts.Get("offThreshold").As<Napi::Number>().DoubleValue();
    if (opts.Has("floor") && opts.Get("floor").IsNumber())
      mFloor = opts.Get("floor").As<Napi::Number>().DoubleValue();
    if (opts.Has("minSliceLength") && opts.Get("minSliceLength").IsNumber())
      mMinSliceLength = opts.Get("minSliceLength").As<Napi::Number>().Int32Value();
    if (opts.Has("highPassFreq") && opts.Get("highPassFreq").IsNumber())
      mHighPassFreq = opts.Get("highPassFreq").As<Napi::Number>().DoubleValue();
    if (opts.Has("sampleRate") && opts.Get("sampleRate").IsNumber())
      mSampleRate = opts.Get("sampleRate").As<Napi::Number>().DoubleValue();
  }

  mAlgorithm = std::make_unique<fluid::algorithm::EnvelopeSegmentation>();

  // hiPassFreq must be normalized to [0, 0.5] (fraction of sample rate)
  double normalizedHPF = std::min(mHighPassFreq / mSampleRate, 0.5);
  mAlgorithm->init(mFloor, normalizedHPF);
}

Napi::Value AmpSlice::Process(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsTypedArray()) {
    Napi::TypeError::New(env, "Expected Float32Array or Float64Array as first argument")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::TypedArray inputArray = info[0].As<Napi::TypedArray>();
  size_t length = inputArray.ElementLength();

  std::vector<double> audio(length);

  if (inputArray.TypedArrayType() == napi_float32_array) {
    auto f32 = inputArray.As<Napi::Float32Array>();
    for (size_t i = 0; i < length; i++)
      audio[i] = static_cast<double>(f32[i]);
  } else if (inputArray.TypedArrayType() == napi_float64_array) {
    auto f64 = inputArray.As<Napi::Float64Array>();
    for (size_t i = 0; i < length; i++)
      audio[i] = f64[i];
  } else {
    Napi::TypeError::New(env, "Expected Float32Array or Float64Array")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  double normalizedHPF = std::min(mHighPassFreq / mSampleRate, 0.5);

  std::vector<int> sliceIndices;

  for (size_t i = 0; i < length; i++) {
    double detected = mAlgorithm->processSample(
        audio[i],
        mOnThreshold,
        mOffThreshold,
        mFloor,
        static_cast<fluid::index>(mFastRampUp),
        static_cast<fluid::index>(mSlowRampUp),
        static_cast<fluid::index>(mFastRampDown),
        static_cast<fluid::index>(mSlowRampDown),
        normalizedHPF,
        static_cast<fluid::index>(mMinSliceLength));

    if (detected > 0.0)
      sliceIndices.push_back(static_cast<int>(i));
  }

  Napi::Array results = Napi::Array::New(env, sliceIndices.size());
  for (size_t i = 0; i < sliceIndices.size(); i++)
    results.Set(i, Napi::Number::New(env, sliceIndices[i]));

  return results;
}

Napi::Value AmpSlice::Reset(const Napi::CallbackInfo& info) {
  if (mAlgorithm) {
    double normalizedHPF = std::min(mHighPassFreq / mSampleRate, 0.5);
    mAlgorithm->init(mFloor, normalizedHPF);
  }
  return info.Env().Undefined();
}

Napi::Object InitAmpSlice(Napi::Env env, Napi::Object exports) {
  return AmpSlice::Init(env, exports);
}

} // namespace flucoma_native
