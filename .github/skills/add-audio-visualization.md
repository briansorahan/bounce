---
name: add-audio-visualization
description: Guide for adding audio visualizations using the multi-canvas rendering system
version: 1.0.0
created: 2026-02-15
updated: 2026-02-16
tags: [electron, visualization, canvas, audio, renderer]
---

# Skill: Add Audio Visualization

This skill guides you through adding new audio visualizations to the Electron app's canvas-based rendering system.

## When to Use This Skill

Use this skill when you need to:
- Add a new type of audio visualization (spectrogram, MFCC, pitch tracking, etc.)
- Create overlay visualizations on existing audio data
- Display analysis results visually
- Add interactive visual elements to the canvas

## Prerequisites

Before starting, ensure:
- You understand HTML Canvas 2D rendering API
- You have audio data or analysis results to visualize
- You understand the coordinate mapping between audio samples and canvas pixels

## Canvas Architecture

The app uses a **multi-layer canvas system**:

```html
<div id="waveform-container">
  <canvas id="waveform-canvas"></canvas>    <!-- Layer 1: Waveform -->
  <canvas id="analysis-canvas"></canvas>    <!-- Layer 2: Analysis overlay -->
</div>
```

**Current layout** (defined in `src/renderer/index.html`):
- `waveform-canvas`: 60% height - primary audio waveform
- `analysis-canvas`: 40% height - analysis overlays (slice markers, etc.)

Both canvases are positioned absolutely and share the same width.

## When to Use Which Approach

### Option 1: Add Method to Existing Visualizer

Use when your visualization:
- Overlays on existing waveform or analysis data
- Uses the same coordinate system (time-based)
- Is simple and doesn't need complex state

**Example:** Slice markers, region highlights, playback cursor

```typescript
// In src/renderer/waveform-visualizer.ts
drawSliceMarkers(slices: number[], totalSamples: number): void {
  const width = this.analysisCanvas.width;
  const height = this.analysisCanvas.height;
  const ctx = this.analysisCtx;

  ctx.clearRect(0, 0, width, height);
  
  // Draw your visualization
}
```

### Option 2: Add New Canvas Layer

Use when your visualization:
- Needs independent rendering from existing layers
- Has different aspect ratio or layout requirements
- Requires different update frequency

**Example:** Spectrogram, frequency analysis, separate timeline

Steps:
1. Add canvas to `src/renderer/index.html`
2. Update CSS positioning/sizing
3. Pass canvas ID to visualizer or create new visualizer class

### Option 3: Create New Visualizer Class

Use when your visualization:
- Is complex with significant state management
- Handles user interaction (zoom, pan, selection)
- Needs independent lifecycle from waveform

**Example:** Spectrogram viewer, MIDI piano roll, complex multi-view

## Step-by-Step Guide

### Adding an Overlay Visualization (Option 1)

#### Step 1: Add Method to WaveformVisualizer

Edit `src/renderer/waveform-visualizer.ts`:

```typescript
export class WaveformVisualizer {
  // ... existing code ...

  drawYourVisualization(data: number[], audioLength: number): void {
    const width = this.analysisCanvas.width;
    const height = this.analysisCanvas.height;
    const ctx = this.analysisCtx;

    // Clear previous visualization
    ctx.clearRect(0, 0, width, height);

    // Map data to canvas coordinates
    // Sample index → X pixel: (sampleIndex / totalSamples) * width
    // Data value → Y pixel: depends on your data range

    ctx.strokeStyle = '#your-color';
    ctx.lineWidth = 2;

    // Draw your visualization
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / data.length) * width;
      const y = /* map your data value to Y coordinate */;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Add labels/legend
    ctx.fillStyle = '#your-color';
    ctx.font = '12px monospace';
    ctx.fillText('Your Label', 10, 20);
  }
}
```

#### Step 2: Trigger from AudioContext

Edit `src/renderer/audio-context.ts` to store your analysis data:

```typescript
export class AudioContext {
  private currentAudio: AudioData | null = null;
  private currentSlices: number[] | null = null;
  private currentYourData: number[] | null = null;  // Add this

  // Add getter
  getCurrentYourData(): number[] | null {
    return this.currentYourData;
  }
}
```

#### Step 3: Update Visualization in App

Edit `src/renderer/app.ts` in `updateWaveformVisualization()`:

```typescript
private updateWaveformVisualization(): void {
  const audio = this.audioContext.getCurrentAudio();
  if (!audio) return;

  if (!this.waveformVisualizer) {
    const container = document.getElementById('waveform-container');
    if (container) {
      container.style.display = 'block';
      this.waveformVisualizer = new WaveformVisualizer('waveform-canvas', 'analysis-canvas');
    }
  }

  if (this.waveformVisualizer) {
    this.waveformVisualizer.drawWaveform(audio.audioData, audio.sampleRate);
    
    const slices = this.audioContext.getCurrentSlices();
    if (slices) {
      this.waveformVisualizer.drawSliceMarkers(slices, audio.audioData.length);
    }

    // Add your visualization
    const yourData = this.audioContext.getCurrentYourData();
    if (yourData) {
      this.waveformVisualizer.drawYourVisualization(yourData, audio.audioData.length);
    }
  }
}
```

### Adding a New Canvas Layer (Option 2)

#### Step 1: Update HTML

Edit `src/renderer/index.html`:

