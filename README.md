# Bounce - FluCoMa Node.js Bindings

Node.js native bindings for the FluCoMa audio analysis library, enabling server-side audio processing with TypeScript/JavaScript.

## Overview

This project provides Node.js bindings to the FluCoMa (Fluid Corpus Manipulation) C++ library, allowing you to use advanced audio analysis algorithms in Node.js applications. Currently implements OnsetFeature for extracting onset detection features and OnsetSlice for detecting onset slice points in audio signals.

### Features

- Native C++ bindings using N-API for high performance
- TypeScript support with full type definitions
- Support for Float32Array and Float64Array audio buffers
- Configurable analysis parameters (FFT size, window size, detection function, etc.)
- Multiple spectral change metrics for onset detection
- OnsetFeature: Extract frame-by-frame onset strength values
- OnsetSlice: Detect slice points based on onset detection with configurable threshold

## Installation

### Prerequisites

- Node.js v24+ 
- npm v11+
- C++ compiler with C++17 support (Clang on macOS, GCC on Linux)
- Python 3.x (required by node-gyp)
- CMake 3.10+
- **macOS**: Xcode Command Line Tools
- **Linux**: build-essential, BLAS, LAPACK libraries

### Clone and Build

```bash
# Clone with submodules
git clone --recursive https://github.com/briansorahan/bounce.git
cd bounce

# Build dependencies
./build-deps.sh

# Install Node.js dependencies
npm install

# Build native addon and TypeScript
npm run build

# Run tests
npm test
```

## Usage

### OnsetFeature - Extract Onset Detection Features

```typescript
import { OnsetFeature } from 'bounce';

// Create analyzer with configuration
const analyzer = new OnsetFeature({
  function: 2,        // Spectral Flux
  filterSize: 5,      // Median filter size
  windowSize: 1024,   // Analysis window
  fftSize: 1024,      // FFT size
  hopSize: 512        // Hop between frames
});

// Process audio buffer
const audioBuffer = new Float32Array(44100); // 1 second at 44.1kHz
// ... load audio data ...

const onsetFeatures = analyzer.process(audioBuffer);
console.log(`Extracted ${onsetFeatures.length} frames`);
```

### OnsetSlice - Detect Onset Slice Points

```typescript
import { OnsetSlice } from 'bounce';

// Create slicer with configuration
const slicer = new OnsetSlice({
  function: 2,          // Spectral Flux
  threshold: 0.5,       // Onset detection threshold
  minSliceLength: 2,    // Minimum frames between slices
  filterSize: 5,        // Median filter size
  windowSize: 1024,     // Analysis window
  fftSize: 1024,        // FFT size
  hopSize: 512          // Hop between frames
});

// Process audio buffer and get slice indices
const audioBuffer = new Float32Array(44100); // 1 second at 44.1kHz
// ... load audio data ...

const sliceIndices = slicer.process(audioBuffer);
console.log('Onset slice points (in samples):', sliceIndices);

// Use slice indices to split audio
for (let i = 0; i < sliceIndices.length - 1; i++) {
  const start = sliceIndices[i];
  const end = sliceIndices[i + 1];
  const segment = audioBuffer.slice(start, end);
  // Process segment...
}
```

### Spectral Change Metrics

```typescript
function: 0  // Energy
function: 1  // High Frequency Content
function: 2  // Spectral Flux
function: 3  // Modified Kullback-Leibler
function: 4  // Itakura-Saito
function: 5  // Cosine
function: 6  // Phase Deviation
function: 7  // Weighted Phase Deviation
function: 8  // Complex Domain
function: 9  // Rectified Complex Domain
```

## Running Locally

### Desktop App (Electron)

```bash
# Run the desktop audio editor
npm run dev:electron
```

The terminal UI allows you to interactively load audio files, visualize waveforms, and analyze onset slices using TypeScript commands. See [TERMINAL_UI.md](./TERMINAL_UI.md) for detailed usage instructions.

**Quick Start:**

```typescript
// In the terminal UI, run:
const audio = await loadAudio('./flucoma-core/Resources/AudioFiles/Tremblay-SlideChoirAdd-M.wav')
audio.visualize()
const slices = await audio.analyzeOnsetSlice({ function: 2, threshold: 0.5 })
slices.visualize()
```

