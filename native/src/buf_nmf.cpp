#include <napi.h>
#include "../../flucoma-core/include/flucoma/algorithms/public/NMF.hpp"
#include "../../flucoma-core/include/flucoma/algorithms/public/STFT.hpp"
#include "../../flucoma-core/include/flucoma/data/FluidMemory.hpp"
#include "../../flucoma-core/include/flucoma/data/TensorTypes.hpp"
#include <vector>
#include <memory>
#include <cmath>

namespace flucoma_native {

class BufNMF : public Napi::ObjectWrap<BufNMF> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  BufNMF(const Napi::CallbackInfo& info);
  ~BufNMF() = default;

private:
  static Napi::FunctionReference constructor;
  
  Napi::Value Process(const Napi::CallbackInfo& info);
  
  int mComponents{1};
  int mIterations{100};
  int mFFTSize{1024};
  int mHopSize{-1};
  int mWindowSize{-1};
  int mSeed{-1};
};

Napi::FunctionReference BufNMF::constructor;

Napi::Object BufNMF::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "BufNMF", {
    InstanceMethod("process", &BufNMF::Process)
  });
  
  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();
  
  exports.Set("BufNMF", func);
  return exports;
}

BufNMF::BufNMF(const Napi::CallbackInfo& info)
  : Napi::ObjectWrap<BufNMF>(info) {
  
  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object options = info[0].As<Napi::Object>();
    
    if (options.Has("components") && options.Get("components").IsNumber()) {
      mComponents = options.Get("components").As<Napi::Number>().Int32Value();
    }
    if (options.Has("iterations") && options.Get("iterations").IsNumber()) {
      mIterations = options.Get("iterations").As<Napi::Number>().Int32Value();
    }
    if (options.Has("fftSize") && options.Get("fftSize").IsNumber()) {
      mFFTSize = options.Get("fftSize").As<Napi::Number>().Int32Value();
    }
    if (options.Has("hopSize") && options.Get("hopSize").IsNumber()) {
      mHopSize = options.Get("hopSize").As<Napi::Number>().Int32Value();
    }
    if (options.Has("windowSize") && options.Get("windowSize").IsNumber()) {
      mWindowSize = options.Get("windowSize").As<Napi::Number>().Int32Value();
    }
    if (options.Has("seed") && options.Get("seed").IsNumber()) {
      mSeed = options.Get("seed").As<Napi::Number>().Int32Value();
    }
  }
}

Napi::Value BufNMF::Process(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  if (info.Length() < 2 || !info[0].IsTypedArray() || !info[1].IsNumber()) {
    Napi::TypeError::New(env, "Expected (audioData: Float32Array, sampleRate: number)")
        .ThrowAsJavaScriptException();
    return env.Null();
  }
  
  Napi::Float32Array audioData = info[0].As<Napi::Float32Array>();
  
  size_t numSamples = audioData.ElementLength();
  
  Napi::Object result = Napi::Object::New(env);
  
  try {
    using namespace fluid;
    
    int hopSize = mHopSize > 0 ? mHopSize : mFFTSize / 2;
    int windowSize = mWindowSize > 0 ? mWindowSize : mFFTSize;
    
    fluid::index nBins = mFFTSize / 2 + 1;
    fluid::index nWindows = static_cast<fluid::index>(std::floor((numSamples + hopSize) / hopSize));
    
    auto stft = algorithm::STFT(windowSize, mFFTSize, hopSize);
    auto audioTensor = FluidTensor<double, 1>(numSamples);
    auto spectrum = FluidTensor<std::complex<double>, 2>(nWindows, nBins);
    auto magnitude = FluidTensor<double, 2>(nWindows, nBins);
    
    for (size_t i = 0; i < numSamples; i++) {
      audioTensor(i) = static_cast<double>(audioData[i]);
    }
    
    stft.process(audioTensor, spectrum);
    algorithm::STFT::magnitude(spectrum, magnitude);
    
    auto bases = FluidTensor<double, 2>(mComponents, nBins);
    auto activations = FluidTensor<double, 2>(nWindows, mComponents);
    auto reconstructed = FluidTensor<double, 2>(nWindows, nBins);
    
    auto nmf = algorithm::NMF();
    nmf.process(magnitude, bases, activations, reconstructed, 
                mComponents, mIterations, true, true, mSeed);
    
    result.Set("components", mComponents);
    result.Set("iterations", mIterations);
    result.Set("converged", true);
    
    Napi::Array basesArray = Napi::Array::New(env, mComponents);
    for (int i = 0; i < mComponents; i++) {
      Napi::Array basisVector = Napi::Array::New(env, nBins);
      for (int j = 0; j < nBins; j++) {
        basisVector.Set(j, Napi::Number::New(env, bases(i, j)));
      }
      basesArray.Set(i, basisVector);
    }
    
    Napi::Array activationsArray = Napi::Array::New(env, mComponents);
    for (int i = 0; i < mComponents; i++) {
      Napi::Array activationVector = Napi::Array::New(env, nWindows);
      for (int j = 0; j < nWindows; j++) {
        activationVector.Set(j, Napi::Number::New(env, activations(j, i)));
      }
      activationsArray.Set(i, activationVector);
    }
    
    result.Set("bases", basesArray);
    result.Set("activations", activationsArray);
    
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
  
  return result;
}

Napi::Object InitBufNMF(Napi::Env env, Napi::Object exports) {
  return BufNMF::Init(env, exports);
}

} // namespace flucoma_native
