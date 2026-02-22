# Bounce

Audio editor built with Electron and FluCoMa.

## Getting Started

```bash
# Clone with submodules
git clone --recursive https://github.com/briansorahan/bounce.git
cd bounce

# Build C++ dependencies first
npm run build:deps

# Install dependencies and build native addon
npm install

# Rebuild native modules for Electron
npm run rebuild

# Build TypeScript and Electron
npm run build:electron

# Run the Electron app
npm run dev:electron
```

## Testing

```bash
# Run unit tests
npm test

# Run Playwright e2e tests
npm run test:e2e

# Run full GitHub workflow locally (all tests)
npm run test:workflow
```

## Prerequisites

- Node.js v24+
- npm v11+
- C++ compiler with C++17 support
- Python 3.x (required by node-gyp)
- CMake 3.10+
- **macOS**: Xcode Command Line Tools
- **Linux**: build-essential, BLAS, LAPACK libraries