### API Server

```bash
# Start API server on port 8000
npm start

# Development mode with auto-reload
npm run dev

# Run tests
npm test
```

### API Server

The server runs on `http://localhost:8000` and provides the following endpoints:

**API Documentation**
```bash
GET /docs  # Interactive API documentation (Redoc)
GET /openapi.json  # OpenAPI specification
```

**Health Check**
```bash
GET /health
```

**Onset Analysis**
```bash
PUT /analyze/onset
Content-Type: audio/wav

Query parameters (all optional):
- function: Spectral change metric (0-9, default: 0)
- filterSize: Median filter size (default: 5)
- frameDelta: Frame delta parameter
- windowSize: Analysis window size in samples (default: 1024)
- fftSize: FFT size in samples (default: 1024)
- hopSize: Hop size between frames in samples (default: 512)
```

Returns an array of spectral difference values, one per analysis frame. Each value represents
the amount of spectral change between consecutive frames at that point in time. Higher values
indicate more change (potential onset), lower values indicate less change. The values are 
median-filtered to reduce noise.

The number of frames returned is: `(audioLength - windowSize) / hopSize + 1`

Example using curl:
```bash
curl -X PUT http://localhost:8000/analyze/onset?function=2 \
  -H "Content-Type: audio/wav" \
  --data-binary @audio.wav
```

## Developer Guide

### Project Structure

```
bounce/
├── binding.gyp              # node-gyp build configuration
├── flucoma-core/            # FluCoMa C++ library (submodule)
├── native/
│   └── src/
│       ├── addon.cpp        # N-API entry point
│       └── onset_feature.cpp # OnsetFeature binding
├── src/
│   ├── index.ts             # TypeScript wrapper
│   ├── native.d.ts          # Type definitions
│   └── test.ts              # Tests
└── package.json
```

### Build System

The project uses:
- **node-gyp**: Builds the native C++ addon
- **TypeScript**: Compiles TypeScript to JavaScript
- **Git submodules**: Manages external dependencies

Build commands:
```bash
npm run build:native  # Build C++ addon only
npm run build:ts      # Build TypeScript only
npm run build         # Build both
npm run clean         # Remove build artifacts
```

### Dependencies

**Runtime C++ Dependencies** (managed as git submodules):
- flucoma-core: Audio analysis algorithms
- Eigen 3.4.0: Linear algebra (header-only)
- HISSTools: FFT implementation (uses Apple Accelerate on macOS)
- foonathan/memory: Custom allocator (requires build step)

**Build Dependencies**:
- node-addon-api: C++ wrapper for N-API
- node-gyp: Native addon build tool
- TypeScript: Type system and compiler

### Adding New Algorithms

To wrap additional FluCoMa algorithms:

1. Create a new C++ class in `native/src/`
2. Follow the OnsetFeature pattern:
   - Use `FluidDefaultAllocator()` for memory
   - Wrap with `Napi::ObjectWrap`
   - Handle TypedArray conversions
3. Add TypeScript definitions in `src/native.d.ts`
4. Export from `src/index.ts`

### Troubleshooting

**Build fails with missing FFT symbols**

Ensure Accelerate framework is linked (macOS):
```bash
ls /System/Library/Frameworks/Accelerate.framework
```

**Crash on instantiation**

Verify dependencies are built:
```bash
./build-deps.sh
```

**Submodule directories empty**

Initialize submodules:
```bash
git submodule update --init --recursive
```

## Architecture

### Native Binding Layer

Uses N-API (node-addon-api) for stable C++/JavaScript interface:
- **Memory Management**: Uses FluCoMa's default allocator (foonathan/memory)
- **Build Output**: Compiles to `.node` shared library

### Platform Support

- **macOS**: Uses Apple Accelerate framework for FFT (hardware accelerated)
- **Linux**: Uses BLAS/LAPACK libraries

## Resources

- [FluCoMa Project](https://www.flucoma.org/)
- [FluCoMa Core Repository](https://github.com/flucoma/flucoma-core)
- [Node-API Documentation](https://nodejs.org/api/n-api.html)

## License

ISC
