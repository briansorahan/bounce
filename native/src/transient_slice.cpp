#include <napi.h>
#include "../../third_party/flucoma-core/include/flucoma/algorithms/public/TransientSegmentation.hpp"
#include "../../third_party/flucoma-core/include/flucoma/data/FluidMemory.hpp"
#include "../../third_party/flucoma-core/include/flucoma/data/FluidTensor.hpp"
#include "../../third_party/flucoma-core/include/flucoma/data/TensorTypes.hpp"
#include <algorithm>
#include <cmath>
#include <memory>
#include <vector>

namespace flucoma_native {

class TransientSlice : public Napi::ObjectWrap<TransientSlice> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  TransientSlice(const Napi::CallbackInfo& info);
  ~TransientSlice() = default;

private:
  static Napi::FunctionReference constructor;

  Napi::Value Process(const Napi::CallbackInfo& info);
  Napi::Value Reset(const Napi::CallbackInfo& info);

  void applyDetectionParams();

  std::unique_ptr<fluid::algorithm::TransientSegmentation> mAlgorithm;

  int    mOrder{20};
  int    mBlockSize{256};
  int    mPadSize{128};
  double mSkew{0.0};
  double mThreshFwd{2.0};
  double mThreshBack{1.1};
  int    mWindowSize{14};
  int    mClumpLength{25};
  int    mMinSliceLength{1000};
};

Napi::FunctionReference TransientSlice::constructor;

Napi::Object TransientSlice::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "TransientSlice", {
    InstanceMethod("process", &TransientSlice::Process),
    InstanceMethod("reset",   &TransientSlice::Reset)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("TransientSlice", func);
  return exports;
}

TransientSlice::TransientSlice(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<TransientSlice>(info) {

  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object opts = info[0].As<Napi::Object>();

    if (opts.Has("order") && opts.Get("order").IsNumber())
      mOrder = opts.Get("order").As<Napi::Number>().Int32Value();
    if (opts.Has("blockSize") && opts.Get("blockSize").IsNumber())
      mBlockSize = opts.Get("blockSize").As<Napi::Number>().Int32Value();
    if (opts.Has("padSize") && opts.Get("padSize").IsNumber())
      mPadSize = opts.Get("padSize").As<Napi::Number>().Int32Value();
    if (opts.Has("skew") && opts.Get("skew").IsNumber())
      mSkew = opts.Get("skew").As<Napi::Number>().DoubleValue();
    if (opts.Has("threshFwd") && opts.Get("threshFwd").IsNumber())
      mThreshFwd = opts.Get("threshFwd").As<Napi::Number>().DoubleValue();
    if (opts.Has("threshBack") && opts.Get("threshBack").IsNumber())
      mThreshBack = opts.Get("threshBack").As<Napi::Number>().DoubleValue();
    if (opts.Has("windowSize") && opts.Get("windowSize").IsNumber())
      mWindowSize = opts.Get("windowSize").As<Napi::Number>().Int32Value();
    if (opts.Has("clumpLength") && opts.Get("clumpLength").IsNumber())
      mClumpLength = opts.Get("clumpLength").As<Napi::Number>().Int32Value();
    if (opts.Has("minSliceLength") && opts.Get("minSliceLength").IsNumber())
      mMinSliceLength = opts.Get("minSliceLength").As<Napi::Number>().Int32Value();
  }

  fluid::Allocator& alloc = fluid::FluidDefaultAllocator();

  mAlgorithm = std::make_unique<fluid::algorithm::TransientSegmentation>(
      mOrder, mBlockSize, mPadSize, alloc);

  mAlgorithm->init(
      static_cast<fluid::index>(mOrder),
      static_cast<fluid::index>(mBlockSize),
      static_cast<fluid::index>(mPadSize));

  applyDetectionParams();
}

void TransientSlice::applyDetectionParams() {
  // skew is passed as power factor (pow(2, skewParam)) per TransientSliceClient
  double power      = std::pow(2.0, mSkew);
  fluid::index halfWindow = static_cast<fluid::index>(std::lrint(mWindowSize / 2.0));

  mAlgorithm->setDetectionParameters(
      power,
      mThreshFwd,
      mThreshBack,
      halfWindow,
      static_cast<fluid::index>(mClumpLength),
      static_cast<fluid::index>(mMinSliceLength));
}

Napi::Value TransientSlice::Process(const Napi::CallbackInfo& info) {
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

  fluid::Allocator& alloc = fluid::FluidDefaultAllocator();

  fluid::index inputSize = mAlgorithm->inputSize();
  fluid::index hopSize   = mAlgorithm->hopSize();

  fluid::FluidTensor<double, 1> inputBlock(inputSize, alloc);
  fluid::FluidTensor<double, 1> outputBlock(hopSize, alloc);

  std::vector<int> sliceIndices;

  fluid::index totalSamples = static_cast<fluid::index>(length);
  fluid::index offset = 0;

  while (offset + hopSize <= totalSamples) {
    // Fill input block; zero-pad tail if needed
    for (fluid::index j = 0; j < inputSize; j++) {
      fluid::index src = offset + j;
      inputBlock(j) = (src < totalSamples) ? audio[static_cast<size_t>(src)] : 0.0;
    }

    outputBlock.fill(0.0);
    mAlgorithm->process(inputBlock, outputBlock, alloc);

    for (fluid::index j = 0; j < hopSize; j++) {
      if (outputBlock(j) > 0.5)
        sliceIndices.push_back(static_cast<int>(offset + j));
    }

    offset += hopSize;
  }

  Napi::Array results = Napi::Array::New(env, sliceIndices.size());
  for (size_t i = 0; i < sliceIndices.size(); i++)
    results.Set(i, Napi::Number::New(env, sliceIndices[i]));

  return results;
}

Napi::Value TransientSlice::Reset(const Napi::CallbackInfo& info) {
  if (mAlgorithm) {
    mAlgorithm->init(
        static_cast<fluid::index>(mOrder),
        static_cast<fluid::index>(mBlockSize),
        static_cast<fluid::index>(mPadSize));
    applyDetectionParams();
  }
  return info.Env().Undefined();
}

Napi::Object InitTransientSlice(Napi::Env env, Napi::Object exports) {
  return TransientSlice::Init(env, exports);
}

} // namespace flucoma_native
