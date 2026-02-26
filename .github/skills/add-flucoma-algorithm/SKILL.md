---
name: add-flucoma-algorithm
description: Guide for wrapping FluCoMa algorithms as Node.js N-API native bindings
version: 1.0.0
created: 2026-02-15
updated: 2026-02-15
tags: [native, flucoma, bindings, cpp, napi]
---

# Skill: Add FluCoMa Algorithm Binding

This skill guides you through wrapping a new FluCoMa algorithm as a Node.js native binding.

## When to Use This Skill

Use this skill when you need to:
- Add a new FluCoMa algorithm from `flucoma-core` to the Node.js bindings
- Create N-API wrappers for C++ audio processing classes
- Expose FluCoMa functionality to TypeScript/JavaScript

## Prerequisites

Before starting, ensure:
- The FluCoMa algorithm exists in `flucoma-core/include/flucoma/algorithms/public/`
- You understand the algorithm's parameters and behavior
- The algorithm uses FluCoMa's standard allocator pattern

## Step-by-Step Guide

### 1. Create the C++ Binding File

Create `native/src/{algorithm_name}.cpp` following this pattern:

```cpp
#include <napi.h>
#include "../../flucoma-core/include/flucoma/algorithms/public/YourAlgorithm.hpp"
#include "../../flucoma-core/include/flucoma/data/FluidMemory.hpp"
#include "../../flucoma-core/include/flucoma/data/TensorTypes.hpp"
#include <vector>
#include <memory>

namespace flucoma_native {

class YourAlgorithm : public Napi::ObjectWrap<YourAlgorithm> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  YourAlgorithm(const Napi::CallbackInfo& info);
  ~YourAlgorithm() = default;

private:
  static Napi::FunctionReference constructor;
  
  Napi::Value Process(const Napi::CallbackInfo& info);
  Napi::Value Reset(const Napi::CallbackInfo& info);
  
  std::unique_ptr<fluid::algorithm::YourAlgorithm> mAlgorithm;
  
  // Algorithm parameters as member variables
  int mParam1{0};
  double mParam2{1.0};
  bool mInitialized{false};
};

Napi::FunctionReference YourAlgorithm::constructor;

Napi::Object YourAlgorithm::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "YourAlgorithm", {
    InstanceMethod("process", &YourAlgorithm::Process),
    InstanceMethod("reset", &YourAlgorithm::Reset)
  });
  
  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();
  
  exports.Set("YourAlgorithm", func);
  return exports;
}

YourAlgorithm::YourAlgorithm(const Napi::CallbackInfo& info)
  : Napi::ObjectWrap<YourAlgorithm>(info) {
  
  // Parse options object
  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object options = info[0].As<Napi::Object>();
    
    if (options.Has("param1") && options.Get("param1").IsNumber()) {
      mParam1 = options.Get("param1").As<Napi::Number>().Int32Value();
    }
    if (options.Has("param2") && options.Get("param2").IsNumber()) {
      mParam2 = options.Get("param2").As<Napi::Number>().DoubleValue();
    }
  }
  
  // CRITICAL: Always use FluidDefaultAllocator()
  fluid::Allocator& allocator = fluid::FluidDefaultAllocator();
  
  // Initialize the FluCoMa algorithm with appropriate parameters
  mAlgorithm = std::make_unique<fluid::algorithm::YourAlgorithm>(
    /* constructor args */, allocator
  );
  
  // Call init() if the algorithm requires initialization
  mAlgorithm->init(/* init params */);
  mInitialized = true;
}

Napi::Value YourAlgorithm::Process(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  // Validate input
  if (info.Length() < 1 || !info[0].IsTypedArray()) {
    Napi::TypeError::New(env, "Expected Float32Array or Float64Array as first argument")
      .ThrowAsJavaScriptException();
    return env.Null();
  }
  
  if (!mInitialized) {
    Napi::Error::New(env, "Algorithm not initialized")
      .ThrowAsJavaScriptException();
    return env.Null();
  }
  
  // Convert TypedArray to std::vector<double>
  Napi::TypedArray inputArray = info[0].As<Napi::TypedArray>();
  size_t length = inputArray.ElementLength();
  
  fluid::Allocator& allocator = fluid::FluidDefaultAllocator();
  std::vector<double> audioData(length);
  
  if (inputArray.TypedArrayType() == napi_float32_array) {
    Napi::Float32Array float32Array = inputArray.As<Napi::Float32Array>();
    for (size_t i = 0; i < length; i++) {
      audioData[i] = static_cast<double>(float32Array[i]);
    }
  } else if (inputArray.TypedArrayType() == napi_float64_array) {
    Napi::Float64Array float64Array = inputArray.As<Napi::Float64Array>();
    for (size_t i = 0; i < length; i++) {
      audioData[i] = float64Array[i];
    }
  } else {
    Napi::TypeError::New(env, "Expected Float32Array or Float64Array")
      .ThrowAsJavaScriptException();
    return env.Null();
  }
  
  // Process audio using the FluCoMa algorithm
  // This part varies by algorithm - refer to flucoma-core documentation
  
  // Example: Return array of results
  Napi::Array results = Napi::Array::New(env, /* result count */);
  
  // Populate results array
  
  return results;
}

Napi::Value YourAlgorithm::Reset(const Napi::CallbackInfo& info) {
  if (mAlgorithm) {
    mAlgorithm->init(/* init params */);
  }
  return info.Env().Undefined();
}

// Export function called from addon.cpp
Napi::Object InitYourAlgorithm(Napi::Env env, Napi::Object exports) {
  return YourAlgorithm::Init(env, exports);
}

}
```

