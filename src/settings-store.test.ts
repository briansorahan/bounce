import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { test } from "vitest";
import { SettingsStore } from "./electron/settings-store";

// ---------------------------------------------------------------------------
// SettingsStore
// ---------------------------------------------------------------------------

function withTempFile(fn: (filePath: string) => void): void {
  const filePath = path.join(os.tmpdir(), `bounce-settings-test-${Date.now()}.json`);
  try {
    fn(filePath);
  } finally {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  }
}

function testDefaultCwd() {
  withTempFile((settingsPath) => {
    // File does not exist yet — should default to homedir
    const store = new SettingsStore(settingsPath);
    assert.strictEqual(store.getCwd(), os.homedir(), "default cwd is homedir");
    assert.strictEqual(store.getCurrentProjectName(), null, "default project is unset");
  });
}

function testSetCwdPersists() {
  withTempFile((settingsPath) => {
    const store = new SettingsStore(settingsPath);
    const newCwd = os.tmpdir();
    store.setCwd(newCwd);

    // Re-load from the same file to verify persistence
    const store2 = new SettingsStore(settingsPath);
    assert.strictEqual(store2.getCwd(), newCwd, "cwd persists after reload");
  });
}

function testSetCwdUpdatesInMemory() {
  withTempFile((settingsPath) => {
    const store = new SettingsStore(settingsPath);
    store.setCwd(os.tmpdir());
    assert.strictEqual(store.getCwd(), os.tmpdir(), "getCwd reflects setCwd immediately");
  });
}

function testSetCurrentProjectPersists() {
  withTempFile((settingsPath) => {
    const store = new SettingsStore(settingsPath);
    store.setCurrentProjectName("drums");

    const store2 = new SettingsStore(settingsPath);
    assert.strictEqual(
      store2.getCurrentProjectName(),
      "drums",
      "current project persists after reload",
    );
  });
}

function testSetCurrentProjectUpdatesInMemory() {
  withTempFile((settingsPath) => {
    const store = new SettingsStore(settingsPath);
    store.setCurrentProjectName("default");
    assert.strictEqual(
      store.getCurrentProjectName(),
      "default",
      "current project reflects setCurrentProjectName immediately",
    );
  });
}

function testExpandHomeTilde() {
  assert.strictEqual(
    SettingsStore.expandHome("~"),
    os.homedir(),
    "~ expands to homedir",
  );
}

function testExpandHomeTildeSlash() {
  const expanded = SettingsStore.expandHome("~/documents");
  assert.strictEqual(
    expanded,
    path.join(os.homedir(), "documents"),
    "~/documents expands correctly",
  );
}

function testExpandHomeNoTilde() {
  const absolute = "/some/absolute/path";
  assert.strictEqual(
    SettingsStore.expandHome(absolute),
    absolute,
    "absolute path unchanged",
  );
  const relative = "relative/path";
  assert.strictEqual(
    SettingsStore.expandHome(relative),
    relative,
    "relative path unchanged",
  );
}

function testCorruptJsonFallsBackToHomedir() {
  withTempFile((settingsPath) => {
    fs.writeFileSync(settingsPath, "{ this is not valid json }", "utf8");
    const store = new SettingsStore(settingsPath);
    assert.strictEqual(store.getCwd(), os.homedir(), "corrupt JSON falls back to homedir");
  });
}

function testMissingCwdKeyFallsBackToHomedir() {
  withTempFile((settingsPath) => {
    fs.writeFileSync(settingsPath, JSON.stringify({ someOtherKey: "value" }), "utf8");
    const store = new SettingsStore(settingsPath);
    assert.strictEqual(store.getCwd(), os.homedir(), "missing cwd key falls back to homedir");
    assert.strictEqual(
      store.getCurrentProjectName(),
      null,
      "missing currentProjectName falls back to null",
    );
  });
}

test("default cwd", () => { testDefaultCwd(); });
test("setCwd persists", () => { testSetCwdPersists(); });
test("setCwd updates in memory", () => { testSetCwdUpdatesInMemory(); });
test("current project persists", () => { testSetCurrentProjectPersists(); });
test("current project in-memory update", () => { testSetCurrentProjectUpdatesInMemory(); });
test("expandHome tilde", () => { testExpandHomeTilde(); });
test("expandHome tilde slash", () => { testExpandHomeTildeSlash(); });
test("expandHome no tilde", () => { testExpandHomeNoTilde(); });
test("corrupt JSON falls back to homedir", () => { testCorruptJsonFallsBackToHomedir(); });
test("missing cwd key falls back to homedir", () => { testMissingCwdKeyFallsBackToHomedir(); });
