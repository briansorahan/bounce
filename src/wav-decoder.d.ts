declare module "wav-decoder" {
  export interface AudioData {
    sampleRate: number;
    length: number;
    channelData: Float32Array[];
  }

  export function decode(buffer: Buffer): Promise<AudioData>;
}
