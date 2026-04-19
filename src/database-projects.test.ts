import assert from "node:assert/strict";
import { test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseManager } from "./electron/database";

function withTempDb(fn: (dbPath: string) => void): void {
  const dbPath = path.join(os.tmpdir(), `bounce-projects-${Date.now()}-${Math.random()}.db`);
  try {
    fn(dbPath);
  } finally {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // ignore cleanup failures
    }
  }
}

test("database projects", () => {
  withTempDb((dbPath) => {
    const db = new DatabaseManager(dbPath);

    assert.equal(db.getCurrentProject().name, "default", "default project is auto-created");

    db.storeRawSample("sharedhash", "/default.wav", 44100, 1, 0.001);
    db.storeFeature("sharedhash", "onset-slice", [0, 1, 2]);
    db.addCommand("sn.read('/default.wav')");

    const defaultHistory = db.getCommandHistory();
    assert.deepEqual(defaultHistory, ["sn.read('/default.wav')"], "default history is scoped");

    db.loadOrCreateProject("drums");
    assert.equal(db.getCurrentProject().name, "drums", "loadOrCreateProject switches current project");
    assert.equal(db.getCommandHistory().length, 0, "new project starts with empty history");

    db.storeRawSample("sharedhash", "/drums.wav", 48000, 1, 0.001);
    db.storeFeature("sharedhash", "nmf", [1, 2, 3]);
    db.addCommand("proj.load('drums')");

    const drumsSample = db.getSampleByHash("sharedhash");
    assert.equal(drumsSample?.sample_rate, 48000, "same hash can exist in another project");
    assert.deepEqual(db.getCommandHistory(), ["proj.load('drums')"], "history remains project-scoped");

    db.setCurrentProjectByName("default");
    const defaultSample = db.getSampleByHash("sharedhash");
    assert.equal(defaultSample?.sample_rate, 44100, "switching project swaps sample namespace");
    assert.deepEqual(db.getCommandHistory(), defaultHistory, "switching back restores default history");

    const listed = db.listProjects();
    const defaultProject = listed.find((project) => project.name === "default");
    const drumsProject = listed.find((project) => project.name === "drums");
    assert.equal(defaultProject?.sample_count, 1, "default project sample count is tracked");
    assert.equal(drumsProject?.feature_count, 1, "drums project feature count is tracked");

    db.setCurrentProjectByName("drums");
    assert.throws(
      () => db.removeProject("drums"),
      /Cannot remove the current project/,
      "current project removal is blocked",
    );
    db.setCurrentProjectByName("default");
    const stillCurrent = db.removeProject("drums");
    assert.equal(stillCurrent.name, "default", "removing another project preserves current project");
    assert.equal(db.getCurrentProjectName(), "default", "current project stays unchanged");
    assert.equal(
      db.listProjects().some((project) => project.name === "drums"),
      false,
      "removed project disappears from the project list",
    );

    db.close();
  });
});
