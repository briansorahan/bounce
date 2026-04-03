import { test, expect } from "./fixtures";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

/** Call a window.electron IPC method directly, bypassing the REPL. */
async function callIpc<T>(
  window: any,
  method: string,
  ...args: unknown[]
): Promise<T> {
  return window.evaluate(
    ({ m, a }: { m: string; a: unknown[] }) =>
      (window.electron as Record<string, (...x: unknown[]) => Promise<T>>)[m](...a),
    { m: method, a: args },
  );
}

async function getTerminalText(window: any): Promise<string> {
  return window.evaluate(() => {
    const el = document.querySelector(".xterm-rows");
    return el ? el.textContent ?? "" : "";
  });
}

test.describe("Filesystem utilities", () => {
  test("fs.pwd() returns an absolute path via REPL", async ({ window }) => {
    const cwd = await callIpc<string>(window, "fsPwd");
    expect(cwd).toMatch(/\/|[A-Za-z]:\\/);
  });

  test("fs.cd() changes the working directory", async ({ window }) => {
    const tmpDir = os.tmpdir();
    const newCwd = await callIpc<string>(window, "fsCd", tmpDir);
    expect(newCwd).toBe(tmpDir);
  });

  test("fs.cd() rejects a non-existent path", async ({ window }) => {
    let threw = false;
    try {
      await callIpc(
        window,
        "fsCd",
        "/this/path/does/not/exist/__bounce_test__",
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test("fs.ls() lists directory contents", async ({ window }) => {
    const projectRoot = path.join(__dirname, "..");
    const result = await callIpc<{ entries: Array<{ name: string }>; total: number; truncated: boolean }>(
      window,
      "fsLs",
      projectRoot,
    );

    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.entries.some((e) => e.name === "package.json")).toBe(true);
  });

  test("fs.ls() hides dotfiles, fs.la() shows them", async ({ window }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-dotfiles-test-"));
    fs.writeFileSync(path.join(tmpDir, "visible.txt"), "");
    fs.mkdirSync(path.join(tmpDir, ".hidden"));

    try {
      const lsResult = await callIpc<{ entries: Array<{ name: string }> }>(
        window,
        "fsLs",
        tmpDir,
      );
      expect(lsResult.entries.some((e) => e.name === ".hidden")).toBe(false);

      const laResult = await callIpc<{ entries: Array<{ name: string }> }>(
        window,
        "fsLa",
        tmpDir,
      );
      expect(laResult.entries.some((e) => e.name === ".hidden")).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test("fs.glob() returns matched paths", async ({ window }) => {
    // cd first so glob resolves against project root
    const projectRoot = path.join(__dirname, "..");
    await callIpc(window, "fsCd", projectRoot);

    const paths = await callIpc<string[]>(window, "fsGlob", "*.json");

    expect(Array.isArray(paths)).toBe(true);
    expect(paths.some((p) => p.endsWith("package.json"))).toBe(true);
  });

  test("fs.walk() returns file entries for a directory", async ({ window }) => {
    const testsDir = path.join(__dirname, "..", "tests");
    const result = await callIpc<{ entries: Array<{ path: string; type: string }>; truncated: boolean }>(
      window,
      "fsWalk",
      testsDir,
    );

    expect(result.truncated).toBe(false);
    const filePaths = result.entries.map((e) => e.path);
    expect(filePaths.some((p) => p.endsWith("filesystem.spec.ts"))).toBe(true);
  });

  test("fs.walk() entries include correct FileType values", async ({ window }) => {
    const testsDir = path.join(__dirname, "..", "tests");
    const result = await callIpc<{ entries: Array<{ path: string; type: string }> }>(
      window,
      "fsWalk",
      testsDir,
    );

    const types = result.entries.map((e) => e.type);
    expect(types).toContain("file");
  });

  test("sn.read() resolves relative path against cwd", async ({ window, sendCommand }) => {
    const srcWav = path.join(
      __dirname,
      "../third_party/flucoma-core/Resources/AudioFiles/Tremblay-SlideChoirAdd-M.wav",
    );
    if (!fs.existsSync(srcWav)) {
      console.log("Skipping relative-path sn.read test: test WAV not found");
      return;
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-fs-test-"));
    const destWav = path.join(tmpDir, "test.wav");
    fs.copyFileSync(srcWav, destWav);

    await sendCommand(`fs.cd(${JSON.stringify(tmpDir)})`);
    await sendCommand('const samp = sn.read("test.wav")');
    await sendCommand("vis.waveform(samp).show()");

    await expect(window.locator(".visualization-scene-waveform-canvas")).toBeVisible({
      timeout: 5000,
    });

    fs.rmSync(tmpDir, { recursive: true });
  });
});