```html
<div id="waveform-container">
  <canvas id="waveform-canvas"></canvas>
  <canvas id="analysis-canvas"></canvas>
  <canvas id="your-canvas"></canvas>  <!-- Add this -->
</div>
```

#### Step 2: Update CSS

Add positioning for your canvas in the `<style>` section:

```css
#your-canvas {
  position: absolute;
  top: 60%;
  left: 0;
  width: 100%;
  height: 40%;
  /* Adjust positioning as needed */
}
```

#### Step 3: Initialize in Visualizer

Update `WaveformVisualizer` constructor to accept the new canvas:

```typescript
constructor(
  waveformCanvasId: string,
  analysisCanvasId: string,
  yourCanvasId: string  // Add parameter
) {
  // ... existing setup ...
  this.yourCanvas = document.getElementById(yourCanvasId) as HTMLCanvasElement;
  this.yourCtx = this.yourCanvas.getContext('2d')!;
}
```

## Common Coordinate Mappings

### Sample Index to X Pixel

```typescript
const sampleToX = (sampleIndex: number, totalSamples: number, canvasWidth: number): number => {
  return (sampleIndex / totalSamples) * canvasWidth;
};
```

### Audio Amplitude to Y Pixel

```typescript
// For waveform (amplitude -1.0 to 1.0)
const amplitudeToY = (amplitude: number, canvasHeight: number): number => {
  return ((1 + amplitude) / 2) * canvasHeight;
};
```

### Frequency to Y Pixel

```typescript
// For spectrogram (0 Hz to Nyquist frequency)
const frequencyToY = (freq: number, maxFreq: number, canvasHeight: number): number => {
  return canvasHeight - (freq / maxFreq) * canvasHeight;
};
```

### Downsampling for Display

```typescript
// When you have more samples than pixels
const step = Math.ceil(audioData.length / canvasWidth);

for (let i = 0; i < canvasWidth; i++) {
  let min = Infinity;
  let max = -Infinity;
  
  for (let j = 0; j < step; j++) {
    const index = i * step + j;
    if (index < audioData.length) {
      const value = audioData[index];
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  
  // Draw min-max range for this pixel
  drawVerticalLine(i, min, max);
}
```

## Critical Patterns

### Always Handle Canvas Resize

Canvas content is cleared when dimensions change, so you must redraw after resize:

```typescript
private setupCanvases(): void {
  const resize = () => {
    const container = this.canvas.parentElement;
    if (!container) return;

    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
    
    // CRITICAL: Redraw after resize to restore content
    // Store your visualization state so you can redraw it
    if (this.hasData()) {
      this.redraw();
    }
  };

  resize();
  window.addEventListener('resize', resize);
}
```

**Important:** Store visualization state (waveform data, slice markers, etc.) so you can redraw when the canvas is resized. See `WaveformVisualizer` for an example:

```typescript
private currentAudioData: Float32Array | null = null;
private currentSampleRate: number = 0;
private currentSlices: number[] | null = null;

// Store data when drawing
drawWaveform(audioData: Float32Array, sampleRate: number): void {
  this.currentAudioData = audioData;
  this.currentSampleRate = sampleRate;
  // ... draw logic ...
}

// Restore data on resize
private resize = () => {
  // Update dimensions...
  
  if (this.currentAudioData && this.currentSampleRate) {
    this.drawWaveform(this.currentAudioData, this.currentSampleRate);
  }
  if (this.currentSlices) {
    this.drawSliceMarkers(this.currentSlices, totalSamples);
  }
};
```

### Clear Before Drawing Overlays

```typescript
// Always clear before redrawing overlays
ctx.clearRect(0, 0, width, height);

// Then draw your content
```

### Use Consistent Color Scheme

Follow the existing theme colors from `src/renderer/app.ts`:

```typescript
const colors = {
  waveform: '#4ec9b0',    // Teal
  slices: '#f14c4c',      // Red
  text: '#666666',        // Gray
  background: '#1e1e1e',  // Dark
};
```

## Common Issues

**Canvas appears blank**
- Check that canvas width/height are set (not just CSS dimensions)
- Verify context is obtained successfully
- Check if coordinates are within canvas bounds

**Canvas clears on window resize**
- Canvas content is lost when dimensions change
- Store visualization state and redraw on resize
- See "Always Handle Canvas Resize" pattern above

**Visualization doesn't update**
- Ensure you're calling the draw method after data changes
- Check that `updateWaveformVisualization()` triggers on data updates
- Verify canvas is cleared before redrawing

**Performance issues with large datasets**
- Downsample data to match pixel count
- Use requestAnimationFrame for smooth updates
- Consider Web Workers for heavy computations

**Coordinate mapping errors**
- Verify sample count matches audio data length
- Check for off-by-one errors in loops
- Test with known data points

## Reference Examples

- `src/renderer/waveform-visualizer.ts` - `drawWaveform()`: Time-domain waveform
- `src/renderer/waveform-visualizer.ts` - `drawSliceMarkers()`: Overlay markers
- `src/renderer/index.html` - Canvas layout and CSS positioning

## Next Steps

After adding visualization:
1. Test with various audio file sizes and sample rates
2. Verify visualization updates correctly when data changes
3. Consider adding user interaction (zoom, pan, click-to-seek)
4. Add terminal command to trigger visualization (see `add-terminal-command` skill)
