/**
 * Porcelain type aliases for the Bounce REPL.
 *
 * Each alias here is the user-facing name for a domain object. Plumbing
 * classes live in the individual result files and carry a `Result` suffix;
 * these aliases hide that detail by unifying the sync and async variants
 * under a single name.
 *
 * @porcelain JSDoc blocks below are parsed by scripts/generate-help.ts to
 * produce porcelain-types.generated.ts, which powers TypeName.help() in the REPL.
 */

export { SampleResult, SamplePromise, CurrentSamplePromise, GrainCollectionPromise, SampleListResult, AudioResult } from "./sample.js";
export { SliceFeatureResult, SliceFeaturePromise, NmfFeatureResult, NmfFeaturePromise, MfccFeatureResult, MfccFeaturePromise, NxFeatureResult, NxFeaturePromise } from "./features.js";
export { VisSceneResult, VisScenePromise, VisStackResult, VisSceneListResult } from "./visualization.js";
export { PatternResult } from "./pattern.js";
export { AudioDeviceResult, RecordingHandleResult } from "./recording.js";
export { MidiRecordingHandleResult, MidiSequenceResult, MidiSequencePromise } from "./midi.js";

import type { SampleResult } from "./sample.js";
import type { SamplePromise } from "./sample.js";
import type { SliceFeatureResult, SliceFeaturePromise, NmfFeatureResult, NmfFeaturePromise, MfccFeatureResult, MfccFeaturePromise, NxFeatureResult, NxFeaturePromise } from "./features.js";
import type { VisSceneResult, VisScenePromise, VisStackResult } from "./visualization.js";
import type { PatternResult } from "./pattern.js";
import type { AudioDeviceResult, RecordingHandleResult } from "./recording.js";
import type { MidiRecordingHandleResult, MidiSequenceResult, MidiSequencePromise } from "./midi.js";

// ---------------------------------------------------------------------------
// Porcelain type aliases
// ---------------------------------------------------------------------------

/**
 * @porcelain Sample
 * An audio file loaded into Bounce.
 * @prop {string} hash Unique content-derived identifier
 * @prop {string} filePath Absolute path to the source file
 * @prop {number} sampleRate Sample rate in Hz
 * @prop {number} channels Number of audio channels
 * @prop {number} duration Duration in seconds
 * @method play() Play the sample from the beginning → Sample
 * @method loop(opts?) Loop the sample, optionally with loop points → Sample
 * @method stop() Stop playback → BounceResult
 * @method display() Render the waveform visualization → Sample
 * @method onsetSlice(opts?) Onset-based slice analysis → SliceFeature
 * @method ampSlice(opts?) Amplitude-based slice analysis → SliceFeature
 * @method noveltySlice(opts?) Novelty-based slice analysis → SliceFeature
 * @method transientSlice(opts?) Transient-based slice analysis → SliceFeature
 * @method nmf(opts?) NMF decomposition → NmfFeature
 * @method mfcc(opts?) MFCC analysis → MfccFeature
 * @method nx(other, opts?) NMF cross-synthesis with another sample → NxFeature
 * @methodparam other The sample whose spectral bases to borrow
 * @method granularize(opts?) Decompose into a grain collection → GrainCollection
 */
export type Sample = SampleResult | SamplePromise;

/**
 * @porcelain SliceFeature
 * Onset, amplitude, novelty, or transient slice analysis result.
 * @prop {number[]} slices Onset/slice times in seconds
 * @prop {number} count Number of slices
 * @method playSlice(index?) Play a specific slice by index → Sample
 * @methodparam index 0-based slice index to play (default: 0)
 * @method slice(opts?) Re-run slicing with new options → BounceResult
 * @method toSampler(opts) Load slices into a sampler instrument → InstrumentResult
 */
export type SliceFeature = SliceFeatureResult | SliceFeaturePromise;

/**
 * @porcelain NmfFeature
 * NMF (Non-negative Matrix Factorization) decomposition result.
 * @prop {number} components Number of NMF components
 * @prop {number} iterations Number of iterations run
 * @prop {boolean} converged Whether the algorithm converged
 * @prop {number[][]} bases Spectral bases matrix
 * @prop {number[][]} activations Temporal activations matrix
 * @method sep(opts?) Separate audio into component files → BounceResult
 * @method playComponent(index?) Play a specific NMF component → Sample
 * @methodparam index 0-based component index to play (default: 0)
 */
