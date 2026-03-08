/// <reference path="./types.d.ts" />
/// <reference path="./bounce-globals.d.ts" />
import { AudioManager } from "./audio-context.js";
import { BounceTerminal } from "./terminal.js";
import { NMFVisualizer } from "./nmf-visualizer.js";
import { VisualizationManager } from "./visualization-manager.js";
import { BounceResult, AudioResult, FeatureResult } from "./bounce-result.js";

export { BounceResult, AudioResult, FeatureResult };

export interface BounceApiDeps {
  terminal: BounceTerminal;
  audioManager: AudioManager;
  onUpdateWaveform: () => void;
}

/**
 * Builds the typed global functions injected into the REPL evaluation scope.
 * Each function closes over the provided deps and the global window.electron IPC bridge.
 */
export function buildBounceApi(deps: BounceApiDeps): Record<string, unknown> {
  const { terminal, audioManager, onUpdateWaveform } = deps;

  async function display(fileOrHash: string): Promise<AudioResult> {
    const supportedExtensions = [".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aac", ".opus"];
    const isHash =
      /^[0-9a-f]{8,}$/i.test(fileOrHash) &&
      !fileOrHash.includes("/") &&
      !fileOrHash.includes("\\");

    if (!isHash) {
      const ext = fileOrHash.toLowerCase().substring(fileOrHash.lastIndexOf("."));
      if (!supportedExtensions.includes(ext)) {
        throw new Error(`Unsupported file format. Supported: WAV, MP3, OGG, FLAC, M4A, AAC, OPUS`);
      }
    }

    const audioFileData = await window.electron.readAudioFile(fileOrHash);

    const audio = {
      audioData: audioFileData.channelData,
      sampleRate: audioFileData.sampleRate,
      duration: audioFileData.duration,
      filePath: fileOrHash,
      hash: audioFileData.hash,
      visualize: () => "Visualization updated",
      analyzeOnsetSlice: async (options?: OnsetSliceOptions) => {
        const slices = await window.electron.analyzeOnsetSlice(audioFileData.channelData, options);
        return { slices, visualize: () => "Slice markers updated" };
      },
    };

    audioManager.setCurrentAudio(audio);
    onUpdateWaveform();
    return new AudioResult(
      [
        `\x1b[32mLoaded: ${audioFileData.filePath ?? audioFileData.hash.substring(0, 8)}\x1b[0m`,
        `\x1b[32mHash: ${audioFileData.hash.substring(0, 8)}\x1b[0m`,
      ].join("\n"),
      audioFileData.hash,
      audioFileData.filePath ?? undefined,
      audioFileData.sampleRate,
      audioFileData.duration,
    );
  }

  async function play(source?: string | AudioResult): Promise<AudioResult> {
    let displayResult: AudioResult | undefined;

    if (typeof source === "string") {
      displayResult = await display(source);
    } else if (source instanceof AudioResult) {
      // Reload only if this isn't already the current audio
      if (audioManager.getCurrentAudio()?.hash !== source.hash) {
        displayResult = await display(source.hash);
      }
    }

    const audio = audioManager.getCurrentAudio();
    if (!audio) {
      throw new Error('No audio loaded. Use display("path/to/file") first.');
    }
    await audioManager.playAudio(audio.audioData, audio.sampleRate);

    const playLine = `\x1b[32mPlaying: ${audio.hash?.substring(0, 8) ?? audio.filePath ?? "audio"}\x1b[0m`;
    const displayStr = displayResult ? `${displayResult.toString()}\n${playLine}` : playLine;
    return new AudioResult(
      displayStr,
      audio.hash!,
      audio.filePath ?? undefined,
      audio.sampleRate,
      audio.duration,
    );
  }

  function stop(): BounceResult {
    audioManager.stopAudio();
    return new BounceResult("\x1b[32mPlayback stopped\x1b[0m");
  }

  async function analyze(
    source?: AudioResult | AnalyzeOptions,
    options?: AnalyzeOptions,
  ): Promise<FeatureResult> {
    const opts = source instanceof AudioResult ? options : (source as AnalyzeOptions | undefined);
    const audio = audioManager.getCurrentAudio();
    if (!audio?.hash) {
      throw new Error('No audio loaded. Use display("path/to/file") first.');
    }

    terminal.writeln("\x1b[36mAnalyzing onset slices...\x1b[0m");

    const slices = await window.electron.analyzeOnsetSlice(audio.audioData, opts);
    const featureId = await window.electron.storeFeature(audio.hash, "onset-slice", slices, opts as FeatureOptions | undefined);

    audioManager.setCurrentSlices(slices);
    onUpdateWaveform();

    return new FeatureResult(
      `\x1b[32mFound ${slices.length} onset slices (feature: ${featureId})\x1b[0m`,
      audio.hash,
      String(featureId),
      "onset-slice",
    );
  }

  async function analyzeNmf(
    source?: AudioResult | NmfOptions,
    options?: NmfOptions,
  ): Promise<FeatureResult> {
    const opts = source instanceof AudioResult ? options : (source as NmfOptions | undefined);
    const audio = audioManager.getCurrentAudio();
    if (!audio?.hash) {
      throw new Error('No audio loaded. Use display("path/to/file") first.');
    }

    terminal.writeln("\x1b[36mPerforming NMF decomposition...\x1b[0m");

    const result = await window.electron.analyzeBufNMF(audio.audioData, audio.sampleRate, opts);

    const flattenedData = [
      result.components,
      result.iterations,
      result.converged ? 1 : 0,
      ...result.bases.flat(),
      ...result.activations.flat(),
    ];
    const featureId = await window.electron.storeFeature(
      audio.hash,
      "nmf",
      flattenedData,
      { ...opts, components: result.components },
    );

    return new FeatureResult(
      [
        `\x1b[32mNMF complete: ${result.components} components (feature: ${featureId})\x1b[0m`,
        `Converged: ${result.converged ? "Yes" : "No"} after ${result.iterations} iterations`,
      ].join("\n"),
      audio.hash,
      String(featureId),
      "nmf",
    );
  }

  async function slice(
    source?: FeatureResult | AudioResult | SliceOptions,
    options?: SliceOptions,
  ): Promise<BounceResult> {
    const audio = audioManager.getCurrentAudio();
    if (!audio?.hash) {
      throw new Error('No audio loaded. Use display("path/to/file") first.');
    }

    let feature: FeatureData | null;
    if (source instanceof FeatureResult) {
      feature = await window.electron.getMostRecentFeature(source.sourceHash, "onset-slice");
    } else {
      const opts = source instanceof AudioResult ? options : (source as SliceOptions | undefined);
      void opts;
      feature = await window.electron.getMostRecentFeature(audio.hash, "onset-slice");
    }

    if (!feature) {
      throw new Error('No onset-slice analysis found. Run analyze() first.');
    }

    terminal.writeln(`\x1b[36mCreating slices from feature ${feature.feature_hash.substring(0, 8)}...\x1b[0m`);

    const slices = await window.electron.createSliceSamples(audio.hash, feature.feature_hash);

    return new BounceResult(`\x1b[32mCreated ${slices.length} slices\x1b[0m`);
  }

  async function sep(
    source?: AudioResult | FeatureResult | SepOptions,
    options?: SepOptions,
  ): Promise<BounceResult> {
    let hash: string;
    let opts: SepOptions | undefined;

    if (source instanceof AudioResult) {
      hash = source.hash;
      opts = options;
    } else if (source instanceof FeatureResult) {
      hash = source.sourceHash;
      opts = options;
    } else {
      const audio = audioManager.getCurrentAudio();
      if (!audio?.hash) {
        throw new Error('No audio loaded. Use display("path/to/file") first.');
      }
      hash = audio.hash;
      opts = source as SepOptions | undefined;
    }

    const args: string[] = [hash];
    if (opts?.components !== undefined) args.push("--components", String(opts.components));
    if (opts?.iterations !== undefined) args.push("--iterations", String(opts.iterations));

    const result = await window.electron.sep(args);
    if (result.success) {
      return new BounceResult(`\x1b[32m${result.message}\x1b[0m`);
    } else {
      throw new Error(result.message);
    }
  }

  async function nx(options?: NxOptions): Promise<BounceResult> {
    if (!options?.targetHash || !options?.sourceHash) {
      throw new Error("nx() requires options.targetHash and options.sourceHash");
    }

    const args: string[] = [options.targetHash, options.sourceHash];
    if (options.components !== undefined) args.push("--components", String(options.components));

    const result = await window.electron.nx(args);
    if (result.success) {
      return new BounceResult(`\x1b[32m${result.message}\x1b[0m`);
    } else {
      throw new Error(result.message);
    }
  }

  async function list(): Promise<BounceResult> {
    const samples = await window.electron.listSamples();
    const features = await window.electron.listFeatures();
    const lines: string[] = [];

    if (samples.length === 0) {
      lines.push("\x1b[33mNo samples in database\x1b[0m");
    } else {
      lines.push("\x1b[1;36mStored Samples:\x1b[0m", "");
      for (const sample of samples) {
        const shortHash = sample.hash.substring(0, 8);
        const basename =
          (sample.file_path ?? sample.hash).split("/").pop() ?? shortHash;
        const channelsStr = sample.channels === 1 ? "mono" : "stereo";
        lines.push(
          `  \x1b[33m${shortHash}\x1b[0m ${basename.padEnd(25)} ${sample.sample_rate}Hz ${channelsStr.padEnd(6)} ${sample.duration.toFixed(2)}s`,
        );
      }
      lines.push("", `Total: ${samples.length} sample(s)`);
    }

    if (features.length > 0) {
      lines.push("", "\x1b[1;36mStored Features:\x1b[0m", "");
      for (const feature of features) {
        const shortHash = feature.sample_hash.substring(0, 8);
        lines.push(
          `  \x1b[33m${shortHash}\x1b[0m \x1b[90m${feature.feature_type}\x1b[0m  ${feature.feature_count} entries`,
        );
      }
      lines.push("", `Total: ${features.length} feature(s)`);
    }

    return new BounceResult(lines.join("\n"));
  }

  async function playSlice(index = 0, source?: FeatureResult | AudioResult): Promise<AudioResult> {
    const audio = audioManager.getCurrentAudio();
    if (!audio?.hash) {
      throw new Error('No audio loaded. Use display("path/to/file") first.');
    }

    const lookupHash = source instanceof AudioResult
      ? source.hash
      : source instanceof FeatureResult
        ? source.sourceHash
        : audio.hash;

    const feature = source instanceof FeatureResult
      ? await window.electron.getMostRecentFeature(lookupHash, "onset-slice")
      : await window.electron.getMostRecentFeature(lookupHash, "onset-slice");

    if (!feature) {
      throw new Error('No onset-slice analysis found. Run analyze() first.');
    }

    const derivedSample = await window.electron.getDerivedSampleByIndex(
      lookupHash,
      feature.feature_hash,
      index,
    );
    if (!derivedSample) {
      throw new Error(`Slice ${index} not found. Run slice() first.`);
    }

    const audioBuffer = derivedSample.audio_data as Buffer;
    const audioData = new Float32Array(
      audioBuffer.buffer,
      audioBuffer.byteOffset,
      audioBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT,
    );
    const duration = audioData.length / derivedSample.sample_rate;

    audioManager.setCurrentAudio({
      audioData,
      sampleRate: derivedSample.sample_rate,
      duration,
      filePath: `Slice ${index} from ${lookupHash.substring(0, 8)}`,
      hash: derivedSample.hash,
      visualize: () => "Not available for slices",
      analyzeOnsetSlice: async () => ({ slices: [], visualize: () => "Not available" }),
    });
    audioManager.clearSlices();

    await audioManager.playAudio(audioData, derivedSample.sample_rate);
    onUpdateWaveform();

    return new AudioResult(
      `\x1b[32mPlaying slice ${index} (${duration.toFixed(3)}s)\x1b[0m`,
      derivedSample.hash,
      undefined,
      derivedSample.sample_rate,
      duration,
    );
  }

  async function playComponent(index = 0, source?: FeatureResult | AudioResult): Promise<AudioResult> {
    const audio = audioManager.getCurrentAudio();
    if (!audio?.hash) {
      throw new Error('No audio loaded. Use display("path/to/file") first.');
    }

    const lookupHash = source instanceof AudioResult
      ? source.hash
      : source instanceof FeatureResult
        ? source.sourceHash
        : audio.hash;

    const feature = await window.electron.getMostRecentFeature(lookupHash, "nmf");
    if (!feature) {
      throw new Error('No NMF analysis found. Run analyzeNmf() first.');
    }

    const nmfData = JSON.parse(feature.feature_data) as { bases: number[][] };
    const numComponents = nmfData.bases.length;
    if (index < 0 || index >= numComponents) {
      throw new Error(`Component index ${index} out of range (0-${numComponents - 1})`);
    }

    const derivedSample = await window.electron.getDerivedSampleByIndex(
      lookupHash,
      feature.feature_hash,
      index,
    );
    if (!derivedSample) {
      throw new Error(`Component ${index} not found. Run sep() first.`);
    }

    const audioBuffer = derivedSample.audio_data as Buffer;
    const componentAudio = new Float32Array(
      audioBuffer.buffer,
      audioBuffer.byteOffset,
      audioBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT,
    );
    const duration = componentAudio.length / derivedSample.sample_rate;

    audioManager.setCurrentAudio({
      audioData: componentAudio,
      sampleRate: derivedSample.sample_rate,
      duration,
      filePath: `Component ${index} from ${lookupHash.substring(0, 8)}`,
      hash: derivedSample.hash,
      visualize: () => "Not available for components",
      analyzeOnsetSlice: async () => ({ slices: [], visualize: () => "Not available" }),
    });
    audioManager.clearSlices();

    await audioManager.playAudio(componentAudio, derivedSample.sample_rate);
    onUpdateWaveform();

    return new AudioResult(
      `\x1b[32mPlaying component ${index} (${duration.toFixed(3)}s)\x1b[0m`,
      derivedSample.hash,
      undefined,
      derivedSample.sample_rate,
      duration,
    );
  }

  async function visualizeNmf(options?: VisualizeNmfOptions): Promise<BounceResult> {
    const audio = audioManager.getCurrentAudio();
    if (!audio?.hash) {
      throw new Error('No audio loaded. Use display("path/to/file") first.');
    }

    const hash = options?.featureHash ?? audio.hash;

    const sample = await window.electron.getSampleByHash(hash);
    if (!sample) {
      throw new Error(`Sample ${hash} not found in database`);
    }

    const sampleAudioData = new Float32Array(
      sample.audio_data.buffer,
      sample.audio_data.byteOffset,
      sample.audio_data.byteLength / Float32Array.BYTES_PER_ELEMENT,
    );

    audioManager.setCurrentAudio({
      audioData: sampleAudioData,
      sampleRate: sample.sample_rate,
      duration: sample.duration,
      filePath: sample.file_path ?? undefined,
      hash: sample.hash,
      visualize: () => "Visualization available",
      analyzeOnsetSlice: async () => ({ slices: [], visualize: () => "Available" }),
    });
    audioManager.clearSlices();
    onUpdateWaveform();

    await window.electron.visualizeNMF(hash);
    return new BounceResult(`\x1b[32mNMF visualization overlaid for ${hash.substring(0, 8)}\x1b[0m`);
  }

  async function visualizeNx(options?: VisualizeNxOptions): Promise<BounceResult> {
    const audio = audioManager.getCurrentAudio();
    const targetHash = options?.featureHash ?? audio?.hash;
    if (!targetHash) {
      throw new Error('No audio loaded. Use display("path/to/file") first.');
    }

    const sample = await window.electron.getSampleByHash(targetHash);
    if (!sample) {
      throw new Error(`Sample ${targetHash} not found`);
    }

    const sampleAudioData = new Float32Array(
      sample.audio_data.buffer,
      sample.audio_data.byteOffset,
      sample.audio_data.byteLength / Float32Array.BYTES_PER_ELEMENT,
    );

    audioManager.setCurrentAudio({
      audioData: sampleAudioData,
      sampleRate: sample.sample_rate,
      duration: sample.duration,
      filePath: sample.file_path ?? undefined,
      hash: sample.hash,
      visualize: () => "NX Visualization",
      analyzeOnsetSlice: async () => ({ slices: [], visualize: () => "Not available" }),
    });
    onUpdateWaveform();

    await window.electron.sendCommand("visualize-nx", [targetHash]);
    return new BounceResult(`\x1b[32mNX visualization overlaid for ${targetHash.substring(0, 8)}\x1b[0m`);
  }

  async function onsetSlice(options?: OnsetSliceVisOptions): Promise<BounceResult> {
    const audio = audioManager.getCurrentAudio();
    if (!audio?.hash) {
      throw new Error('No audio loaded. Use display("path/to/file") first.');
    }

    const feature = await window.electron.getMostRecentFeature(audio.hash, "onset-slice");
    if (!feature) {
      throw new Error('No onset-slice analysis found. Run analyze() first.');
    }

    const slicesData = JSON.parse(feature.feature_data) as number[];
    audioManager.setCurrentSlices(slicesData);
    onUpdateWaveform();
    return new BounceResult(
      `\x1b[32mOnset slice markers updated (${slicesData.length} slices, feature: ${options?.featureHash ? options.featureHash.substring(0, 8) : feature.feature_hash.substring(0, 8)})\x1b[0m`,
    );
  }

  async function nmf(options?: NmfVisOptions): Promise<BounceResult> {
    const audio = audioManager.getCurrentAudio();
    if (!audio?.hash) {
      throw new Error('No audio loaded. Use display("path/to/file") first.');
    }

    const feature = await window.electron.getMostRecentFeature(audio.hash, "nmf");
    if (!feature) {
      throw new Error('No NMF analysis found. Run analyzeNmf() first.');
    }

    const nmfData = JSON.parse(feature.feature_data) as {
      components: number;
      bases: number[][];
      activations: number[][];
    };

    const vizContainer = document.getElementById("visualizations-container");
    if (!vizContainer) {
      throw new Error("Visualization container not found in DOM");
    }

    const vizManager = new VisualizationManager("visualizations-container");
    const viz = vizManager.addVisualization("NMF Decomposition", 400);

    if (!viz.canvas) {
      throw new Error("Failed to create visualization canvas");
    }

    new NMFVisualizer(viz.canvas, {
      bases: nmfData.bases,
      activations: nmfData.activations,
      sampleRate: audio.sampleRate,
      components: nmfData.components,
    });

    return new BounceResult(
      `\x1b[32mNMF visualization created (${nmfData.components} components, feature: ${options?.featureHash ? options.featureHash.substring(0, 8) : feature.feature_hash.substring(0, 8)})\x1b[0m`,
    );
  }

  async function clearDebug(): Promise<BounceResult> {
    await window.electron.clearDebugLogs();
    return new BounceResult("\x1b[32mDebug logs cleared\x1b[0m");
  }

  async function debug(limit = 20): Promise<BounceResult> {
    const logs = await window.electron.getDebugLogs(limit);
    const lines: string[] = [
      `\x1b[1;36mDebug Logs (${logs.length} entries):\x1b[0m`,
      "",
    ];

    for (const log of [...logs].reverse()) {
      const levelColor =
        log.level === "error" ? "\x1b[31m" :
        log.level === "warn" ? "\x1b[33m" : "\x1b[90m";
      const timestamp = new Date(log.timestamp).toISOString();
      const data = log.data ? ` ${log.data}` : "";
      lines.push(
        `${levelColor}[${timestamp}] ${log.level.toUpperCase()}: ${log.message}${data}\x1b[0m`,
      );
    }

    if (logs.length === 0) {
      lines.push("\x1b[90mNo debug logs found\x1b[0m");
    }

    return new BounceResult(lines.join("\n"));
  }

  function help(): BounceResult {
    return new BounceResult([
      "\x1b[1;36mBounce REPL — Available Functions:\x1b[0m",
      "",
      '  \x1b[33mdisplay(fileOrHash)\x1b[0m              Load and visualize an audio file or sample hash',
      '  \x1b[33mplay(source?)\x1b[0m                    Play current, specified path/hash, or AudioResult',
      '  \x1b[33mstop()\x1b[0m                           Stop playback',
      '  \x1b[33manalyze(source?, options?)\x1b[0m       Onset-slice analysis (accepts AudioResult)',
      '  \x1b[33manalyzeNmf(source?, options?)\x1b[0m    NMF decomposition (accepts AudioResult)',
      '  \x1b[33mslice(source?, options?)\x1b[0m         Create slices (accepts FeatureResult)',
      '  \x1b[33msep(source?, options?)\x1b[0m           NMF separation (accepts AudioResult or FeatureResult)',
      '  \x1b[33mnx(options)\x1b[0m                      NMF cross-synthesis (requires targetHash, sourceHash)',
      '  \x1b[33mlist()\x1b[0m                           List all samples in the database',
      '  \x1b[33mplaySlice(index?, source?)\x1b[0m       Play onset slice (accepts FeatureResult)',
      '  \x1b[33mplayComponent(index?, source?)\x1b[0m   Play NMF component (accepts FeatureResult)',
      '  \x1b[33mvisualizeNmf(options?)\x1b[0m           Show NMF overlay on current waveform',
      '  \x1b[33mvisualizeNx(options?)\x1b[0m            Show NX cross-synthesis overlay',
      '  \x1b[33monsetSlice(options?)\x1b[0m             Show onset slice markers on waveform',
      '  \x1b[33mnmf(options?)\x1b[0m                    Show NMF visualization panel',
      '  \x1b[33mclearDebug()\x1b[0m                     Clear debug logs',
      '  \x1b[33mdebug(limit?)\x1b[0m                    Show last N debug log entries (default: 20)',
      '  \x1b[33mhelp()\x1b[0m                           Show this help message',
      '  \x1b[33mclear()\x1b[0m                          Clear the terminal screen',
      "",
      "  TypeScript is fully supported. Variables persist across evaluations.",
      "  Results are objects — compose commands: sep(play(\"path\")), slice(analyze()), etc.",
    ].join("\n"));
  }

  function clear(): void {
    terminal.clear();
  }

  return {
    display,
    play,
    stop,
    analyze,
    analyzeNmf,
    slice,
    sep,
    nx,
    list,
    playSlice,
    playComponent,
    visualizeNmf,
    visualizeNx,
    onsetSlice,
    nmf,
    clearDebug,
    debug,
    help,
    clear,
  };
}
