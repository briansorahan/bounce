/// <reference path="../types.d.ts" />
/// <reference path="../bounce-globals.d.ts" />
import {
  BounceResult,
  Sample,
} from "../bounce-result.js";
import { type CommandHelp, renderNamespaceHelp, withHelp } from "../help.js";
import type { NamespaceDeps } from "./types.js";
import type { SampleBinder } from "./sample-namespace.js";

export const corpusCommands: CommandHelp[] = [
  {
    name: "build",
    signature: "corpus.build(source?)",
    summary: "Build a KDTree from onset slices of an audio file",
    description:
      "Build a KDTree corpus from the onset slices of an audio file.\n" +
      "Requires sample.onsets() and sample.slice() to have been run first.\n" +
      "If source is omitted, uses the currently loaded audio.",
    params: [
      { name: "source", type: "string | Sample | Promise<Sample>", description: "Audio source. Omit to use current audio.", optional: true },
    ],
    examples: [
      "const samp = sn.read('loop.wav')\ncorpus.build(samp)",
      "corpus.build()",
    ],
  },
  {
    name: "query",
    signature: "corpus.query(segmentIndex, k?)",
    summary: "Find k nearest corpus neighbors for a segment",
    description:
      "Find the k nearest corpus segments to the segment at segmentIndex.\n" +
      "Returns a ranked table of indices and distances.\n" +
      "k defaults to 5.",
    params: [
      { name: "segmentIndex", type: "number", description: "Index of the query segment." },
      { name: "k", type: "number", description: "Number of nearest neighbors to return. Defaults to 5.", optional: true },
    ],
    examples: ["corpus.query(0)", "corpus.query(0, 10)"],
  },
  {
    name: "resynthesize",
    signature: "corpus.resynthesize(queryIndices)",
    summary: "Concatenate and play corpus segments by index array",
    description:
      "Concatenate corpus segments specified by index and play them back immediately.\n" +
      "Useful for auditioning nearest-neighbor query results.",
    params: [
      { name: "queryIndices", type: "number[]", description: "Array of segment indices to concatenate and play." },
    ],
    examples: [
      "corpus.resynthesize([0, 3, 7, 2])",
      "// Full workflow:\nconst samp = sn.read('loop.wav')\nsamp.onsets()\nsamp.slice()\ncorpus.build(samp)\ncorpus.query(0, 5)\ncorpus.resynthesize([0, 3, 7])",
    ],
  },
];

export function buildCorpusNamespace(deps: NamespaceDeps, sampleBinder: SampleBinder) {
  const { terminal, audioManager } = deps;

  function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
    return (
      (typeof value === "object" || typeof value === "function") &&
      value !== null &&
      "then" in value &&
      typeof value.then === "function"
    );
  }

  async function resolveSample(source: Sample | PromiseLike<Sample>): Promise<Sample> {
    return isPromiseLike<Sample>(source) ? await source : source;
  }

  const corpus = {
    help: () => renderNamespaceHelp("corpus", "KDTree corpus for nearest-neighbor resynthesis", corpusCommands),

    build: withHelp(
      async function build(
        source?: string | Sample | PromiseLike<Sample>,
        featureHashOverride?: string,
      ): Promise<BounceResult> {
        let sourceHash: string;
        let featureHash: string;

        if (typeof source === "string") {
          sourceHash = source;
          if (!featureHashOverride) throw new Error("featureHash required when passing sourceHash as string.");
          featureHash = featureHashOverride;
        } else {
          let resolved: Sample | undefined;
          if (source !== undefined) resolved = await resolveSample(source as Sample | PromiseLike<Sample>);
          const hash = resolved?.hash ?? audioManager.getCurrentAudio()?.hash;
          if (!hash) throw new Error('No audio loaded. Use sn.read("path/to/file") first.');
          sourceHash = hash;

          if (featureHashOverride) {
            featureHash = featureHashOverride;
          } else {
            const feature = await window.electron.getMostRecentFeature(sourceHash, "onset-slice");
            if (!feature) throw new Error("No onset-slice feature found. Run sample.onsets() then sample.slice() first.");
            featureHash = feature.feature_hash;
          }
        }

        terminal.writeln("\x1b[36mBuilding corpus…\x1b[0m");

        const result = await window.electron.corpusBuild(sourceHash, featureHash);

        return new BounceResult(`\x1b[32mBuilt corpus: ${result.segmentCount} segments, ${result.featureDims}-dim features, KDTree ready\x1b[0m`);
      },
      corpusCommands[0],
    ),

    query: withHelp(
      async function query(segmentIndex: number, k = 5): Promise<BounceResult> {
        terminal.writeln(`\x1b[36mQuerying corpus for segment ${segmentIndex}, k=${k}…\x1b[0m`);

        const results = await window.electron.corpusQuery(segmentIndex, k);

        const lines: string[] = [
          `\x1b[1;36mNearest neighbors for segment ${segmentIndex}:\x1b[0m`,
          `${"Rank".padEnd(6)}${"Index".padEnd(8)}${"Distance".padEnd(12)}`,
          "─".repeat(26),
        ];
        results.forEach((r: { index: number; distance: number }, i: number) => {
          lines.push(`${String(i + 1).padEnd(6)}${String(r.index).padEnd(8)}${r.distance.toFixed(4)}`);
        });

        const msg = lines.join("\n");
        return new BounceResult(msg);
      },
      corpusCommands[1],
    ),

    resynthesize: withHelp(
      async function resynthesize(queryIndices: number[]): Promise<BounceResult> {
        terminal.writeln(`\x1b[36mResynthesizing ${queryIndices.length} segments…\x1b[0m`);

        const { audio, sampleRate } = await window.electron.corpusResynthesize(queryIndices);

        audioManager.clearSlices();
        await audioManager.playAudio(audio, sampleRate);

        const msg = `\x1b[32mResynthesis complete: ${queryIndices.length} segments, ${(audio.length / sampleRate).toFixed(2)}s\x1b[0m`;
        return new BounceResult(msg);
      },
      corpusCommands[2],
    ),
  };

  // Suppress unused parameter lint — sampleBinder reserved for future corpus-to-sample binding
  void sampleBinder;

  return corpus;
}
