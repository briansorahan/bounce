import type { CompletionContext } from "../../shared/completion-context.js";
import type { Completer, PredictionResult } from "../../shared/completer.js";
import { replRegistry } from "../../shared/repl-registry.generated.js";

/**
 * Suggests option object keys when the cursor is inside an object literal
 * argument whose corresponding @param has kind "options".
 *
 * Active when: position.kind === "objectLiteralKey"
 *
 * Keys already present in the object literal are excluded from suggestions.
 * Uses the registered @param for this argument to determine which option type
 * to consult. The option keys come from the `replRegistry.generated.ts`
 * `expectedType` field; since we only resolve one level deep, the options
 * interface properties must be declared in the registered method's @param.
 *
 * For Phase 3, available option keys are derived directly from ipc-contract.ts
 * interface definitions mapped via the registry's param metadata.
 */
export class OptionsCompleter implements Completer {
  constructor(private readonly devMode = false) {}

  predict(context: CompletionContext): PredictionResult[] {
    if (context.position.kind !== "objectLiteralKey") return [];
    const { callee, alreadyPresentKeys, prefix } = context.position;

    const keys = this.resolveOptionKeys(callee.parentName, callee.name, callee.paramIndex);
    const results: PredictionResult[] = [];

    for (const key of keys) {
      if (alreadyPresentKeys.includes(key)) continue;
      if (!prefix || key.startsWith(prefix)) {
        results.push({ label: key, kind: "key" });
      }
    }

    return results;
  }

  private resolveOptionKeys(
    parentName: string | undefined,
    methodName: string,
    paramIndex: number,
  ): string[] {
    const registryKey = parentName ? `${parentName}.${methodName}` : methodName;
    const entry = replRegistry[registryKey];
    if (!entry) return [];

    const paramMeta = entry.params[paramIndex];
    if (!paramMeta || paramMeta.kind !== "options") return [];

    // Use the expectedType to look up known option keys from the static map.
    // This map is populated from ipc-contract.ts known option interfaces.
    if (paramMeta.expectedType) {
      const known = KNOWN_OPTION_KEYS[paramMeta.expectedType];
      if (known) return known;
    }

    return [];
  }
}

// ---------------------------------------------------------------------------
// Known option keys — derived from ipc-contract.ts interfaces.
// Populated here as a static map for Phase 3; Phase 5.2 will drive this from
// the generated repl-environment.d.ts via the language service.
// ---------------------------------------------------------------------------

const KNOWN_OPTION_KEYS: Record<string, string[]> = {
  OnsetSliceOptions: ["threshold", "minSliceLength", "filterSize", "frameDelta", "metric"],
  AmpSliceOptions: [
    "fastRampUp", "fastRampDown", "slowRampUp", "slowRampDown",
    "onThreshold", "offThreshold", "floor", "minSliceLength", "highPassFreq",
  ],
  NoveltySliceOptions: [
    "kernelSize", "threshold", "filterSize", "minSliceLength",
    "windowSize", "fftSize", "hopSize",
  ],
  TransientSliceOptions: [
    "order", "blockSize", "padSize", "skew", "threshFwd", "threshBack",
    "windowSize", "clumpLength", "minSliceLength",
  ],
  BufNMFOptions: ["components", "iterations", "fftSize", "hopSize", "windowSize", "seed"],
  MFCCOptions: [
    "numCoeffs", "numBands", "minFreq", "maxFreq",
    "windowSize", "fftSize", "hopSize", "sampleRate",
  ],
  GrainsOptions: [
    "grainSize", "hopSize", "jitter", "startTime", "endTime",
    "normalize", "silenceThreshold",
  ],
  // Loop options (from bounce-result.ts)
  LoopOptions: ["loopStart", "loopEnd"],
  // SliceFeature options
  SliceOptions: ["featureHash"],
  // Sampler options
  SamplerOptions: ["name", "startNote", "polyphony"],
  // NMF sep options
  SepOptions: ["components", "iterations"],
  // Instrument create options
  InstrumentCreateOptions: ["kind", "polyphony"],
  // MIDI record options
  MidiRecordOptions: ["duration", "name"],
  // Record options (audio)
  RecordOptions: ["duration", "overwrite"],
  // NxOptions
  NxOptions: ["components"],
};
