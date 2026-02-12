# Bounce Terminal UI

Terminal emulator-based interface for interactive audio analysis with FluCoMa.

## Features

- **TypeScript REPL**: Execute TypeScript commands directly in the terminal
- **Split-pane Layout**: Terminal on top, visualizations below
- **Waveform Visualization**: Real-time audio waveform rendering
- **Onset Slice Analysis**: Detect and visualize onset slice points
- **Interactive Workflow**: Chain commands to build analysis pipelines

## Usage

### Starting the Application

```bash
npm run dev:electron
```

### Basic Workflow

#### 1. Load an Audio File

```typescript
const audio = await loadAudio('/path/to/file.wav')
```

If you provide a relative path or just press Enter without a path, a file picker dialog will open.

#### 2. Visualize the Waveform

```typescript
audio.visualize()
```

This splits the UI horizontally and displays the audio waveform in the lower pane.

#### 3. Analyze Onset Slices

```typescript
const slices = await audio.analyzeOnsetSlice()
```

With custom options:

```typescript
const slices = await audio.analyzeOnsetSlice({
  function: 2,        // Spectral Flux
  threshold: 0.5,     // Detection threshold
  minSliceLength: 2,  // Minimum frames between slices
  filterSize: 5,      // Median filter size
  windowSize: 1024,   // Analysis window
  fftSize: 1024,      // FFT size
  hopSize: 512        // Hop between frames
})
```

#### 4. Visualize Slice Markers

```typescript
slices.visualize()
```

This displays vertical red lines at each detected onset point.

### Complete Example

```typescript
const audio = await loadAudio('./flucoma-core/Resources/AudioFiles/Tremblay-SlideChoirAdd-M.wav')
audio.visualize()
const slices = await audio.analyzeOnsetSlice({ function: 2, threshold: 0.5 })
slices.visualize()
```

### Spectral Change Functions

```typescript
0  // Energy
1  // High Frequency Content
2  // Spectral Flux (recommended)
3  // Modified Kullback-Leibler
4  // Itakura-Saito
5  // Cosine
6  // Phase Deviation
7  // Weighted Phase Deviation
8  // Complex Domain
9  // Rectified Complex Domain
```

## Terminal Features

- **Command History**: Use ↑/↓ arrow keys to navigate through previous commands
- **Auto-complete**: Tab completion for common commands (coming soon)
- **Multi-line Support**: Edit commands across multiple lines
- **Color-coded Output**: Errors in red, success messages in green

## Architecture

### Components

1. **BounceApp** (`src/renderer/app.ts`): Main application controller
2. **AudioContext** (`src/renderer/audio-context.ts`): TypeScript evaluation and audio state management
3. **WaveformVisualizer** (`src/renderer/waveform-visualizer.ts`): Canvas-based visualization
4. **Main Process** (`src/electron/main.ts`): IPC handlers for file I/O and analysis
5. **Preload Script** (`src/electron/preload.ts`): Secure bridge between renderer and main

### Data Flow

```
Terminal Input → AudioContext.evaluate()
                      ↓
              IPC: read-audio-file
                      ↓
              Main Process: fs.readFileSync + WavDecoder
                      ↓
              Return: { channelData, sampleRate, duration }
                      ↓
              audio.visualize() → WaveformVisualizer.drawWaveform()
                      ↓
              IPC: analyze-onset-slice
                      ↓
              Main Process: OnsetSlice.process()
                      ↓
              Return: slice indices
                      ↓
              slices.visualize() → WaveformVisualizer.drawSliceMarkers()
```

## Development

### File Structure

```
src/
├── electron/
│   ├── main.ts          # Main process with IPC handlers
│   ├── preload.ts       # Context bridge
│   └── types.d.ts       # TypeScript definitions
└── renderer/
    ├── index.html       # UI layout
    ├── main.ts          # Entry point
    ├── app.ts           # Terminal app controller
    ├── audio-context.ts # Audio state and evaluation
    └── waveform-visualizer.ts  # Canvas rendering
```

### Building

```bash
npm run build:electron  # Compile TypeScript and copy assets
npm run start:electron  # Build and run in production mode
npm run dev:electron    # Build and run with DevTools
```

## Troubleshooting

### Terminal Not Responding

- Check browser console for errors (F12 or Cmd+Option+I)
- Verify xterm.css is loaded correctly
- Ensure preload script is being executed

### Audio File Not Loading

- Verify file path is correct (absolute paths work best)
- Check file is valid WAV format
- Look for errors in terminal output (shown in red)

### Visualization Not Showing

- Make sure you called `audio.visualize()` before analysis
- Check canvas elements are present in DOM
- Verify waveform-container display is set to 'block'

### Analysis Errors

- Ensure audio file is loaded first
- Check analysis options are valid (see OnsetSlice documentation)
- Verify native addon is built: `npm run build:native`
