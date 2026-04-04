/**
 * REPL environment declarations for the Language Service utility process.
 * AUTO-GENERATED — do not edit by hand. Run `npm run generate:repl-artifacts`.
 */

declare const sn: {
  read(path: string): SamplePromise;
  load(hash: string): SamplePromise;
  list(): Promise<SampleListResult>;
  current(): CurrentSamplePromise;
  stop(): BounceResult;
  inputs(): Promise<InputsResult>;
  dev(index: number): Promise<AudioDeviceResult>;
};
