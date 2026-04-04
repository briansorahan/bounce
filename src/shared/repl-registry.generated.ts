/**
 * REPL registry metadata for the REPL Intelligence Layer.
 * AUTO-GENERATED — do not edit by hand. Run `npm run generate:repl-artifacts`.
 */

export interface ReplRegistryEntry {
  summary: string;
  visibility: "porcelain" | "plumbing";
  returns?: string;
  params: Array<{
    name: string;
    summary: string;
    kind: string;
    expectedType?: string;
  }>;
}

export const replRegistry: Record<string, ReplRegistryEntry> = {
  "sn.read": {
    summary: "Load an audio file from disk and return a SampleResult object",
    visibility: "porcelain",
    returns: "SamplePromise",
    params: [
        {
            "name": "path",
            "summary": "File path (absolute, relative, or ~). Supports WAV, MP3, OGG, FLAC, M4A, AAC, OPUS.",
            "kind": "filePath"
        }
    ],
  },
  "sn.load": {
    summary: "Load a stored sample by hash and return a SampleResult object",
    visibility: "porcelain",
    returns: "SamplePromise",
    params: [
        {
            "name": "hash",
            "summary": "Full or prefix hash from sn.list().",
            "kind": "sampleHash"
        }
    ],
  },
  "sn.list": {
    summary: "List stored samples and features in the database",
    visibility: "porcelain",
    params: [],
  },
  "sn.current": {
    summary: "Return the currently loaded sample, or null",
    visibility: "porcelain",
    returns: "CurrentSamplePromise",
    params: [],
  },
  "sn.stop": {
    summary: "Stop all active sample playback and looping voices",
    visibility: "porcelain",
    params: [],
  },
  "sn.inputs": {
    summary: "List available audio input devices",
    visibility: "porcelain",
    params: [],
  },
  "sn.dev": {
    summary: "Open an audio input device by index for recording",
    visibility: "porcelain",
    returns: "AudioDeviceResult",
    params: [
        {
            "name": "index",
            "summary": "Device index from sn.inputs().",
            "kind": "plain"
        }
    ],
  },
  "sn.bindSample": {
    summary: "Bind a raw sample record to a SampleResult with bound methods (internal use)",
    visibility: "plumbing",
    returns: "SampleResult",
    params: [],
  },
};
