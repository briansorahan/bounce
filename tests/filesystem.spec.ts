import { test, expect, _electron as electron } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

const electronPath = require("electron") as string;

async function launchApp() {
  return electron.launch({
    executablePath: electronPath,
    args: [
      path.join(__dirname, "../dist/electron/main.js"),
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
  });
}

async function sendCommand(window: any, command: string): Promise<void> {
  await window.evaluate((cmd: string) => {
    const executeCommand = (window as any).__bounceExecuteCommand;
    if (!executeCommand) throw new Error("__bounceExecuteCommand not exposed");
    return executeCommand(cmd);
  }, command);
}

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
  test("fs.pwd() returns an absolute path via REPL", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    const cwd = await callIpc<string>(window, "fsPwd");
    expect(cwd).toMatch(/\/|[A-Za-z]:\\/);

    await electronApp.close();
  });

  test("fs.cd() changes the working directory", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    const tmpDir = os.tmpdir();
    const newCwd = await callIpc<string>(window, "fsCd", tmpDir);
    expect(newCwd).toBe(tmpDir);

    await electronApp.close();
  });

  test("fs.cd() rejects a non-existent path", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

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

    await electronApp.close();
  });

  test("fs.ls() lists directory contents", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    const projectRoot = path.join(__dirname, "..");
    const result = await callIpc<{ entries: Array<{ name: string }>; total: number; truncated: boolean }>(
      window,
      "fsLs",
      projectRoot,
    );

    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.entries.some((e) => e.name === "package.json")).toBe(true);

    await electronApp.close();
  });

  test("fs.ls() hides dotfiles, fs.la() shows them", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    const projectRoot = path.join(__dirname, "..");

    const lsResult = await callIpc<{ entries: Array<{ name: string }> }>(
      window,
      "fsLs",
      projectRoot,
    );
    expect(lsResult.entries.some((e) => e.name === ".github")).toBe(false);

    const laResult = await callIpc<{ entries: Array<{ name: string }> }>(
      window,
      "fsLa",
      projectRoot,
    );
    expect(laResult.entries.some((e) => e.name === ".github")).toBe(true);

    await electronApp.close();
  });

  test("fs.glob() returns matched paths", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    // cd first so glob resolves against project root
    const projectRoot = path.join(__dirname, "..");
    await callIpc(window, "fsCd", projectRoot);

    const paths = await callIpc<string[]>(window, "fsGlob", "*.json");

    expect(Array.isArray(paths)).toBe(true);
    expect(paths.some((p) => p.endsWith("package.json"))).toBe(true);

    await electronApp.close();
  });

  test("fs.walk() returns file entries for a directory", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    const testsDir = path.join(__dirname, "..", "tests");
    const result = await callIpc<{ entries: Array<{ path: string; type: string }>; truncated: boolean }>(
      window,
      "fsWalk",
      testsDir,
    );

    expect(result.truncated).toBe(false);
    const filePaths = result.entries.map((e) => e.path);
    expect(filePaths.some((p) => p.endsWith("filesystem.spec.ts"))).toBe(true);

    await electronApp.close();
  });

  test("fs.walk() entries include correct FileType values", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    const testsDir = path.join(__dirname, "..", "tests");
    const result = await callIpc<{ entries: Array<{ path: string; type: string }> }>(
      window,
      "fsWalk",
      testsDir,
    );

    const types = result.entries.map((e) => e.type);
    expect(types).toContain("file");

    await electronApp.close();
  });

  test("sn.read() resolves relative path against cwd", async () => {
    const srcWav = path.join(
      __dirname,
      "../flucoma-core/Resources/AudioFiles/Tremblay-SlideChoirAdd-M.wav",
    );
    if (!fs.existsSync(srcWav)) {
      console.log("Skipping relative-path sn.read test: test WAV not found");
      return;
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-fs-test-"));
    const destWav = path.join(tmpDir, "test.wav");
    fs.copyFileSync(srcWav, destWav);

    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await sendCommand(window, `fs.cd(${JSON.stringify(tmpDir)})`);
    await sendCommand(window, 'const samp = sn.read("test.wav")');
    await sendCommand(window, "vis.waveform(samp).show()");

    await expect(window.locator(".visualization-scene-waveform-canvas")).toBeVisible({
      timeout: 5000,
    });

    await electronApp.close();
    fs.rmSync(tmpDir, { recursive: true });
  });
});
