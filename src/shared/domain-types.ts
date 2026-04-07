/**
 * Shared domain types — no Electron dependencies.
 *
 * These types are used across shared/, services/, and tests/. They are kept
 * here rather than in database.ts (which imports Electron) so that workflow
 * tests and the renderer can import them without pulling in native deps.
 */

export type SampleType = "raw" | "derived" | "recorded" | "freesound";

export interface SampleRecord {
  id: number;
  hash: string;
  sample_type: SampleType;
  sample_rate: number;
  channels: number;
  duration: number;
}

export interface SampleListRecord {
  id: number;
  hash: string;
  sample_type: SampleType;
  display_name: string | null;
  sample_rate: number;
  channels: number;
  duration: number;
  created_at: string;
}

export interface RawSampleMetadata {
  sample_id: number;
  file_path: string;
}

export interface ProjectRecord {
  id: number;
  name: string;
  created_at: string;
}

export interface ProjectListEntry extends ProjectRecord {
  sample_count: number;
  feature_count: number;
  command_count: number;
  current: boolean;
}

export interface InstrumentRecord {
  id: number;
  project_id: number;
  name: string;
  kind: string;
  config_json: string | null;
  created_at: string;
}

export interface InstrumentSampleRecord {
  instrument_id: number;
  sample_id: number;
  sample_hash: string;
  note_number: number;
  loop: number;
  loop_start: number;
  loop_end: number;
}

export interface MixerChannelState {
  channelIdx: number;
  gainDb: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  instrumentName: string | null;
}

export interface MixerMasterState {
  gainDb: number;
  mute: boolean;
}

export interface MixerState {
  channels: MixerChannelState[];
  master: MixerMasterState | null;
}

export interface ReplEnvEntry {
  name: string;
  kind: "json" | "function";
  value: string;
}
