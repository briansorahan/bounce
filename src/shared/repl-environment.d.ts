/**
 * REPL environment declarations for the Language Service utility process.
 * AUTO-GENERATED — do not edit by hand. Run `npm run generate:repl-artifacts`.
 */

interface InstrumentResult {
}

interface SliceFeature {
  slice(options?: SliceOptions): Promise<BounceResult>;
  playSlice(index: unknown): SamplePromise;
  toSampler(opts: ToSamplerOptions): Promise<InstrumentResult>;
}

interface NmfFeature {
  sep(options?: SepOptions): Promise<BounceResult>;
  playComponent(index: unknown): SamplePromise;
}

interface NxFeature {
  playComponent(index: unknown): SamplePromise;
}

interface MfccFeature {
}

interface AudioDevice {
  record(sampleId: string, opts?: RecordOptions): Promise<RecordingHandleResult> | SamplePromise;
}

interface RecordingHandle {
  stop(): SamplePromise;
}

interface Sample {
  play(): SamplePromise;
  stop(): BounceResult;
  display(): SamplePromise;
  slice(options?: SliceOptions): Promise<BounceResult>;
  sep(options?: SepOptions): Promise<BounceResult>;
  granularize(options?: GranularizeOptions): GrainCollectionPromise;
  onsetSlice(options?: AnalyzeOptions): SliceFeaturePromise;
  ampSlice(options?: AmpSliceOptions): SliceFeaturePromise;
  noveltySlice(options?: NoveltySliceOptions): SliceFeaturePromise;
  transientSlice(options?: TransientSliceOptions): SliceFeaturePromise;
  nmf(options?: NmfOptions): NmfFeaturePromise;
  mfcc(options?: MFCCOptions): MfccFeaturePromise;
  nx(other: SampleResult | PromiseLike<SampleResult>, options?: {
    components?: number;
}): NxFeaturePromise;
}

interface MidiSequence {
  play(inst: MidiTargetInstrument): MidiSequencePromise;
  stop(): Promise<BounceResult>;
}

interface MidiRecordingHandle {
  stop(): MidiSequencePromise;
}

interface Pattern {
  play(channel: number): BounceResult;
  stop(): BounceResult;
}

interface VisScene {
  title(text: string): VisSceneResult;
  overlay(feature: SliceFeatureResult | NmfFeatureResult | NxFeatureResult | PromiseLike<SliceFeatureResult | NmfFeatureResult | NxFeatureResult>): VisSceneResult;
  panel(feature: NmfFeatureResult | PromiseLike<NmfFeatureResult>): VisSceneResult;
  show(): Promise<BounceResult>;
}

interface VisStack {
  title(text: string): VisStackResult;
  overlay(feature: SliceFeatureResult | NmfFeatureResult | NxFeatureResult | PromiseLike<SliceFeatureResult | NmfFeatureResult | NxFeatureResult>): VisStackResult;
  panel(feature: NmfFeatureResult | PromiseLike<NmfFeatureResult>): VisStackResult;
  show(): Promise<BounceResult>;
}

declare const transport: {
  bpm(value?: number): BounceResult;
  start(): BounceResult;
  stop(): BounceResult;
};

declare const pat: {
  xox(notation: string): PatternResult;
};

declare const fs: {
  ls(dirPath?: string): LsResultPromise;
  la(dirPath?: string): LsResultPromise;
  cd(dirPath: string): Promise<BounceResult>;
  pwd(): Promise<BounceResult>;
  glob(pattern: string): GlobResultPromise;
  walk(dirPath: string, handler: WalkCatchAll | WalkHandlers): Promise<BounceResult | undefined>;
};

declare const sn: {
  read(path: string): SamplePromise;
  load(hash: string): SamplePromise;
  list(): Promise<SampleListResult>;
  current(): CurrentSamplePromise;
  stop(): BounceResult;
  inputs(): Promise<InputsResult>;
  dev(index: number): Promise<AudioDeviceResult>;
};

declare const corpus: {
  build(source?: string | SampleResult | PromiseLike<SampleResult>, featureHashOverride?: string): Promise<BounceResult>;
  query(segmentIndex: number, k: unknown): Promise<BounceResult>;
  resynthesize(queryIndices: number[]): Promise<BounceResult>;
};

declare const env: {
  vars(): EnvScopeResult;
  globals(): EnvScopeResult;
  inspect(nameOrValue: unknown): EnvInspectionResult;
  functions(nameOrValue?: unknown): EnvFunctionListResult;
  dev(toggle?: boolean): BounceResult;
};

declare const proj: {
  current(): Promise<ProjectResult>;
  list(): Promise<ProjectListResult>;
  load(name: string): Promise<ProjectResult>;
  rm(name: string): Promise<BounceResult>;
};

declare const vis: {
  waveform(sampleOrPromise: SampleResult | PromiseLike<SampleResult>): VisSceneResult | VisScenePromise;
  stack(): VisStackResult;
  list(): VisSceneListResult;
  remove(id: string): BounceResult;
  clear(): BounceResult;
};

declare const inst: {
  sampler(opts: {
    name: string;
    polyphony?: number;
}): InstrumentResult;
  granular(opts: {
    name: string;
    polyphony?: number;
}): InstrumentResult;
  list(): InstrumentListResult;
  get(name: string): InstrumentResult | BounceResult;
};

declare const midi: {
  devices(): Promise<MidiDevicesResult>;
  open(index: number): Promise<MidiDeviceResult>;
  close(): Promise<BounceResult>;
  record(inst: MidiTargetInstrument, opts?: MidiRecordOptions): MidiRecordingHandleResult | MidiSequencePromise;
  sequences(): Promise<MidiSequencesResult>;
  load(filePath: string): Promise<MidiSequenceResult>;
};

declare const mx: {
  ch(n: number): ChannelControl | BounceResult;
};
