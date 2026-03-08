#include <napi.h>
#include "../../flucoma-core/include/flucoma/algorithms/public/NMF.hpp"
#include "../../flucoma-core/include/flucoma/algorithms/public/NMFCross.hpp"
#include "../../flucoma-core/include/flucoma/algorithms/public/STFT.hpp"
#include "../../flucoma-core/include/flucoma/algorithms/public/RatioMask.hpp"
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
  Napi::Value Resynthesize(const Napi::CallbackInfo& info);
  
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
    InstanceMethod("process", &BufNMF::Process),
    InstanceMethod("resynthesize", &BufNMF::Resynthesize)
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

Napi::Value BufNMF::Resynthesize(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  if (info.Length() < 5 || 
      !info[0].IsTypedArray() || 
      !info[1].IsNumber() ||
      !info[2].IsArray() ||
      !info[3].IsArray() ||
      !info[4].IsNumber()) {
    Napi::TypeError::New(env, "Expected (audioData: Float32Array, sampleRate: number, bases: number[][], activations: number[][], componentIndex: number)")
        .ThrowAsJavaScriptException();
    return env.Null();
  }
  
  Napi::Float32Array audioData = info[0].As<Napi::Float32Array>();
  Napi::Array basesJS = info[2].As<Napi::Array>();
  Napi::Array activationsJS = info[3].As<Napi::Array>();
  int componentIndex = info[4].As<Napi::Number>().Int32Value();
  
  size_t numSamples = audioData.ElementLength();
  
  try {
    using namespace fluid;
    
    int hopSize = mHopSize > 0 ? mHopSize : mFFTSize / 2;
    int windowSize = mWindowSize > 0 ? mWindowSize : mFFTSize;
    
    fluid::index nBins = mFFTSize / 2 + 1;
    fluid::index nWindows = static_cast<fluid::index>(std::floor((numSamples + hopSize) / hopSize));
    
    // Parse bases and activations from JS
    uint32_t numComponents = basesJS.Length();
    
    if (componentIndex < 0 || componentIndex >= static_cast<int>(numComponents)) {
      Napi::Error::New(env, "Component index out of range").ThrowAsJavaScriptException();
      return env.Null();
    }
    
    auto bases = FluidTensor<double, 2>(numComponents, nBins);
    auto activations = FluidTensor<double, 2>(nWindows, numComponents);
    
    // Load bases
    for (uint32_t i = 0; i < numComponents; i++) {
      Napi::Array basis = basesJS.Get(i).As<Napi::Array>();
      for (uint32_t j = 0; j < basis.Length() && j < static_cast<uint32_t>(nBins); j++) {
        bases(i, j) = basis.Get(j).As<Napi::Number>().DoubleValue();
      }
    }
    
    // Load activations
    for (uint32_t i = 0; i < numComponents; i++) {
      Napi::Array activation = activationsJS.Get(i).As<Napi::Array>();
      for (uint32_t j = 0; j < activation.Length() && j < static_cast<uint32_t>(nWindows); j++) {
        activations(j, i) = activation.Get(j).As<Napi::Number>().DoubleValue();
      }
    }
    
    // Perform forward STFT on original audio
    auto stft = algorithm::STFT(windowSize, mFFTSize, hopSize);
    auto audioTensor = FluidTensor<double, 1>(numSamples);
    auto spectrum = FluidTensor<std::complex<double>, 2>(nWindows, nBins);
    
    for (size_t i = 0; i < numSamples; i++) {
      audioTensor(i) = static_cast<double>(audioData[i]);
    }
    
    stft.process(audioTensor, spectrum);
    
    // Estimate magnitude for this component only
    auto componentMag = FluidTensor<double, 2>(nWindows, nBins);
    algorithm::NMF::estimate(bases, activations, componentIndex, componentMag);
    
    // Initialize ratio mask with full reconstruction
    auto fullMag = FluidTensor<double, 2>(nWindows, nBins);
    for (uint32_t i = 0; i < numComponents; i++) {
      auto tmpMag = FluidTensor<double, 2>(nWindows, nBins);
      algorithm::NMF::estimate(bases, activations, i, tmpMag);
      for (fluid::index row = 0; row < nWindows; row++) {
        for (fluid::index col = 0; col < nBins; col++) {
          fullMag(row, col) += tmpMag(row, col);
        }
      }
    }
    
    auto mask = algorithm::RatioMask(nWindows, nBins, FluidDefaultAllocator());
    mask.init(fullMag);
    
    // Apply mask to get component spectrum
    auto componentSpectrum = FluidTensor<std::complex<double>, 2>(nWindows, nBins);
    mask.process(spectrum, componentMag, 1, componentSpectrum);
    
    // Inverse STFT
    auto istft = algorithm::ISTFT(windowSize, mFFTSize, hopSize);
    auto resynthAudio = FluidTensor<double, 1>(numSamples);
    istft.process(componentSpectrum, resynthAudio);
    
    // Convert to Float32Array
    Napi::Float32Array outputArray = Napi::Float32Array::New(env, numSamples);
    for (size_t i = 0; i < numSamples; i++) {
      outputArray[i] = static_cast<float>(resynthAudio(i));
    }
    
    return outputArray;
    
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

Napi::Object InitBufNMF(Napi::Env env, Napi::Object exports) {
  return BufNMF::Init(env, exports);
}

class BufNMFCross : public Napi::ObjectWrap<BufNMFCross> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  BufNMFCross(const Napi::CallbackInfo& info);
  ~BufNMFCross() = default;

private:
  static Napi::FunctionReference constructor;
  
  Napi::Value Process(const Napi::CallbackInfo& info);
  
  int mIterations{50};
  int mFFTSize{2048};
  int mHopSize{-1};
  int mWindowSize{-1};
  int mTimeSparsity{7};
  int mPolyphony{11};
  int mContinuity{7};
  int mSeed{-1};
};

Napi::FunctionReference BufNMFCross::constructor;

Napi::Object BufNMFCross::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "BufNMFCross", {
    InstanceMethod("process", &BufNMFCross::Process)
  });
  
  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();
  
  exports.Set("BufNMFCross", func);
  return exports;
}

