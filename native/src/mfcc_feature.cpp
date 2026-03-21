#include <napi.h>
#include "../../third_party/flucoma-core/include/flucoma/algorithms/public/STFT.hpp"
#include "../../third_party/flucoma-core/include/flucoma/algorithms/public/MelBands.hpp"
#include "../../third_party/flucoma-core/include/flucoma/algorithms/public/DCT.hpp"
#include "../../third_party/flucoma-core/include/flucoma/data/FluidMemory.hpp"
#include "../../third_party/flucoma-core/include/flucoma/data/TensorTypes.hpp"
#include <algorithm>
#include <memory>
#include <vector>

namespace flucoma_native {

class MFCCFeature : public Napi::ObjectWrap<MFCCFeature> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  MFCCFeature(const Napi::CallbackInfo& info);
  ~MFCCFeature() = default;

private:
  static Napi::FunctionReference constructor;

  Napi::Value Process(const Napi::CallbackInfo& info);
  Napi::Value Reset(const Napi::CallbackInfo& info);

  void initAlgorithms();

  int    mNumCoeffs{13};
  int    mNumBands{40};
  double mMinFreq{20.0};
  double mMaxFreq{20000.0};
  int    mWindowSize{1024};
  int    mFFTSize{1024};
  int    mHopSize{512};
  double mSampleRate{44100.0};

  std::unique_ptr<fluid::algorithm::STFT>     mSTFT;
  std::unique_ptr<fluid::algorithm::MelBands> mMelBands;
  std::unique_ptr<fluid::algorithm::DCT>      mDCT;

  // Per-frame reusable tensors (allocated once, reused each frame)
  fluid::FluidTensor<std::complex<double>, 1> mSpectrum;
  fluid::FluidTensor<double, 1>               mMagnitude;
  fluid::FluidTensor<double, 1>               mBands;
  fluid::FluidTensor<double, 1>               mCoefficients;

  bool mInitialized{false};
};

Napi::FunctionReference MFCCFeature::constructor;

Napi::Object MFCCFeature::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "MFCCFeature", {
    InstanceMethod("process", &MFCCFeature::Process),
    InstanceMethod("reset",   &MFCCFeature::Reset)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("MFCCFeature", func);
  return exports;
}

MFCCFeature::MFCCFeature(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<MFCCFeature>(info) {

  Napi::Env env = info.Env();

  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object opts = info[0].As<Napi::Object>();

    auto getInt = [&](const char* key, int& dest) {
      if (opts.Has(key) && opts.Get(key).IsNumber())
        dest = opts.Get(key).As<Napi::Number>().Int32Value();
    };
    auto getDbl = [&](const char* key, double& dest) {
      if (opts.Has(key) && opts.Get(key).IsNumber())
        dest = opts.Get(key).As<Napi::Number>().DoubleValue();
    };

    getInt("numCoeffs",  mNumCoeffs);
    getInt("numBands",   mNumBands);
    getDbl("minFreq",    mMinFreq);
    getDbl("maxFreq",    mMaxFreq);
    getInt("windowSize", mWindowSize);
    getInt("fftSize",    mFFTSize);
    getInt("hopSize",    mHopSize);
    getDbl("sampleRate", mSampleRate);
  }

  // Validate interdependent parameters
  if (mNumCoeffs > mNumBands) {
    Napi::TypeError::New(env, "numCoeffs must be <= numBands")
        .ThrowAsJavaScriptException();
    return;
  }
  if (mFFTSize < mWindowSize) {
    Napi::TypeError::New(env, "fftSize must be >= windowSize")
        .ThrowAsJavaScriptException();
    return;
  }
  if (mNumCoeffs < 2) {
    Napi::TypeError::New(env, "numCoeffs must be >= 2")
        .ThrowAsJavaScriptException();
    return;
  }
  if (mNumBands < 2) {
    Napi::TypeError::New(env, "numBands must be >= 2")
        .ThrowAsJavaScriptException();
    return;
  }
  if (mMinFreq >= mMaxFreq) {
    Napi::TypeError::New(env, "minFreq must be < maxFreq")
        .ThrowAsJavaScriptException();
    return;
  }

  initAlgorithms();
  mInitialized = true;
}

