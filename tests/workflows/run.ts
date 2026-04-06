/**
 * Workflow test runner — plain Node.js entry point.
 *
 * Runs via: tsx tests/workflows/run.ts
 *
 * No Electron. No native addons. Services are backed by InMemoryStateStorage
 * so this starts in milliseconds and works in any Node environment.
 */

import { run, printResults } from "./runner";
import { bootServices } from "./helpers";
import { buildWorkflow as buildReadAudioFileWorkflow } from "./read-audio-file.workflow";
import { buildWorkflow as buildProjectsWorkflow } from "./projects.workflow";
import { buildWorkflow as buildListSamplesWorkflow } from "./list-samples.workflow";
import { buildWorkflow as buildFilesystemWorkflow } from "./filesystem.workflow";

async function main() {
  let exitCode = 0;

  const workflows = [
    buildReadAudioFileWorkflow(),
    buildProjectsWorkflow(),
    buildListSamplesWorkflow(),
    buildFilesystemWorkflow(),
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
