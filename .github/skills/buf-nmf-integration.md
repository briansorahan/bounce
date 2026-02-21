# BufNMF (Non-negative Matrix Factorization) Integration

## Overview
The BufNMF integration provides Non-negative Matrix Factorization (NMF) decomposition for audio files in Bounce. NMF decomposes an audio signal into a set of basis spectra and their activations over time, useful for source separation, feature extraction, and analysis.

## Command Usage

### Basic Analysis
```bash
analyze nmf "/path/to/audio.wav"
```

### Advanced Options
```bash
analyze nmf "/path/to/audio.wav" --components 5 --iterations 200
analyze nmf "/path/to/audio.wav" --fft-size 2048 --hop-size 512
analyze nmf "/path/to/audio.wav" --components 10 --iterations 150 --seed 42
```

### Available Options
- `--components <n>`: Number of NMF components (default: 1)
- `--iterations <n>`: Number of iterations for convergence (default: 100)
- `--fft-size <n>`: FFT size for spectral analysis (default: 1024)
- `--hop-size <n>`: Hop size between frames (default: -1, auto-calculated)
- `--window-size <n>`: Window size (default: -1, auto-calculated)
- `--seed <n>`: Random seed for reproducibility (default: -1, random)

## Output
The command returns:
- Number of components used
- Number of iterations performed
- Convergence status
- Sample hash (first 8 characters)
- Feature hash (first 8 characters)

Example output:
```
NMF decomposition complete
Components: 5
Iterations: 200
Converged: Yes
Feature ID: 1
Feature Hash: a3b7c9d2
```

## Database Storage
NMF results are stored in the `features` table with:
- **sample_hash**: Links to the audio sample
- **feature_type**: 'nmf'
- **feature_hash**: Hash of the NMF result for deduplication
- **feature_data**: JSON containing:
  - `type`: 'nmf'
  - `components`: Number of components
  - `iterations`: Iterations performed
  - `converged`: Whether algorithm converged
  - `bases`: Basis spectral matrices
  - `activations`: Activation matrices over time
  - `options`: Original analysis options

## Feature Deduplication
Running the same analysis with identical options on the same audio will return the existing feature without recomputing, identified by the feature_hash.

## Workflow Integration
1. Load audio: `play "/path/to/audio.wav"` or `display "/path/to/audio.wav"`
2. Analyze: `analyze nmf "/path/to/audio.wav" --components 5`
3. List features: `list features`
4. Future: Use NMF results for source separation or component playback

## Implementation Details

### Native Binding
The BufNMF algorithm is implemented in C++ using the FluCoMa library and exposed via N-API:
- File: `/native/src/buf_nmf.cpp`
- Class: `flucoma_native::BufNMF`

### TypeScript Wrapper
- File: `/src/electron/BufNMF.ts`
- Provides type-safe interface to the native binding

### IPC Handler
- Location: `/src/electron/main.ts`
- Handler: `ipcMain.handle('analyze-buf-nmf', ...)`
- Invoked via: `window.electron.analyzeBufNMF(audioData, sampleRate, options)`

### Database Schema
The `features` table stores NMF results with the primary key `(sample_hash, feature_hash)` for automatic deduplication.

## Future Enhancements
1. **Component Playback**: Reconstruct and play individual NMF components
2. **Source Separation**: Extract separated sources from components
3. **Parameter Optimization**: Suggest optimal component count
4. **Real-time Processing**: Streaming NMF analysis

## Visualization

The NMF analysis automatically creates an interactive visualization showing:

### Spectral Bases (Top Section)
- Each component's spectral template displayed as a bar graph
- Color-coded by component (using golden angle hue distribution)
- Normalized to show relative magnitudes
- Labeled with component number (C1, C2, etc.)

### Temporal Activations (Bottom Section)
- Each component's activation over time displayed as a line graph
- Filled area under the curve for clarity
- Same color coding as corresponding basis
- Shows when each spectral component is active in the signal

The visualization is added to the scrollable visualization area below the waveform and automatically resizes with the window.

### Implementation
- File: `/src/renderer/nmf-visualizer.ts`
- Class: `NMFVisualizer`
- Canvas-based rendering with automatic resize handling
- Integrated with `VisualizationManager` for multi-panel display

## Testing
To test the implementation:
```bash
# Build the project
npm run build

# Run the app
npm start

# In the app:
play "/path/to/test/audio.wav"
analyze nmf "/path/to/test/audio.wav" --components 5 --iterations 100
list features
```

## Related Commands
- `analyze onset-slice`: Analyze onset positions
- `list features`: List all stored features
- `list samples`: List all audio samples in database
- `help analyze`: Show help for analyze command
