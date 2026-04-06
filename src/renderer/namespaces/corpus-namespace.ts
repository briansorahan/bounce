/// <reference path="../types.d.ts" />
/// <reference path="../bounce-globals.d.ts" />
import {
  BounceResult,
  SampleResult,
} from "../bounce-result.js";
import type { NamespaceDeps } from "./types.js";
import type { SampleBinder } from "./sample-namespace.js";
import { namespace, describe, param } from "../../shared/repl-registry.js";
import { corpusCommands } from "./corpus-commands.generated.js";
export { corpusCommands } from "./corpus-commands.generated.js";

@namespace("corpus", { summary: "KDTree corpus for nearest-neighbor resynthesis" })
export class CorpusNamespace {
  /** Namespace summary — used by the globals help() function. */
  readonly description = "KDTree corpus for nearest-neighbor resynthesis";

  private readonly terminal: NamespaceDeps["terminal"];
  private readonly audioManager: NamespaceDeps["audioManager"];

  constructor(private readonly deps: NamespaceDeps, _sampleBinder: SampleBinder) {
    this.terminal = deps.terminal;
    this.audioManager = deps.audioManager;
  }

  // ── Injected by @namespace decorator — do not implement manually ──────────

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  help(): unknown {
    // Replaced at class definition time by the @namespace decorator.
    return undefined;
  }

  toString(): string {
    return String(this.help());
  }

  // ── Public REPL-facing methods ────────────────────────────────────────────

  @describe({
    summary: "Build a KDTree from onset slices of an audio file. Requires sample.onsets() and sample.slice() first.",
    returns: "BounceResult",
  })
  @param("source", {
    summary: "Audio source (SampleResult, hash string, or omit to use current audio).",
    kind: "typed",
    expectedType: "SampleResult",
  })
  @param("featureHashOverride", {
    summary: "Override the feature hash (advanced use).",
    kind: "sampleHash",
  })
  async build(
    source?: string | SampleResult | PromiseLike<SampleResult>,
    featureHashOverride?: string,
  ): Promise<BounceResult> {
    let sourceHash: string;
    let featureHash: string;

    if (typeof source === "string") {
      sourceHash = source;
      if (!featureHashOverride) throw new Error("featureHash required when passing sourceHash as string.");
      featureHash = featureHashOverride;
    } else {
      let resolved: SampleResult | undefined;
      if (source !== undefined) resolved = await this.resolveSample(source as SampleResult | PromiseLike<SampleResult>);
      const hash = resolved?.hash ?? this.audioManager.getCurrentAudio()?.hash;
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

    this.terminal.writeln("\x1b[36mBuilding corpus…\x1b[0m");

    const result = await window.electron.corpusBuild(sourceHash, featureHash);

    return new BounceResult(`\x1b[32mBuilt corpus: ${result.segmentCount} segments, ${result.featureDims}-dim features, KDTree ready\x1b[0m`);
  }

  @describe({
    summary: "Find k nearest corpus neighbors for a segment. Returns ranked table of indices and distances.",
    returns: "BounceResult",
  })
  @param("segmentIndex", { summary: "Index of the query segment.", kind: "plain" })
  @param("k", { summary: "Number of nearest neighbors to return (default: 5).", kind: "plain" })
  async query(segmentIndex: number, k = 5): Promise<BounceResult> {
    this.terminal.writeln(`\x1b[36mQuerying corpus for segment ${segmentIndex}, k=${k}…\x1b[0m`);

    const results = await window.electron.corpusQuery(segmentIndex, k);

    const lines: string[] = [
      `\x1b[1;36mNearest neighbors for segment ${segmentIndex}:\x1b[0m`,
      `${"Rank".padEnd(6)}${"Index".padEnd(8)}${"Distance".padEnd(12)}`,
      "─".repeat(26),
    ];
    results.forEach((r: { index: number; distance: number }, i: number) => {
      lines.push(`${String(i + 1).padEnd(6)}${String(r.index).padEnd(8)}${r.distance.toFixed(4)}`);
    });

    return new BounceResult(lines.join("\n"));
  }

  @describe({
    summary: "Concatenate corpus segments by index array and play them back immediately.",
    returns: "BounceResult",
  })
  @param("queryIndices", { summary: "Array of segment indices to concatenate and play.", kind: "plain" })
  async resynthesize(queryIndices: number[]): Promise<BounceResult> {
    this.terminal.writeln(`\x1b[36mResynthesizing ${queryIndices.length} segments…\x1b[0m`);

    const { audio, sampleRate } = await window.electron.corpusResynthesize(queryIndices);

    this.audioManager.clearSlices();
    await this.audioManager.playAudio(audio, sampleRate);

    return new BounceResult(`\x1b[32mResynthesis complete: ${queryIndices.length} segments, ${(audio.length / sampleRate).toFixed(2)}s\x1b[0m`);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
    return (
      (typeof value === "object" || typeof value === "function") &&
      value !== null &&
      "then" in (value as object) &&
      typeof (value as { then: unknown }).then === "function"
    );
  }

  private async resolveSample(source: SampleResult | PromiseLike<SampleResult>): Promise<SampleResult> {
    return this.isPromiseLike<SampleResult>(source) ? await source : source;
  }
}

/** @deprecated Use `new CorpusNamespace(deps, sampleBinder)` directly. Kept for backward compatibility. */
export function buildCorpusNamespace(deps: NamespaceDeps, sampleBinder: SampleBinder): CorpusNamespace {
  return new CorpusNamespace(deps, sampleBinder);
}

// Re-export commands array for any consumers of the old JSDoc-generated metadata.
export { corpusCommands as corpusNamespaceCommands };
