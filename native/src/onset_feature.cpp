#include <napi.h>
#include "../../flucoma-core/include/flucoma/algorithms/public/OnsetDetectionFunctions.hpp"
#include "../../flucoma-core/include/flucoma/data/FluidMemory.hpp"
#include "../../flucoma-core/include/flucoma/data/TensorTypes.hpp"
#include <vector>
#include <memory>

namespace flucoma_native {

class OnsetFeature : public Napi::ObjectWrap<OnsetFeature> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  OnsetFeature(const Napi::CallbackInfo& info);
  ~OnsetFeature() = default;

private:
  static Napi::FunctionReference constructor;
  
  Napi::Value Process(const Napi::CallbackInfo& info);
  Napi::Value Reset(const Napi::CallbackInfo& info);
  
  std::unique_ptr<fluid::algorithm::OnsetDetectionFunctions> mAlgorithm;
  
  int mFunction{0};
  int mFilterSize{5};
  int mFrameDelta{0};
  int mWindowSize{1024};
  int mFFTSize{1024};
  int mHopSize{512};
  bool mInitialized{false};
};

Napi::FunctionReference OnsetFeature::constructor;

Napi::Object OnsetFeature::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "OnsetFeature", {
    InstanceMethod("process", &OnsetFeature::Process),
    InstanceMethod("reset", &OnsetFeature::Reset)
  });
  
  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();
  
  exports.Set("OnsetFeature", func);
  return exports;
}

OnsetFeature::OnsetFeature(const Napi::CallbackInfo& info)
  : Napi::ObjectWrap<OnsetFeature>(info) {
  
  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object options = info[0].As<Napi::Object>();
    
    if (options.Has("function") && options.Get("function").IsNumber()) {
      mFunction = options.Get("function").As<Napi::Number>().Int32Value();
    }
    if (options.Has("filterSize") && options.Get("filterSize").IsNumber()) {
      mFilterSize = options.Get("filterSize").As<Napi::Number>().Int32Value();
    }
    if (options.Has("frameDelta") && options.Get("frameDelta").IsNumber()) {
      mFrameDelta = options.Get("frameDelta").As<Napi::Number>().Int32Value();
    }
    if (options.Has("windowSize") && options.Get("windowSize").IsNumber()) {
      mWindowSize = options.Get("windowSize").As<Napi::Number>().Int32Value();
    }
    if (options.Has("fftSize") && options.Get("fftSize").IsNumber()) {
      mFFTSize = options.Get("fftSize").As<Napi::Number>().Int32Value();
    }
    if (options.Has("hopSize") && options.Get("hopSize").IsNumber()) {
      mHopSize = options.Get("hopSize").As<Napi::Number>().Int32Value();
    }
  }
  
  // Use the default FluCoMa allocator
  fluid::Allocator& allocator = fluid::FluidDefaultAllocator();
  
  const int maxFFTSize = std::max(mFFTSize, 16384);
  
  mAlgorithm = std::make_unique<fluid::algorithm::OnsetDetectionFunctions>(
    maxFFTSize, 101, allocator
  );
  
  mAlgorithm->init(mWindowSize, mFFTSize, mFilterSize);
  mInitialized = true;
}

Napi::Value OnsetFeature::Process(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  if (info.Length() < 1 || !info[0].IsTypedArray()) {
    Napi::TypeError::New(env, "Expected Float32Array or Float64Array as first argument")
      .ThrowAsJavaScriptException();
    return env.Null();
  }
  
  if (!mInitialized) {
    Napi::Error::New(env, "OnsetFeature not initialized")
      .ThrowAsJavaScriptException();
    return env.Null();
  }
  
  Napi::TypedArray inputArray = info[0].As<Napi::TypedArray>();
  size_t length = inputArray.ElementLength();
  
  if (length < static_cast<size_t>(mWindowSize)) {
    Napi::Error::New(env, "Input buffer too small for window size")
      .ThrowAsJavaScriptException();
    return env.Null();
  }
  
  // Get the default allocator for temporary allocations
  fluid::Allocator& allocator = fluid::FluidDefaultAllocator();
  
  std::vector<double> audioData(length);
  
  if (inputArray.TypedArrayType() == napi_float32_array) {
    Napi::Float32Array float32Array = inputArray.As<Napi::Float32Array>();
    for (size_t i = 0; i < length; i++) {
      audioData[i] = static_cast<double>(float32Array[i]);
    }
  } else if (inputArray.TypedArrayType() == napi_float64_array) {
    Napi::Float64Array float64Array = inputArray.As<Napi::Float64Array>();
    for (size_t i = 0; i < length; i++) {
      audioData[i] = float64Array[i];
    }
  } else {
    Napi::TypeError::New(env, "Expected Float32Array or Float64Array")
      .ThrowAsJavaScriptException();
    return env.Null();
  }
  
  size_t numFrames = (length - mWindowSize) / mHopSize + 1;
  Napi::Array results = Napi::Array::New(env, numFrames);
  
  for (size_t i = 0; i < numFrames; i++) {
    size_t offset = i * mHopSize;
    fluid::RealVector inputVec(mWindowSize + mFrameDelta, allocator);
    
    for (int j = 0; j < mWindowSize + mFrameDelta && offset + j < length; j++) {
      inputVec(j) = audioData[offset + j];
    }
    
    double onsetValue = mAlgorithm->processFrame(
      inputVec, mFunction, mFilterSize, mFrameDelta, allocator
    );
    
    results.Set(i, Napi::Number::New(env, onsetValue));
  }
  
  return results;
}

Napi::Value OnsetFeature::Reset(const Napi::CallbackInfo& info) {
  if (mAlgorithm) {
    mAlgorithm->init(mWindowSize, mFFTSize, mFilterSize);
  }
  
  return info.Env().Undefined();
}

Napi::Object InitOnsetFeature(Napi::Env env, Napi::Object exports) {
  return OnsetFeature::Init(env, exports);
}

}
