#include <napi.h>

namespace flucoma_native {

Napi::Object InitOnsetFeature(Napi::Env env, Napi::Object exports);
Napi::Object InitOnsetSlice(Napi::Env env, Napi::Object exports);
Napi::Object InitBufNMF(Napi::Env env, Napi::Object exports);
Napi::Object InitBufNMFCross(Napi::Env env, Napi::Object exports);
Napi::Object InitMFCCFeature(Napi::Env env, Napi::Object exports);
Napi::Object InitSpectralShapeFeature(Napi::Env env, Napi::Object exports);
Napi::Object InitNormalization(Napi::Env env, Napi::Object exports);
Napi::Object InitKDTree(Napi::Env env, Napi::Object exports);

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  InitOnsetFeature(env, exports);
  InitOnsetSlice(env, exports);
  InitBufNMF(env, exports);
  InitBufNMFCross(env, exports);
  InitMFCCFeature(env, exports);
  InitSpectralShapeFeature(env, exports);
  InitNormalization(env, exports);
  InitKDTree(env, exports);
  return exports;
}

NODE_API_MODULE(flucoma_native, Init)

}