BufNMFCross::BufNMFCross(const Napi::CallbackInfo& info)
  : Napi::ObjectWrap<BufNMFCross>(info) {
  
  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object options = info[0].As<Napi::Object>();
    
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
    if (options.Has("timeSparsity") && options.Get("timeSparsity").IsNumber()) {
      mTimeSparsity = options.Get("timeSparsity").As<Napi::Number>().Int32Value();
    }
    if (options.Has("polyphony") && options.Get("polyphony").IsNumber()) {
      mPolyphony = options.Get("polyphony").As<Napi::Number>().Int32Value();
    }
    if (options.Has("continuity") && options.Get("continuity").IsNumber()) {
      mContinuity = options.Get("continuity").As<Napi::Number>().Int32Value();
    }
    if (options.Has("seed") && options.Get("seed").IsNumber()) {
      mSeed = options.Get("seed").As<Napi::Number>().Int32Value();
    }
  }
}

Napi::Value BufNMFCross::Process(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  if (info.Length() < 4 || 
      !info[0].IsTypedArray() || 
      !info[1].IsNumber() ||
      !info[2].IsArray() ||
      !info[3].IsArray()) {
    Napi::TypeError::New(env, "Expected (targetAudio: Float32Array, sampleRate: number, sourceBases: number[][], sourceActivations: number[][])")
        .ThrowAsJavaScriptException();
    return env.Null();
  }
  
  Napi::Float32Array targetAudio = info[0].As<Napi::Float32Array>();
  Napi::Array basesJS = info[2].As<Napi::Array>();
  
  size_t numSamples = targetAudio.ElementLength();
  
  Napi::Object result = Napi::Object::New(env);
  
  try {
    using namespace fluid;
    
    int hopSize = mHopSize > 0 ? mHopSize : mFFTSize / 2;
    int windowSize = mWindowSize > 0 ? mWindowSize : mFFTSize;
    
    fluid::index nBins = mFFTSize / 2 + 1;
    fluid::index tgtWindows = static_cast<fluid::index>(std::floor((numSamples + hopSize) / hopSize));
    
    uint32_t numComponents = basesJS.Length();
    
    if (numComponents == 0 || !basesJS.Get(uint32_t(0)).IsArray()) {
      Napi::Error::New(env, "Invalid bases array").ThrowAsJavaScriptException();
      return env.Null();
    }
    
    Napi::Array firstBasis = basesJS.Get(uint32_t(0)).As<Napi::Array>();
    fluid::index srcBins = firstBasis.Length();
    
    if (srcBins != nBins) {
      char errorMsg[256];
      snprintf(errorMsg, sizeof(errorMsg), 
               "Source bases FFT size (%lld bins) must match target FFT size (%lld bins)",
               static_cast<long long>(srcBins), static_cast<long long>(nBins));
      Napi::Error::New(env, errorMsg).ThrowAsJavaScriptException();
      return env.Null();
    }
    
    auto sourceBases = FluidTensor<double, 2>(numComponents, srcBins);
    for (uint32_t i = 0; i < numComponents; i++) {
      Napi::Array basis = basesJS.Get(i).As<Napi::Array>();
      for (uint32_t j = 0; j < basis.Length() && j < static_cast<uint32_t>(srcBins); j++) {
        sourceBases(i, j) = basis.Get(j).As<Napi::Number>().DoubleValue();
      }
    }
    
    auto stft = algorithm::STFT(windowSize, mFFTSize, hopSize);
    auto targetTensor = FluidTensor<double, 1>(numSamples);
    auto targetSpectrum = FluidTensor<std::complex<double>, 2>(tgtWindows, nBins);
    auto targetMag = FluidTensor<double, 2>(tgtWindows, nBins);
    
    for (size_t i = 0; i < numSamples; i++) {
      targetTensor(i) = static_cast<double>(targetAudio[i]);
    }
    
    stft.process(targetTensor, targetSpectrum);
    algorithm::STFT::magnitude(targetSpectrum, targetMag);
    
    auto targetActivations = FluidTensor<double, 2>(tgtWindows, numComponents);
    
    // Clamp polyphony to number of components
    int polyphony = std::min(mPolyphony, static_cast<int>(numComponents));
    
    auto nmfCross = algorithm::NMFCross(mIterations);
    nmfCross.process(targetMag, targetActivations, sourceBases, 
                     mTimeSparsity, polyphony, mContinuity, mSeed);
    
    result.Set("components", static_cast<int>(numComponents));
    result.Set("iterations", mIterations);
    
    Napi::Array activationsArray = Napi::Array::New(env, numComponents);
    for (uint32_t i = 0; i < numComponents; i++) {
      Napi::Array activationVector = Napi::Array::New(env, tgtWindows);
      for (fluid::index j = 0; j < tgtWindows; j++) {
        activationVector.Set(static_cast<uint32_t>(j), 
                           Napi::Number::New(env, targetActivations(j, i)));
      }
      activationsArray.Set(i, activationVector);
    }
    
    Napi::Array basesArray = Napi::Array::New(env, numComponents);
    for (uint32_t i = 0; i < numComponents; i++) {
      Napi::Array basisVector = Napi::Array::New(env, srcBins);
      for (fluid::index j = 0; j < srcBins; j++) {
        basisVector.Set(static_cast<uint32_t>(j), 
                       Napi::Number::New(env, sourceBases(i, j)));
      }
      basesArray.Set(i, basisVector);
    }
    
    result.Set("activations", activationsArray);
    result.Set("bases", basesArray);
    
  } catch (const std::exception& e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
  
  return result;
}

Napi::Object InitBufNMFCross(Napi::Env env, Napi::Object exports) {
  return BufNMFCross::Init(env, exports);
}

} // namespace flucoma_native