### 2. Register in addon.cpp

Add your algorithm to `native/src/addon.cpp`:

```cpp
#include <napi.h>

namespace flucoma_native {

Napi::Object InitOnsetFeature(Napi::Env env, Napi::Object exports);
Napi::Object InitOnsetSlice(Napi::Env env, Napi::Object exports);
Napi::Object InitYourAlgorithm(Napi::Env env, Napi::Object exports);  // Add this

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  InitOnsetFeature(env, exports);
  InitOnsetSlice(env, exports);
  InitYourAlgorithm(env, exports);  // Add this
  return exports;
}

NODE_API_MODULE(flucoma_native, Init)

}
```

### 3. Update binding.gyp

Add the new source file to `binding.gyp`:

```json
{
  "targets": [
    {
      "target_name": "flucoma_native",
      "sources": [
        "native/src/addon.cpp",
        "native/src/onset_feature.cpp",
        "native/src/onset_slice.cpp",
        "native/src/your_algorithm.cpp"  // Add this
      ],
      // ... rest of config
    }
  ]
}
```

### 4. Add TypeScript Definitions

Update `src/native.d.ts` with type definitions:

```typescript
export interface YourAlgorithmOptions {
  /**
   * Description of param1
   * Default: 0
   */
  param1?: number;
  
  /**
   * Description of param2
   * Default: 1.0
   */
  param2?: number;
}

export class YourAlgorithm {
  /**
   * Create a new YourAlgorithm analyzer
   * @param options - Configuration options
   */
  constructor(options?: YourAlgorithmOptions);
  
  /**
   * Process audio buffer
   * @param audioBuffer - Float32Array or Float64Array containing audio samples
   * @returns Processing results
   */
  process(audioBuffer: Float32Array | Float64Array): number[];
  
  /**
   * Reset the internal state
   */
  reset(): void;
}
```

### 5. Create TypeScript Wrapper

Update `src/index.ts` to export the wrapper:

```typescript
import { YourAlgorithm as NativeYourAlgorithm } from './native';

export type { YourAlgorithmOptions } from './native';

export class YourAlgorithm {
  private _native: NativeYourAlgorithm;

  constructor(options?: {
    param1?: number;
    param2?: number;
  }) {
    this._native = new addon.YourAlgorithm(options || {});
  }

  process(audioBuffer: Float32Array | Float64Array): number[] {
    return this._native.process(audioBuffer);
  }

  reset(): void {
    this._native.reset();
  }
}
```

### 6. Build and Test

```bash
# Clean and rebuild
npm run clean
npm run build

# Test the binding
npm test
```

## Critical Patterns

### Memory Management
ALWAYS use `fluid::FluidDefaultAllocator()` for FluCoMa objects:

```cpp
fluid::Allocator& allocator = fluid::FluidDefaultAllocator();
mAlgorithm = std::make_unique<fluid::algorithm::YourAlgorithm>(allocator);
```

### TypedArray Handling
Support both Float32Array and Float64Array:

```cpp
if (inputArray.TypedArrayType() == napi_float32_array) {
  Napi::Float32Array float32Array = inputArray.As<Napi::Float32Array>();
  // process...
} else if (inputArray.TypedArrayType() == napi_float64_array) {
  Napi::Float64Array float64Array = inputArray.As<Napi::Float64Array>();
  // process...
}
```

### Error Handling
Always validate inputs and check initialization:

```cpp
if (!mInitialized) {
  Napi::Error::New(env, "Algorithm not initialized")
    .ThrowAsJavaScriptException();
  return env.Null();
}
```

## Common Issues

**Linker errors about missing symbols**
- Ensure the FluCoMa algorithm header is included correctly
- Check that all required sources are in binding.gyp

**Crashes on construction**
- Verify you're using FluidDefaultAllocator()
- Check that third-party dependencies are built (`npm run build:deps`)

**TypeScript type errors**
- Ensure native.d.ts matches the C++ interface exactly
- Rebuild TypeScript after native changes: `npm run build:ts`

## Reference Examples

- `native/src/onset_feature.cpp` - Simple frame-by-frame analysis
- `native/src/onset_slice.cpp` - Analysis with slice detection

## Next Steps

After adding the binding:
1. Write tests in `src/test.ts`
2. Add HTTP endpoint in `src/server.ts` for testing via curl/HTTP
3. Update Electron IPC handlers if needed for desktop app
