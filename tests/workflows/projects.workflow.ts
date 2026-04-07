/**
 * Workflow: projects
 *
 * Tests the ProjectService project management IPC contract.
 * Corresponds to tests/projects.spec.ts — covers project creation,
 * listing with scoped sample counts, and removal constraints, without
 * any Electron/renderer dependency.
 *
 * Checks:
 *   - getCurrentProject() starts in "default"
 *   - loadProject() creates and activates a new project
 *   - After reading a file in "drums", listProjects() shows drums.sample_count=1
 *   - default project keeps sample_count=0
 *   - removeProject() throws when removing the current project
 *   - removeProject() succeeds when a different project is current
 *   - After removal, "drums" no longer appears in listProjects()
 */

import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { createWorkflow } from "./types";
import { createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { ProjectListEntry } from "../../src/shared/domain-types";

interface Ctx extends WorkflowServices, Record<string, unknown> {
  testDir?: string;
  wavPath?: string;
  projects?: ProjectListEntry[];
}

export function buildWorkflow() {
  const wf = createWorkflow("projects");

  // ---- Setup ----------------------------------------------------------------

  const setup = wf.action("setup", async (_ctx) => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-proj-"));
    const wavPath = path.join(testDir, "test.wav");
    createTestWav(wavPath, 0.2);
    return { testDir, wavPath };
  });

  // ---- Phase 1: verify default project -------------------------------------

  const getDefault = wf.action("get-default-project", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const defaultProject = await ctx.queryService.getCurrentProject();
    return { defaultProject };
  }, { after: [setup] });

  wf.check("default-project-name-is-default", (rawCtx) => {
    const ctx = rawCtx as Ctx & { defaultProject: { name: string } };
    assert.equal(ctx.defaultProject.name, "default");
  }, { after: [getDefault] });

  // ---- Phase 2: load drums, read a file ------------------------------------

  const loadDrums = wf.action("load-drums-project", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const drumsProject = await ctx.projectClient.invoke("loadProject", { name: "drums" });
    return { drumsProject };
  }, { after: [getDefault] });

  wf.check("load-project-returns-drums", (rawCtx) => {
    const ctx = rawCtx as Ctx & { drumsProject: ProjectListEntry };
    assert.equal(ctx.drumsProject.name, "drums");
    assert.equal(ctx.drumsProject.current, true);
  }, { after: [loadDrums] });

  const readFile = wf.action("read-file-in-drums", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.audioFileClient.invoke("readAudioFile", { filePathOrHash: ctx.wavPath! });
    return {};
  }, { after: [loadDrums] });

  const listAfterRead = wf.action("list-projects-after-read", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const projects = await ctx.queryService.listProjects();
    return { projects };
  }, { after: [readFile] });

  wf.check("drums-sample-count-is-1", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const drums = (ctx.projects as ProjectListEntry[]).find((p) => p.name === "drums");
    assert.ok(drums, "drums project should appear in listProjects");
    assert.equal(drums!.sample_count, 1);
  }, { after: [listAfterRead] });

  wf.check("default-sample-count-is-0", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const def = (ctx.projects as ProjectListEntry[]).find((p) => p.name === "default");
    assert.ok(def, "default project should appear in listProjects");
    assert.equal(def!.sample_count, 0);
  }, { after: [listAfterRead] });

  wf.check("drums-is-current-in-list", (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const drums = (ctx.projects as ProjectListEntry[]).find((p) => p.name === "drums");
    assert.equal(drums!.current, true);
  }, { after: [listAfterRead] });

  // ---- Phase 3: cannot-remove-current check (drums still current) ----------
  // This check MUST run before loadDefault switches away from drums.

  wf.check("cannot-remove-current-project", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await assert.rejects(
      ctx.projectClient.invoke("removeProject", { name: "drums" }),
      (err: Error) => {
        assert.ok(
          err.message.includes("Cannot remove the current project"),
          `Expected "Cannot remove the current project" but got: ${err.message}`,
        );
        return true;
      },
    );
  }, { after: [listAfterRead] });

  // ---- Phase 4: switch to default, then remove drums -----------------------

  const loadDefault = wf.action("load-default-project", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.projectClient.invoke("loadProject", { name: "default" });
    return {};
  }, { after: ["cannot-remove-current-project"] });

  const removeDrums = wf.action("remove-drums-project", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const removeResult = await ctx.projectClient.invoke("removeProject", { name: "drums" });
    return { removeResult };
  }, { after: [loadDefault] });

  const listAfterRemove = wf.action("list-projects-after-remove", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const projectsAfterRemove = await ctx.queryService.listProjects();
    return { projectsAfterRemove };
  }, { after: [removeDrums] });

  wf.check("drums-removed-from-list", (rawCtx) => {
    const ctx = rawCtx as Ctx & { projectsAfterRemove: ProjectListEntry[] };
    assert.equal(
      ctx.projectsAfterRemove.some((p) => p.name === "drums"),
      false,
      "drums should not appear after removal",
    );
  }, { after: [listAfterRemove] });

  wf.check("default-still-in-list-after-remove", (rawCtx) => {
    const ctx = rawCtx as Ctx & { projectsAfterRemove: ProjectListEntry[] };
    assert.equal(
      ctx.projectsAfterRemove.some((p) => p.name === "default"),
      true,
      "default project should remain",
    );
  }, { after: [listAfterRemove] });

  // ---- Cleanup -------------------------------------------------------------

  wf.action("cleanup", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    if (ctx.testDir) {
      fs.rmSync(ctx.testDir, { recursive: true, force: true });
    }
    return {};
  }, {
    after: [
      "default-project-name-is-default",
      "load-project-returns-drums",
      "drums-sample-count-is-1",
      "default-sample-count-is-0",
      "drums-is-current-in-list",
      "drums-removed-from-list",
      "default-still-in-list-after-remove",
    ],
  });

  return wf.build();
}
