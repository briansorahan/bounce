#include <napi.h>
#include "../../flucoma-core/include/flucoma/algorithms/public/Normalization.hpp"
#include "../../flucoma-core/include/flucoma/data/FluidMemory.hpp"
#include "../../flucoma-core/include/flucoma/data/TensorTypes.hpp"
#include <algorithm>
#include <vector>

namespace flucoma_native {

class NormalizationBinding : public Napi::ObjectWrap<NormalizationBinding> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  NormalizationBinding(const Napi::CallbackInfo& info);
  ~NormalizationBinding() = default;

private:
  static Napi::FunctionReference constructor;

  Napi::Value Fit(const Napi::CallbackInfo& info);
  Napi::Value Transform(const Napi::CallbackInfo& info);
  Napi::Value TransformFrame(const Napi::CallbackInfo& info);
  Napi::Value Clear(const Napi::CallbackInfo& info);

  // Helper: parse a JS number[] into a FluidTensor<double,1>
  // Returns false and throws on error.
  bool parseVector(Napi::Env env, Napi::Value val,
                   fluid::FluidTensor<double, 1>& out);

  fluid::algorithm::Normalization mNormalization;
};

Napi::FunctionReference NormalizationBinding::constructor;

Napi::Object NormalizationBinding::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "Normalization", {
    InstanceMethod("fit",            &NormalizationBinding::Fit),
    InstanceMethod("transform",      &NormalizationBinding::Transform),
    InstanceMethod("transformFrame", &NormalizationBinding::TransformFrame),
    InstanceMethod("clear",          &NormalizationBinding::Clear)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("Normalization", func);
  return exports;
}

NormalizationBinding::NormalizationBinding(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<NormalizationBinding>(info) {}

bool NormalizationBinding::parseVector(Napi::Env env, Napi::Value val,
                                       fluid::FluidTensor<double, 1>& out) {
  if (!val.IsArray()) {
    Napi::TypeError::New(env, "Expected number[]").ThrowAsJavaScriptException();
    return false;
  }
  Napi::Array arr = val.As<Napi::Array>();
  uint32_t n = arr.Length();
  out = fluid::FluidTensor<double, 1>(static_cast<fluid::index>(n));
  for (uint32_t i = 0; i < n; i++)
    out(static_cast<fluid::index>(i)) = arr.Get(i).As<Napi::Number>().DoubleValue();
  return true;
}

// fit(data: number[][], min?: number, max?: number): void
// Computes per-column min/max from data and initialises the scaler.
Napi::Value NormalizationBinding::Fit(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsArray()) {
    Napi::TypeError::New(env, "Expected array of arrays as first argument")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  double targetMin = 0.0, targetMax = 1.0;
  if (info.Length() > 1 && info[1].IsNumber())
    targetMin = info[1].As<Napi::Number>().DoubleValue();
  if (info.Length() > 2 && info[2].IsNumber())
    targetMax = info[2].As<Napi::Number>().DoubleValue();

  Napi::Array rows = info[0].As<Napi::Array>();
  uint32_t nRows = rows.Length();

  if (nRows == 0) {
    Napi::Error::New(env, "Data array must not be empty")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Array firstRow = rows.Get(0u).As<Napi::Array>();
  uint32_t nCols = firstRow.Length();

  if (nCols == 0) {
    Napi::Error::New(env, "Data rows must not be empty")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  fluid::FluidTensor<double, 1> dataMin(static_cast<fluid::index>(nCols));
  fluid::FluidTensor<double, 1> dataMax(static_cast<fluid::index>(nCols));

  // Seed from first row
  for (uint32_t c = 0; c < nCols; c++) {
    double v = firstRow.Get(c).As<Napi::Number>().DoubleValue();
    dataMin(static_cast<fluid::index>(c)) = v;
    dataMax(static_cast<fluid::index>(c)) = v;
  }

  // Scan remaining rows
  for (uint32_t r = 1; r < nRows; r++) {
    Napi::Array row = rows.Get(r).As<Napi::Array>();
    for (uint32_t c = 0; c < nCols; c++) {
      double v = row.Get(c).As<Napi::Number>().DoubleValue();
      fluid::index ci = static_cast<fluid::index>(c);
      if (v < dataMin(ci)) dataMin(ci) = v;
      if (v > dataMax(ci)) dataMax(ci) = v;
    }
  }

  fluid::RealVectorView minView = dataMin;
  fluid::RealVectorView maxView = dataMax;
  mNormalization.init(targetMin, targetMax, minView, maxView);

  return env.Undefined();
}

// transform(data: number[][]): number[][]
Napi::Value NormalizationBinding::Transform(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!mNormalization.initialized()) {
    Napi::Error::New(env, "Normalization not fitted; call fit() first")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (info.Length() < 1 || !info[0].IsArray()) {
    Napi::TypeError::New(env, "Expected array of arrays")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Array rows = info[0].As<Napi::Array>();
  uint32_t nRows = rows.Length();

  if (nRows == 0)
    return Napi::Array::New(env, 0);

  Napi::Array firstRow = rows.Get(0u).As<Napi::Array>();
  uint32_t nCols = firstRow.Length();

  Napi::Array result = Napi::Array::New(env, nRows);

  for (uint32_t r = 0; r < nRows; r++) {
    Napi::Array row = rows.Get(r).As<Napi::Array>();

    fluid::FluidTensor<double, 1> inVec(static_cast<fluid::index>(nCols));
    fluid::FluidTensor<double, 1> outVec(static_cast<fluid::index>(nCols));

    for (uint32_t c = 0; c < nCols; c++)
      inVec(static_cast<fluid::index>(c)) = row.Get(c).As<Napi::Number>().DoubleValue();

    fluid::RealVectorView inView  = inVec;
    fluid::RealVectorView outView = outVec;
    mNormalization.processFrame(inView, outView);

    Napi::Array outRow = Napi::Array::New(env, nCols);
    for (uint32_t c = 0; c < nCols; c++)
      outRow.Set(c, Napi::Number::New(env, outVec(static_cast<fluid::index>(c))));

    result.Set(r, outRow);
  }

  return result;
}

// transformFrame(frame: number[]): number[]
Napi::Value NormalizationBinding::TransformFrame(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!mNormalization.initialized()) {
    Napi::Error::New(env, "Normalization not fitted; call fit() first")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  fluid::FluidTensor<double, 1> inVec;
  if (!parseVector(env, info[0], inVec))
    return env.Null();

  uint32_t n = static_cast<uint32_t>(inVec.size());
  fluid::FluidTensor<double, 1> outVec(static_cast<fluid::index>(n));

  fluid::RealVectorView inView  = inVec;
  fluid::RealVectorView outView = outVec;
  mNormalization.processFrame(inView, outView);

  Napi::Array result = Napi::Array::New(env, n);
  for (uint32_t i = 0; i < n; i++)
    result.Set(i, Napi::Number::New(env, outVec(static_cast<fluid::index>(i))));

  return result;
}

// clear(): void
Napi::Value NormalizationBinding::Clear(const Napi::CallbackInfo& info) {
  mNormalization.clear();
  return info.Env().Undefined();
}

Napi::Object InitNormalization(Napi::Env env, Napi::Object exports) {
  return NormalizationBinding::Init(env, exports);
}

} // namespace flucoma_native
