#include <napi.h>

namespace flucoma_native {

Napi::Object InitOnsetFeature(Napi::Env env, Napi::Object exports);
Napi::Object InitOnsetSlice(Napi::Env env, Napi::Object exports);

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  InitOnsetFeature(env, exports);
  InitOnsetSlice(env, exports);
  return exports;
}

NODE_API_MODULE(flucoma_native, Init)

}
