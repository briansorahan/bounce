import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { bootServices, createTestWav } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { ProjectListEntry } from "../../src/shared/domain-types";

describe("projects", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let testDir: string;
  let wavPath: string;
  let defaultProject: { name: string };
  let drumsProject: ProjectListEntry;
  let projects: ProjectListEntry[];
  let projectsAfterRemove: ProjectListEntry[];

  beforeAll(() => {
    const booted = bootServices();
    services = booted.ctx;
    cleanup = booted.cleanup;
  });

  afterAll(() => {
    if (testDir) fs.rmSync(testDir, { recursive: true, force: true });
    cleanup?.();
  });

  it("setup", () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-wf-proj-"));
    wavPath = path.join(testDir, "test.wav");
    createTestWav(wavPath, 0.2);
  });

  it("get-default-project", async () => {
    defaultProject = await services.queryService.getCurrentProject();
  });

  it("default-project-name-is-default", () => {
    assert.equal(defaultProject.name, "default");
  });

  it("load-drums-project", async () => {
    drumsProject = await services.projectClient.invoke("loadProject", { name: "drums" });
  });

  it("load-project-returns-drums", () => {
    assert.equal(drumsProject.name, "drums");
    assert.equal(drumsProject.current, true);
  });

  it("read-file-in-drums", async () => {
    await services.audioFileClient.invoke("readAudioFile", { filePathOrHash: wavPath });
  });

  it("list-projects-after-read", async () => {
    projects = await services.queryService.listProjects();
  });

  it("drums-sample-count-is-1", () => {
    const drums = projects.find((p) => p.name === "drums");
    assert.ok(drums, "drums project should appear in listProjects");
    assert.equal(drums!.sample_count, 1);
  });

  it("default-sample-count-is-0", () => {
    const def = projects.find((p) => p.name === "default");
    assert.ok(def, "default project should appear in listProjects");
    assert.equal(def!.sample_count, 0);
  });

  it("drums-is-current-in-list", () => {
    const drums = projects.find((p) => p.name === "drums");
    assert.equal(drums!.current, true);
  });

  it("cannot-remove-current-project", async () => {
    await assert.rejects(
      services.projectClient.invoke("removeProject", { name: "drums" }),
      (err: Error) => {
        assert.ok(
          err.message.includes("Cannot remove the current project"),
          `Expected "Cannot remove the current project" but got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("load-default-project", async () => {
    await services.projectClient.invoke("loadProject", { name: "default" });
  });

  it("remove-drums-project", async () => {
    await services.projectClient.invoke("removeProject", { name: "drums" });
  });

  it("list-projects-after-remove", async () => {
    projectsAfterRemove = await services.queryService.listProjects();
  });

  it("drums-removed-from-list", () => {
    assert.equal(
      projectsAfterRemove.some((p) => p.name === "drums"),
      false,
      "drums should not appear after removal",
    );
  });

  it("default-still-in-list-after-remove", () => {
    assert.equal(
      projectsAfterRemove.some((p) => p.name === "default"),
      true,
      "default project should remain",
    );
  });
});