void MFCCFeature::initAlgorithms() {
  fluid::Allocator& alloc = fluid::FluidDefaultAllocator();
  int nBins = mFFTSize / 2 + 1;

  mSTFT     = std::make_unique<fluid::algorithm::STFT>(mWindowSize, mFFTSize, mHopSize, 0, alloc);
  mMelBands = std::make_unique<fluid::algorithm::MelBands>(mNumBands, mFFTSize, alloc);
  mDCT      = std::make_unique<fluid::algorithm::DCT>(mNumBands, mNumCoeffs, alloc);

  mMelBands->init(mMinFreq, mMaxFreq, mNumBands, nBins, mSampleRate, mWindowSize, alloc);
  mDCT->init(mNumBands, mNumCoeffs, alloc);

  // Allocate per-frame tensors
  mSpectrum     = fluid::FluidTensor<std::complex<double>, 1>(nBins);
  mMagnitude    = fluid::FluidTensor<double, 1>(nBins);
  mBands        = fluid::FluidTensor<double, 1>(mNumBands);
  mCoefficients = fluid::FluidTensor<double, 1>(mNumCoeffs);
}

Napi::Value MFCCFeature::Process(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsTypedArray()) {
    Napi::TypeError::New(env, "Expected Float32Array or Float64Array as first argument")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!mInitialized) {
    Napi::Error::New(env, "MFCCFeature not initialized")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::TypedArray inputArray = info[0].As<Napi::TypedArray>();
  size_t length = inputArray.ElementLength();

  if (length < static_cast<size_t>(mWindowSize)) {
    Napi::Error::New(env, "Input buffer is smaller than windowSize")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::vector<double> audioData(length);

  if (inputArray.TypedArrayType() == napi_float32_array) {
    Napi::Float32Array arr = inputArray.As<Napi::Float32Array>();
    for (size_t i = 0; i < length; i++)
      audioData[i] = static_cast<double>(arr[i]);
  } else if (inputArray.TypedArrayType() == napi_float64_array) {
    Napi::Float64Array arr = inputArray.As<Napi::Float64Array>();
    for (size_t i = 0; i < length; i++)
      audioData[i] = arr[i];
  } else {
    Napi::TypeError::New(env, "Expected Float32Array or Float64Array")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  fluid::Allocator& alloc = fluid::FluidDefaultAllocator();

  size_t numFrames = (length - static_cast<size_t>(mWindowSize)) / static_cast<size_t>(mHopSize) + 1;
  Napi::Array results = Napi::Array::New(env, numFrames);

  for (size_t i = 0; i < numFrames; i++) {
    size_t offset = i * static_cast<size_t>(mHopSize);

    fluid::RealVector frameVec(mWindowSize, alloc);
    for (int j = 0; j < mWindowSize; j++)
      frameVec(j) = audioData[offset + static_cast<size_t>(j)];

    fluid::RealVectorView  frameView = frameVec;
    fluid::ComplexVectorView specView = mSpectrum;
    fluid::RealVectorView  magView  = mMagnitude;
    fluid::RealVectorView  bandView = mBands;
    fluid::RealVectorView  coefView = mCoefficients;

    mSTFT->processFrame(frameView, specView);
    fluid::algorithm::STFT::magnitude(
        static_cast<fluid::FluidTensorView<std::complex<double>, 1>>(mSpectrum),
        static_cast<fluid::FluidTensorView<double, 1>>(mMagnitude));
    mMelBands->processFrame(magView, bandView, false, false, true, alloc);
    mDCT->processFrame(bandView, coefView);

    Napi::Array frameResult = Napi::Array::New(env, static_cast<size_t>(mNumCoeffs));
    for (int k = 0; k < mNumCoeffs; k++)
      frameResult.Set(static_cast<uint32_t>(k), Napi::Number::New(env, mCoefficients(k)));

    results.Set(static_cast<uint32_t>(i), frameResult);
  }

  return results;
}

Napi::Value MFCCFeature::Reset(const Napi::CallbackInfo& info) {
  if (mInitialized)
    initAlgorithms();
  return info.Env().Undefined();
}

Napi::Object InitMFCCFeature(Napi::Env env, Napi::Object exports) {
  return MFCCFeature::Init(env, exports);
}

} // namespace flucoma_native
