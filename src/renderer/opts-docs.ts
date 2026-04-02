/**
 * Documentation source for REPL options types.
 *
 * Parsed by scripts/generate-help.ts to build an opts type registry
 * that enriches CommandHelp and TypeMethodHelp entries with property docs.
 *
 * Conventions:
 *   @opts TypeName        — Name of the options interface
 *   summary line          — One-line description (first line after @opts tag)
 *   @usedby method1,...   — Comma-separated method names that accept this type
 *                           (used to link opts → porcelain method params)
 *   @prop {type} name     — Property with type, name, and description
 */

/**
 * @opts AnalyzeOptions
 * Options for onset-based (amplitude-envelope) slice analysis.
 * @usedby onsetSlice
 * @prop {number} threshold Onset detection threshold 0–1 (default: 0.5)
 * @prop {number} minSliceLength Minimum slice duration in frames (default: 2)
 * @prop {number} filterSize Smoothing filter size in frames (default: 1)
 * @prop {number} frameDelta Minimum inter-onset delta in frames (default: 0)
 * @prop {number} metric Analysis metric: 0=energy, 1=HFC, 2=spectral (default: 0)
 */
export type _AnalyzeOptions = Record<string, never>;

/**
 * @opts NmfOptions
 * Options for NMF (Non-negative Matrix Factorization) decomposition.
 * @usedby nmf
 * @prop {number} components Number of NMF components to extract (default: 2)
 * @prop {number} iterations Maximum number of optimization iterations (default: 100)
 * @prop {number} fftSize FFT size in samples (default: 1024)
 * @prop {number} hopSize Analysis hop size in samples (default: 512)
 * @prop {number} windowSize Analysis window size in samples (default: 1024)
 * @prop {number} seed Random seed for reproducibility (default: 0)
 */
export type _NmfOptions = Record<string, never>;

/**
 * @opts SliceOptions
 * Options for re-slicing an existing SliceFeature.
 * @usedby slice
 * @prop {string} featureHash Hash of the SliceFeature to re-use; defaults to most recent
 */
export type _SliceOptions = Record<string, never>;

/**
 * @opts SepOptions
 * Options for NMF source separation.
 * @usedby sep
 * @prop {number} components Number of NMF components to separate (default: 2)
 * @prop {number} iterations Maximum number of optimization iterations (default: 100)
 */
export type _SepOptions = Record<string, never>;

/**
 * @opts MFCCOptions
 * Options for MFCC (Mel-Frequency Cepstral Coefficients) analysis.
 * @usedby mfcc
 * @prop {number} numCoeffs Number of MFCC coefficients per frame (default: 13)
 * @prop {number} numBands Number of mel bands (default: 40)
 * @prop {number} minFreq Minimum frequency in Hz (default: 20)
 * @prop {number} maxFreq Maximum frequency in Hz (default: 20000)
 * @prop {number} windowSize Analysis window size in samples (default: 1024)
 * @prop {number} fftSize FFT size in samples (default: 1024)
 * @prop {number} hopSize Analysis hop size in samples (default: 512)
 * @prop {number} sampleRate Override sample rate in Hz (default: from file)
 */
export type _MFCCOptions = Record<string, never>;

/**
 * @opts GranularizeOptions
 * Options for grain decomposition.
 * @usedby granularize
 * @prop {number} grainSize Grain duration in seconds (default: 0.1)
 * @prop {number} hopSize Hop between grain onsets in seconds (default: 0.05)
 * @prop {number} jitter Random timing jitter 0–1 (default: 0)
 * @prop {number} startTime Start offset into the source in seconds (default: 0)
 * @prop {number} endTime End offset into the source in seconds (default: full duration)
 * @prop {boolean} normalize Normalize each grain amplitude (default: false)
 * @prop {number} silenceThreshold Skip grains below this RMS level 0–1 (default: 0)
 */
export type _GranularizeOptions = Record<string, never>;

/**
 * @opts AmpSliceOptions
 * Options for amplitude-envelope-based slice analysis.
 * @usedby ampSlice
 * @prop {number} fastRampUp Fast attack time in ms (default: 10)
 * @prop {number} fastRampDown Fast release time in ms (default: 10)
 * @prop {number} slowRampUp Slow attack time in ms (default: 100)
 * @prop {number} slowRampDown Slow release time in ms (default: 100)
 * @prop {number} onThreshold Level above which a slice onset is detected 0–1 (default: 0.9)
 * @prop {number} offThreshold Level below which a slice end is detected 0–1 (default: 0.1)
 * @prop {number} floor Noise floor threshold 0–1 (default: 0.001)
 * @prop {number} minSliceLength Minimum slice duration in samples (default: 2)
 * @prop {number} highPassFreq High-pass filter frequency before analysis in Hz (default: 85)
 */
export type _AmpSliceOptions = Record<string, never>;

/**
 * @opts NoveltySliceOptions
 * Options for novelty-function-based slice analysis.
 * @usedby noveltySlice
 * @prop {number} kernelSize Novelty kernel size in frames (default: 3)
 * @prop {number} threshold Novelty detection threshold (default: 0.5)
 * @prop {number} filterSize Smoothing filter size in frames (default: 1)
 * @prop {number} minSliceLength Minimum slice duration in frames (default: 2)
 * @prop {number} windowSize Analysis window size in samples (default: 1024)
 * @prop {number} fftSize FFT size in samples (default: 1024)
 * @prop {number} hopSize Analysis hop size in samples (default: 512)
 */
export type _NoveltySliceOptions = Record<string, never>;

/**
 * @opts TransientSliceOptions
 * Options for transient-based slice analysis.
 * @usedby transientSlice
 * @prop {number} order AR model order for transient prediction (default: 20)
 * @prop {number} blockSize Block size for AR model analysis in samples (default: 256)
 * @prop {number} padSize Padding added around blocks in samples (default: 128)
 * @prop {number} skew Tilt of the analysis window 0–1 (default: 0)
 * @prop {number} threshFwd Forward detection threshold (default: 3)
 * @prop {number} threshBack Backward detection threshold (default: 1.5)
 * @prop {number} windowSize Analysis window size in samples (default: 14)
 * @prop {number} clumpLength Clump adjacent transients within this many samples (default: 25)
 * @prop {number} minSliceLength Minimum slice duration in samples (default: 1000)
 */
export type _TransientSliceOptions = Record<string, never>;

/**
 * @opts ToSamplerOptions
 * Options for loading slices into a sampler instrument.
 * @usedby toSampler
 * @prop {string} name Instrument name (required)
 * @prop {number} startNote MIDI note number for the first slice (default: 60)
 * @prop {number} polyphony Maximum simultaneous voices (default: 8)
 */
export type _ToSamplerOptions = Record<string, never>;

/**
 * @opts MidiRecordOptions
 * Options for MIDI recording.
 * @usedby record
 * @prop {number} duration Stop recording automatically after this many seconds
 * @prop {string} name Name to save the recorded sequence under (auto-generated if omitted)
 */
export type _MidiRecordOptions = Record<string, never>;

/**
 * @opts RecordOptions
 * Options for audio recording via an input device.
 * @usedby record
 * @prop {number} duration Stop recording automatically after this many seconds
 * @prop {boolean} overwrite Replace an existing sample with the same name (default: false)
 */
export type _RecordOptions = Record<string, never>;
