/**
 * Workflow: terminal-ui
 *
 * Verifies that the Bounce REPL surface is fully registered at the module
 * level — all expected namespaces and result types have been decorated and
 * written into repl-registration's in-memory maps.
 *
 * This is the workflow-layer proxy for "is the terminal UI ready to serve
 * commands?". The Playwright spec (tests/terminal-ui.spec.ts) checks that
 * the Electron window and #terminal DOM element are present; that remains
 * covered there.
 *
 * Approach: import every renderer namespace and result file to trigger their
 * @namespace / @replType decorator registrations, then query
 * listNamespaces() and listTypes() to assert completeness.
 *
 * No constructors are called. No window, no Electron, no IPC.
 * Decorators run at class-definition time as pure in-memory writes.
 *
 * Checks:
 *   - All expected namespaces are registered: sn, env, vis, fs, corpus,
 *     inst, midi, pat, proj, mx, transport
 *   - All expected REPL types are registered: Sample, SliceFeature,
 *     NmfFeature, NxFeature, MfccFeature, Pattern, AudioDevice,
 *     RecordingHandle, VisScene, VisStack, InstrumentResult,
 *     MidiRecordingHandle
 *   - Every registered namespace has a non-empty summary
 *   - Every registered type has a non-empty summary
 */

import * as assert from "assert/strict";
import { createWorkflow } from "./types";
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

export function buildWorkflow() {
  const wf = createWorkflow("terminal-ui");

  // ---- Namespaces ----------------------------------------------------------

  for (const name of EXPECTED_NAMESPACES) {
    wf.check(`namespace-${name}-is-registered`, () => {
      const all = listNamespaces().map((n) => n.name);
      assert.ok(
        all.includes(name),
        `namespace "${name}" should be registered; got: ${all.join(", ")}`,
      );
    });
  }

  wf.check("all-namespaces-have-non-empty-summary", () => {
    for (const ns of listNamespaces()) {
      assert.ok(
        ns.summary.length > 0,
        `namespace "${ns.name}" has an empty summary`,
      );
    }
  });

  // ---- REPL types ----------------------------------------------------------

  for (const name of EXPECTED_TYPES) {
    wf.check(`type-${name}-is-registered`, () => {
      const all = listTypes().map((t) => t.name);
      assert.ok(
        all.includes(name),
        `type "${name}" should be registered; got: ${all.join(", ")}`,
      );
    });
  }

  wf.check("all-types-have-non-empty-summary", () => {
    for (const t of listTypes()) {
      assert.ok(
        t.summary.length > 0,
        `type "${t.name}" has an empty summary`,
      );
    }
  });

  return wf.build();
}
