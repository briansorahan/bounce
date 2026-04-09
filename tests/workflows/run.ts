/**
 * Workflow test runner — plain Node.js entry point.
 *
 * Runs via: tsx tests/workflows/run.ts
 *
 * No Electron. No native addons. Services are backed by InMemoryStore +
 * EventBusImpl so this starts in milliseconds and works in any Node environment.
 */

import { run, printResults } from "./runner";
import { bootServices } from "./helpers";
import { buildWorkflow as buildReadAudioFileWorkflow } from "./read-audio-file.workflow";
import { buildWorkflow as buildProjectsWorkflow } from "./projects.workflow";
import { buildWorkflow as buildListSamplesWorkflow } from "./list-samples.workflow";
import { buildWorkflow as buildFilesystemWorkflow } from "./filesystem.workflow";
import { buildWorkflow as buildAudioFormatsWorkflow } from "./audio-formats.workflow";
import { buildWorkflow as buildTabCompletionWorkflow } from "./tab-completion.workflow";
import { buildWorkflow as buildRuntimePersistenceWorkflow } from "./runtime-persistence.workflow";
import { buildWorkflow as buildInstrumentWorkflow } from "./instrument.workflow";
import { buildWorkflow as buildMidiWorkflow } from "./midi.workflow";
import { buildWorkflow as buildMixerWorkflow } from "./mixer.workflow";
import { buildWorkflow as buildOnsetAnalysisWorkflow } from "./onset-analysis.workflow";
import { buildWorkflow as buildNmfAnalysisWorkflow } from "./nmf-analysis.workflow";
import { buildWorkflow as buildNmfSeparationWorkflow } from "./nmf-separation.workflow";
import { buildWorkflow as buildNmfComponentContextWorkflow } from "./nmf-component-context.workflow";
import { buildWorkflow as buildNxBasicWorkflow } from "./nx-basic.workflow";
import { buildWorkflow as buildNxCrossSynthesisWorkflow } from "./nx-cross-synthesis.workflow";
import { buildWorkflow as buildPlaybackWorkflow } from "./playback.workflow";
import { buildWorkflow as buildTransportPatternWorkflow } from "./transport-pattern.workflow";
import { buildWorkflow as buildGranularInstrumentWorkflow } from "./granular-instrument.workflow";
import { buildWorkflow as buildGranularizeWorkflow } from "./granularize.workflow";
import { buildWorkflow as buildCommandsWorkflow } from "./commands.workflow";
import { buildWorkflow as buildPlayComponentThenPlayFullWorkflow } from "./play-component-then-play-full.workflow";

async function main() {
  let exitCode = 0;

  const workflows = [
    buildReadAudioFileWorkflow(),
    buildProjectsWorkflow(),
    buildListSamplesWorkflow(),
    buildFilesystemWorkflow(),
    buildAudioFormatsWorkflow(),
    buildTabCompletionWorkflow(),
    buildRuntimePersistenceWorkflow(),
    buildInstrumentWorkflow(),
    buildMidiWorkflow(),
    buildMixerWorkflow(),
    buildOnsetAnalysisWorkflow(),
    buildNmfAnalysisWorkflow(),
    buildNmfSeparationWorkflow(),
    buildNmfComponentContextWorkflow(),
    buildNxBasicWorkflow(),
    buildNxCrossSynthesisWorkflow(),
    buildPlaybackWorkflow(),
    buildTransportPatternWorkflow(),
    buildGranularInstrumentWorkflow(),
    buildGranularizeWorkflow(),
    buildCommandsWorkflow(),
    buildPlayComponentThenPlayFullWorkflow(),
    // Register new workflows here as they are created.
  ];

  console.log("\nBounce workflow tests\n");

  for (const workflow of workflows) {
    const { ctx, cleanup } = bootServices();
    try {
      const results = await run(workflow, ctx as Record<string, unknown>);
      if (!printResults(workflow.name, results)) exitCode = 1;
    } catch (err) {
      console.error(`Unexpected error during workflow "${workflow.name}":`, err);
      exitCode = 1;
    } finally {
      cleanup();
    }
  }

  process.exit(exitCode);
}

main();
