#include <napi.h>
#include "../../third_party/flucoma-core/include/flucoma/algorithms/public/NoveltySegmentation.hpp"
#include "../../third_party/flucoma-core/include/flucoma/algorithms/public/STFT.hpp"
#include "../../third_party/flucoma-core/include/flucoma/data/FluidMemory.hpp"
#include "../../third_party/flucoma-core/include/flucoma/data/FluidTensor.hpp"
#include "../../third_party/flucoma-core/include/flucoma/data/TensorTypes.hpp"
#include <algorithm>
#include <complex>
#include <memory>
#include <vector>

namespace flucoma_native {

class NoveltySlice : public Napi::ObjectWrap<NoveltySlice> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  NoveltySlice(const Napi::CallbackInfo& info);
  ~NoveltySlice() = default;

private:
  static Napi::FunctionReference constructor;

  Napi::Value Process(const Napi::CallbackInfo& info);
  Napi::Value Reset(const Napi::CallbackInfo& info);

  std::unique_ptr<fluid::algorithm::NoveltySegmentation> mNovelty;
  std::unique_ptr<fluid::algorithm::STFT>                mSTFT;

  int    mKernelSize{3};
  double mThreshold{0.5};
  int    mFilterSize{1};
  int    mMinSliceLength{2};
  int    mWindowSize{1024};
  int    mFFTSize{1024};
  int    mHopSize{512};
};

Napi::FunctionReference NoveltySlice::constructor;

Napi::Object NoveltySlice::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "NoveltySlice", {
    InstanceMethod("process", &NoveltySlice::Process),
    InstanceMethod("reset",   &NoveltySlice::Reset)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("NoveltySlice", func);
  return exports;
}

NoveltySlice::NoveltySlice(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<NoveltySlice>(info) {

  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object opts = info[0].As<Napi::Object>();

    if (opts.Has("kernelSize") && opts.Get("kernelSize").IsNumber()) {
      int ks = opts.Get("kernelSize").As<Napi::Number>().Int32Value();
      // kernelSize must be odd
      mKernelSize = (ks % 2 == 0) ? ks + 1 : ks;
    }
    if (opts.Has("threshold") && opts.Get("threshold").IsNumber())
      mThreshold = opts.Get("threshold").As<Napi::Number>().DoubleValue();
    if (opts.Has("filterSize") && opts.Get("filterSize").IsNumber())
      mFilterSize = opts.Get("filterSize").As<Napi::Number>().Int32Value();
    if (opts.Has("minSliceLength") && opts.Get("minSliceLength").IsNumber())
      mMinSliceLength = opts.Get("minSliceLength").As<Napi::Number>().Int32Value();
    if (opts.Has("windowSize") && opts.Get("windowSize").IsNumber())
      mWindowSize = opts.Get("windowSize").As<Napi::Number>().Int32Value();
    if (opts.Has("fftSize") && opts.Get("fftSize").IsNumber())
      mFFTSize = opts.Get("fftSize").As<Napi::Number>().Int32Value();
    if (opts.Has("hopSize") && opts.Get("hopSize").IsNumber())
      mHopSize = opts.Get("hopSize").As<Napi::Number>().Int32Value();
  }

  fluid::Allocator& alloc = fluid::FluidDefaultAllocator();

  fluid::index frameSize = mFFTSize / 2 + 1;

  mNovelty = std::make_unique<fluid::algorithm::NoveltySegmentation>(
      mKernelSize, frameSize, mFilterSize, alloc);

  mNovelty->init(mKernelSize, mFilterSize, frameSize, alloc);

  mSTFT = std::make_unique<fluid::algorithm::STFT>(
      mWindowSize, mFFTSize, mHopSize, 0, alloc);
}

Napi::Value NoveltySlice::Process(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsTypedArray()) {
    Napi::TypeError::New(env, "Expected Float32Array or Float64Array as first argument")
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

  fluid::Allocator& alloc = fluid::FluidDefaultAllocator();
  fluid::index frameSize = mFFTSize / 2 + 1;

  fluid::FluidTensor<std::complex<double>, 1> spectrum(frameSize, alloc);
  fluid::FluidTensor<double, 1>               magnitude(frameSize, alloc);
  fluid::FluidTensor<double, 1>               frame(mWindowSize, alloc);

  size_t numFrames = (length - mWindowSize) / mHopSize + 1;
  std::vector<int> sliceIndices;

  for (size_t i = 0; i < numFrames; i++) {
    size_t offset = i * static_cast<size_t>(mHopSize);

    // Fill frame (zero-pad if needed)
    for (fluid::index j = 0; j < mWindowSize; j++) {
      size_t src = offset + static_cast<size_t>(j);
      frame(j) = (src < length) ? audio[src] : 0.0;
    }

    mSTFT->processFrame(frame, spectrum);
    fluid::algorithm::STFT::magnitude(spectrum, magnitude);

    double detected = mNovelty->processFrame(
        magnitude, mThreshold, static_cast<fluid::index>(mMinSliceLength), alloc);

    if (detected > 0.0)
      sliceIndices.push_back(static_cast<int>(offset));
  }

  Napi::Array results = Napi::Array::New(env, sliceIndices.size());
  for (size_t i = 0; i < sliceIndices.size(); i++)
    results.Set(i, Napi::Number::New(env, sliceIndices[i]));

  return results;
}

Napi::Value NoveltySlice::Reset(const Napi::CallbackInfo& info) {
  fluid::Allocator& alloc = fluid::FluidDefaultAllocator();
  if (mNovelty) {
    fluid::index frameSize = mFFTSize / 2 + 1;
    mNovelty->init(mKernelSize, mFilterSize, frameSize, alloc);
  }
  return info.Env().Undefined();
}

Napi::Object InitNoveltySlice(Napi::Env env, Napi::Object exports) {
  return NoveltySlice::Init(env, exports);
}

} // namespace flucoma_native