export type NmfFeature = NmfFeatureResult | NmfFeaturePromise;

/**
 * @porcelain MfccFeature
 * MFCC (Mel-Frequency Cepstral Coefficients) analysis result.
 * @prop {number} numFrames Number of analysis frames
 * @prop {number} numCoeffs Number of MFCC coefficients per frame
 */
export type MfccFeature = MfccFeatureResult | MfccFeaturePromise;

/**
 * @porcelain NxFeature
 * NMF cross-synthesis result — resynthesizes one sample's content using another's spectral bases.
 * @prop {number} components Number of NMF components
 * @prop {string} sourceSampleHash Hash of the source sample used for bases
 * @prop {string} sourceFeatureHash Hash of the NMF feature used for bases
 * @prop {number[][]} bases Spectral bases from the source
 * @prop {number[][]} activations Temporal activations from the target
 * @method playComponent(index?) Play a specific cross-synthesis component → Sample
 * @methodparam index 0-based component index to play (default: 0)
 */
export type NxFeature = NxFeatureResult | NxFeaturePromise;

/**
 * @porcelain VisScene
 * A visualization scene combining a waveform with optional overlays and panels.
 * @prop {SampleResult} sample The sample being visualized
 * @prop {SliceFeatureResult[]} overlays Feature overlays drawn on the waveform
 * @prop {NmfFeatureResult[]} panels Additional panel visualizations
 * @method title(text) Set the scene title → VisScene
 * @methodparam text Title string to display above the waveform
 * @method overlay(feature) Add a feature overlay → VisScene
 * @methodparam feature SliceFeature or NmfFeature to draw on the waveform
 * @method panel(feature) Add an NMF panel → VisScene
 * @methodparam feature NmfFeature to render as a separate panel
 * @method show() Render the scene in the terminal → BounceResult
 */
export type VisScene = VisSceneResult | VisScenePromise;

/**
 * @porcelain VisStack
 * A stack of visualization scenes displayed together.
 * @method addScene(scene) Add a scene to the stack → VisStack
 * @methodparam scene VisScene to append to this stack
 * @method title(text) Set the stack title → VisStack
 * @methodparam text Title string displayed above the stack
 * @method show() Render the stack in the terminal → BounceResult
 */
export type VisStack = VisStackResult;

/**
 * @porcelain Pattern
 * A compiled X0X step sequencer pattern.
 * @prop {string} notation The original pattern notation string
 * @method play(channel) Start playing on mixer channel 1–8 → BounceResult
 * @methodparam channel Mixer channel number (1–8)
 * @method stop() Stop the pattern on its current channel → BounceResult
 */
export type Pattern = PatternResult;

/**
 * @porcelain AudioDevice
 * An audio input device available for recording.
 * @prop {number} index Device index (as listed by sn.inputs())
 * @prop {string} deviceId Browser/system device identifier
 * @prop {string} label Human-readable device name
 * @prop {number} channels Number of input channels
 * @method record(sampleId, opts?) Start recording audio → RecordingHandle
 * @methodparam sampleId Name to save the recording under
 */
export type AudioDevice = AudioDeviceResult;

/**
 * @porcelain RecordingHandle
 * An active audio recording session. Not a Promise — assignment is immediate.
 * @method stop() Stop recording and return the captured audio → Sample
 */
export type RecordingHandle = RecordingHandleResult;

/**
 * @porcelain MidiRecordingHandle
 * An active MIDI recording session. Not a Promise — assignment is immediate.
 * @method stop() Stop recording and return the captured MIDI sequence → MidiSequence
 */
export type MidiRecordingHandle = MidiRecordingHandleResult;

/**
 * @porcelain MidiSequence
 * A recorded MIDI sequence.
 * @method play(instrument) Play the sequence through an instrument → BounceResult
 * @methodparam instrument The InstrumentResult to play through
 * @method stop() Stop playback → BounceResult
 */
export type MidiSequence = MidiSequenceResult | MidiSequencePromise;
