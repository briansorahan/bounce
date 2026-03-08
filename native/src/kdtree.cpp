#include <napi.h>
#include "../../flucoma-core/include/flucoma/algorithms/public/KDTree.hpp"
#include "../../flucoma-core/include/flucoma/data/FluidDataSet.hpp"
#include "../../flucoma-core/include/flucoma/data/FluidMemory.hpp"
#include "../../flucoma-core/include/flucoma/data/TensorTypes.hpp"
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace flucoma_native {

class KDTreeBinding : public Napi::ObjectWrap<KDTreeBinding> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  KDTreeBinding(const Napi::CallbackInfo& info);
  ~KDTreeBinding() = default;

private:
  static Napi::FunctionReference constructor;

  Napi::Value AddPoint(const Napi::CallbackInfo& info);
  Napi::Value KNearest(const Napi::CallbackInfo& info);
  Napi::Value Size(const Napi::CallbackInfo& info);
  Napi::Value Clear(const Napi::CallbackInfo& info);

  void rebuildTree();

  // Backing store: list of (id, feature_vector) pairs
  std::vector<std::pair<std::string, std::vector<double>>> mPoints;
  std::unique_ptr<fluid::algorithm::KDTree> mTree;
  fluid::index mDims{0};
  bool mDirty{true};
};

Napi::FunctionReference KDTreeBinding::constructor;

Napi::Object KDTreeBinding::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "KDTree", {
    InstanceMethod("addPoint",  &KDTreeBinding::AddPoint),
    InstanceMethod("kNearest",  &KDTreeBinding::KNearest),
    InstanceMethod("size",      &KDTreeBinding::Size),
    InstanceMethod("clear",     &KDTreeBinding::Clear)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("KDTree", func);
  return exports;
}

KDTreeBinding::KDTreeBinding(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<KDTreeBinding>(info) {}

void KDTreeBinding::rebuildTree() {
  if (mPoints.empty()) {
    mTree = nullptr;
    mDirty = false;
    return;
  }

  // Build a FluidDataSet from mPoints then construct the KDTree from it.
  // This uses the KDTree(dataset) constructor which correctly sets mDims
  // and builds a balanced tree — the default constructor + addNode path
  // does not initialise mDims and is therefore unsafe.
  fluid::FluidDataSet<std::string, double, 1> dataset(mDims);

  for (auto& [id, vec] : mPoints) {
    fluid::FluidTensor<double, 1> pt(mDims);
    for (fluid::index i = 0; i < mDims; i++)
      pt(i) = vec[static_cast<size_t>(i)];
    fluid::RealVectorView ptView = pt;
    dataset.add(id, ptView);
  }

  mTree = std::make_unique<fluid::algorithm::KDTree>(dataset);
  mDirty = false;
}

// addPoint(id: string, point: number[]): void
Napi::Value KDTreeBinding::AddPoint(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsArray()) {
    Napi::TypeError::New(env, "Expected (id: string, point: number[])")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string id = info[0].As<Napi::String>().Utf8Value();
  Napi::Array arr = info[1].As<Napi::Array>();
  uint32_t n = arr.Length();

  if (n == 0) {
    Napi::Error::New(env, "Point must not be empty")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // All points must have the same dimension
  if (mPoints.empty()) {
    mDims = static_cast<fluid::index>(n);
  } else if (static_cast<fluid::index>(n) != mDims) {
    Napi::Error::New(env, "Point dimension does not match existing points")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::vector<double> vec(n);
  for (uint32_t i = 0; i < n; i++)
    vec[i] = arr.Get(i).As<Napi::Number>().DoubleValue();

  mPoints.emplace_back(std::move(id), std::move(vec));
  mDirty = true;

  return env.Undefined();
}

// kNearest(point: number[], k: number, radius?: number): Array<{id: string, distance: number}>
Napi::Value KDTreeBinding::KNearest(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsArray() || !info[1].IsNumber()) {
    Napi::TypeError::New(env, "Expected (point: number[], k: number, radius?: number)")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (mPoints.empty()) {
    return Napi::Array::New(env, 0);
  }

  if (mDirty)
    rebuildTree();

  if (!mTree) {
    return Napi::Array::New(env, 0);
  }

  Napi::Array arr = info[0].As<Napi::Array>();
  uint32_t n = arr.Length();

  if (static_cast<fluid::index>(n) != mDims) {
    Napi::Error::New(env, "Query point dimension does not match tree dimension")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  fluid::FluidTensor<double, 1> queryVec(mDims);
  for (uint32_t i = 0; i < n; i++)
    queryVec(static_cast<fluid::index>(i)) = arr.Get(i).As<Napi::Number>().DoubleValue();

  fluid::index k = static_cast<fluid::index>(info[1].As<Napi::Number>().Int32Value());
  double radius = (info.Length() > 2 && info[2].IsNumber())
                      ? info[2].As<Napi::Number>().DoubleValue()
                      : 0.0;

  fluid::RealVectorView queryView = queryVec;
  auto knnResult = mTree->kNearest(queryView, k, radius);

  auto& distances = knnResult.first;
  auto& ids       = knnResult.second;

  uint32_t numResults = static_cast<uint32_t>(distances.size());
  Napi::Array result  = Napi::Array::New(env, numResults);

  for (uint32_t i = 0; i < numResults; i++) {
    Napi::Object entry = Napi::Object::New(env);
    entry.Set("id",       Napi::String::New(env, *ids[i]));
    entry.Set("distance", Napi::Number::New(env, distances[i]));
    result.Set(i, entry);
  }

  return result;
}

// size(): number
Napi::Value KDTreeBinding::Size(const Napi::CallbackInfo& info) {
  return Napi::Number::New(info.Env(), static_cast<double>(mPoints.size()));
}

// clear(): void
Napi::Value KDTreeBinding::Clear(const Napi::CallbackInfo& info) {
  mPoints.clear();
  mTree = nullptr;
  mDims = 0;
  mDirty = true;
  return info.Env().Undefined();
}

Napi::Object InitKDTree(Napi::Env env, Napi::Object exports) {
  return KDTreeBinding::Init(env, exports);
}

} // namespace flucoma_native
