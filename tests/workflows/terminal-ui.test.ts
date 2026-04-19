import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import { bootServices } from "./helpers";
import type { WorkflowServices } from "./helpers";
import { listNamespaces, listTypes } from "../../src/shared/repl-registration";

// Import all namespace files to trigger @namespace decorator registration.
import "../../src/renderer/namespaces/sample-namespace";
import "../../src/renderer/namespaces/env-namespace";
import "../../src/renderer/namespaces/vis-namespace";
import "../../src/renderer/namespaces/fs-namespace";
import "../../src/renderer/namespaces/corpus-namespace";
import "../../src/renderer/namespaces/instrument-namespace";
import "../../src/renderer/namespaces/midi-namespace";
import "../../src/renderer/namespaces/pat-namespace";
import "../../src/renderer/namespaces/project-namespace";
import "../../src/renderer/namespaces/mixer-namespace";
import "../../src/renderer/namespaces/transport-namespace";

// Import all result files to trigger @replType decorator registration.
import "../../src/renderer/results/sample";
import "../../src/renderer/results/features";
import "../../src/renderer/results/pattern";
import "../../src/renderer/results/recording";
import "../../src/renderer/results/visualization";
import "../../src/renderer/results/instrument";
import "../../src/renderer/results/midi";

const EXPECTED_NAMESPACES = [
  "sn", "env", "vis", "fs", "corpus", "inst", "midi", "pat", "proj", "mx", "transport",
] as const;

const EXPECTED_TYPES = [
  "Sample", "SliceFeature", "NmfFeature", "NxFeature", "MfccFeature",
  "Pattern", "AudioDevice", "RecordingHandle", "VisScene", "VisStack",
  "InstrumentResult", "MidiRecordingHandle",
] as const;

describe("terminal-ui", () => {
  let services: WorkflowServices;
  let cleanup: () => void;

  beforeAll(() => {
    const booted = bootServices();
    services = booted.ctx;
    cleanup = booted.cleanup;
  });

  afterAll(() => cleanup?.());

  for (const name of EXPECTED_NAMESPACES) {
    it(`namespace-${name}-is-registered`, () => {
      const all = listNamespaces().map((n) => n.name);
      assert.ok(
        all.includes(name),
        `namespace "${name}" should be registered; got: ${all.join(", ")}`,
      );
    });
  }

  it("all-namespaces-have-non-empty-summary", () => {
    for (const ns of listNamespaces()) {
      assert.ok(
        ns.summary.length > 0,
        `namespace "${ns.name}" has an empty summary`,
      );
    }
  });

  for (const name of EXPECTED_TYPES) {
    it(`type-${name}-is-registered`, () => {
      const all = listTypes().map((t) => t.name);
      assert.ok(
        all.includes(name),
        `type "${name}" should be registered; got: ${all.join(", ")}`,
      );
    });
  }

  it("all-types-have-non-empty-summary", () => {
    for (const t of listTypes()) {
      assert.ok(
        t.summary.length > 0,
        `type "${t.name}" has an empty summary`,
      );
    }
  });
});
