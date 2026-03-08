#include <napi.h>
#include "../../flucoma-core/include/flucoma/algorithms/public/STFT.hpp"
#include "../../flucoma-core/include/flucoma/algorithms/public/SpectralShape.hpp"
#include "../../flucoma-core/include/flucoma/data/FluidMemory.hpp"
#include "../../flucoma-core/include/flucoma/data/TensorTypes.hpp"
#include <algorithm>
#include <memory>
#include <vector>

namespace flucoma_native {

static constexpr int kNumSpectralDescriptors = 7;

class SpectralShapeFeature : public Napi::ObjectWrap<SpectralShapeFeature> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  SpectralShapeFeature(const Napi::CallbackInfo& info);
  ~SpectralShapeFeature() = default;

private:
  static Napi::FunctionReference constructor;

  Napi::Value Process(const Napi::CallbackInfo& info);
  Napi::Value Reset(const Napi::CallbackInfo& info);

  void initAlgorithms();

  int    mWindowSize{1024};
  int    mFFTSize{1024};
  int    mHopSize{512};
  double mSampleRate{44100.0};
  double mMinFreq{0.0};
  double mMaxFreq{-1.0};    // -1 means use Nyquist
  double mRolloffTarget{95.0};
  bool   mLogFreq{false};
  bool   mUsePower{false};

  std::unique_ptr<fluid::algorithm::STFT>          mSTFT;
  std::unique_ptr<fluid::algorithm::SpectralShape> mSpectralShape;

  fluid::FluidTensor<std::complex<double>, 1> mSpectrum;
  fluid::FluidTensor<double, 1>               mMagnitude;
  fluid::FluidTensor<double, 1>               mShapeOutput;

  bool mInitialized{false};
};

Napi::FunctionReference SpectralShapeFeature::constructor;

Napi::Object SpectralShapeFeature::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "SpectralShapeFeature", {
    InstanceMethod("process", &SpectralShapeFeature::Process),
    InstanceMethod("reset",   &SpectralShapeFeature::Reset)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("SpectralShapeFeature", func);
  return exports;
}

SpectralShapeFeature::SpectralShapeFeature(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<SpectralShapeFeature>(info) {

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
    auto getBool = [&](const char* key, bool& dest) {
      if (opts.Has(key) && opts.Get(key).IsBoolean())
        dest = opts.Get(key).As<Napi::Boolean>().Value();
    };

    getInt("windowSize",    mWindowSize);
    getInt("fftSize",       mFFTSize);
    getInt("hopSize",       mHopSize);
    getDbl("sampleRate",    mSampleRate);
    getDbl("minFreq",       mMinFreq);
    getDbl("maxFreq",       mMaxFreq);
    getDbl("rolloffTarget", mRolloffTarget);
    getBool("logFreq",      mLogFreq);
    getBool("usePower",     mUsePower);
  }

  if (mFFTSize < mWindowSize) {
    Napi::TypeError::New(env, "fftSize must be >= windowSize")
        .ThrowAsJavaScriptException();
    return;
  }
  if (mWindowSize < 2) {
    Napi::TypeError::New(env, "windowSize must be >= 2")
        .ThrowAsJavaScriptException();
    return;
  }

  initAlgorithms();
  mInitialized = true;
}

void SpectralShapeFeature::initAlgorithms() {
  fluid::Allocator& alloc = fluid::FluidDefaultAllocator();
  int nBins = mFFTSize / 2 + 1;

  mSTFT         = std::make_unique<fluid::algorithm::STFT>(mWindowSize, mFFTSize, mHopSize, 0, alloc);
  mSpectralShape = std::make_unique<fluid::algorithm::SpectralShape>(alloc);

  mSpectrum    = fluid::FluidTensor<std::complex<double>, 1>(nBins);
  mMagnitude   = fluid::FluidTensor<double, 1>(nBins);
  mShapeOutput = fluid::FluidTensor<double, 1>(kNumSpectralDescriptors);
}

Napi::Value SpectralShapeFeature::Process(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsTypedArray()) {
    Napi::TypeError::New(env, "Expected Float32Array or Float64Array as first argument")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!mInitialized) {
    Napi::Error::New(env, "SpectralShapeFeature not initialized")
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
  std::vector<double> accumulated(kNumSpectralDescriptors, 0.0);

  for (size_t i = 0; i < numFrames; i++) {
    size_t offset = i * static_cast<size_t>(mHopSize);

    fluid::RealVector frameVec(mWindowSize, alloc);
    for (int j = 0; j < mWindowSize; j++)
      frameVec(j) = audioData[offset + static_cast<size_t>(j)];

    fluid::RealVectorView    frameView = frameVec;
    fluid::ComplexVectorView specView  = mSpectrum;
    fluid::RealVectorView    magView   = mMagnitude;

    mSTFT->processFrame(frameView, specView);
    fluid::algorithm::STFT::magnitude(
        static_cast<fluid::FluidTensorView<std::complex<double>, 1>>(mSpectrum),
        static_cast<fluid::FluidTensorView<double, 1>>(mMagnitude));

    fluid::RealVectorView shapeView = mShapeOutput;
    mSpectralShape->processFrame(magView, shapeView,
                                  mSampleRate, mMinFreq, mMaxFreq,
                                  mRolloffTarget, mLogFreq, mUsePower, alloc);

    for (int k = 0; k < kNumSpectralDescriptors; k++)
      accumulated[k] += mShapeOutput(k);
  }

  Napi::Array result = Napi::Array::New(env, kNumSpectralDescriptors);
  for (int k = 0; k < kNumSpectralDescriptors; k++) {
    double avg = (numFrames > 0) ? accumulated[k] / static_cast<double>(numFrames) : 0.0;
    result.Set(static_cast<uint32_t>(k), Napi::Number::New(env, avg));
  }

  return result;
}

Napi::Value SpectralShapeFeature::Reset(const Napi::CallbackInfo& info) {
  if (mInitialized)
    initAlgorithms();
  return info.Env().Undefined();
}

Napi::Object InitSpectralShapeFeature(Napi::Env env, Napi::Object exports) {
  return SpectralShapeFeature::Init(env, exports);
}

} // namespace flucoma_native
