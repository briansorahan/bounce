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

async function main() {
  const { ctx, cleanup } = bootServices();
  let exitCode = 0;

  try {
    console.log("\nBounce workflow tests\n");

    const workflows = [
      buildReadAudioFileWorkflow(),
      // Register new workflows here as they are created.
    ];

    for (const workflow of workflows) {
      const results = await run(workflow, ctx as Record<string, unknown>);
      if (!printResults(workflow.name, results)) exitCode = 1;
    }
  } catch (err) {
    console.error("Unexpected error during workflow run:", err);
    exitCode = 1;
  } finally {
    cleanup();
  }

  process.exit(exitCode);
}

main();
