import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
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
    console.log("  default cwd: passed");
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
    console.log("  setCwd persists: passed");
  });
}

function testSetCwdUpdatesInMemory() {
  withTempFile((settingsPath) => {
    const store = new SettingsStore(settingsPath);
    store.setCwd(os.tmpdir());
    assert.strictEqual(store.getCwd(), os.tmpdir(), "getCwd reflects setCwd immediately");
    console.log("  setCwd in-memory update: passed");
  });
}

function testExpandHomeTilde() {
  assert.strictEqual(
    SettingsStore.expandHome("~"),
    os.homedir(),
    "~ expands to homedir",
  );
  console.log("  expandHome('~'): passed");
}

function testExpandHomeTildeSlash() {
  const expanded = SettingsStore.expandHome("~/documents");
  assert.strictEqual(
    expanded,
    path.join(os.homedir(), "documents"),
    "~/documents expands correctly",
  );
  console.log("  expandHome('~/documents'): passed");
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
  console.log("  expandHome (no tilde): passed");
}

function testCorruptJsonFallsBackToHomedir() {
  withTempFile((settingsPath) => {
    fs.writeFileSync(settingsPath, "{ this is not valid json }", "utf8");
    const store = new SettingsStore(settingsPath);
    assert.strictEqual(store.getCwd(), os.homedir(), "corrupt JSON falls back to homedir");
    console.log("  corrupt JSON fallback: passed");
  });
}

function testMissingCwdKeyFallsBackToHomedir() {
  withTempFile((settingsPath) => {
    fs.writeFileSync(settingsPath, JSON.stringify({ someOtherKey: "value" }), "utf8");
    const store = new SettingsStore(settingsPath);
    assert.strictEqual(store.getCwd(), os.homedir(), "missing cwd key falls back to homedir");
    console.log("  missing cwd key fallback: passed");
  });
}

async function runAll() {
  console.log("SettingsStore tests:");
  testDefaultCwd();
  testSetCwdPersists();
  testSetCwdUpdatesInMemory();
  testExpandHomeTilde();
  testExpandHomeTildeSlash();
  testExpandHomeNoTilde();
  testCorruptJsonFallsBackToHomedir();
  testMissingCwdKeyFallsBackToHomedir();
  console.log("All SettingsStore tests passed.\n");
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
