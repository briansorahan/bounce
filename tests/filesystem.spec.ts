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

async function evalInWindow<T>(window: any, expression: string): Promise<T> {
  return window.evaluate((expr: string) => {
    const executeCommand = (window as any).__bounceExecuteCommand;
    if (!executeCommand) throw new Error("__bounceExecuteCommand not exposed");
    return executeCommand(expr);
  }, expression);
}

async function getTerminalText(window: any): Promise<string> {
  return window.evaluate(() => {
    const el = document.querySelector(".xterm-rows");
    return el ? el.textContent ?? "" : "";
  });
}

test.describe("Filesystem utilities", () => {
  test("fs.pwd() returns an absolute path", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await evalInWindow(window, "await fs.pwd()");

    const text = await getTerminalText(window);
    // The cwd should look like an absolute path (starts with / on unix, letter:\ on windows)
    expect(text).toMatch(/\/|[A-Za-z]:\\/);

    await electronApp.close();
  });

  test("fs.cd() changes the working directory", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    const tmpDir = os.tmpdir();
    await evalInWindow(window, `await fs.cd(${JSON.stringify(tmpDir)})`);

    await evalInWindow(window, "await fs.pwd()");

    const text = await getTerminalText(window);
    expect(text).toContain(tmpDir);

    await electronApp.close();
  });

  test("fs.cd() rejects a non-existent path", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    let threw = false;
    try {
      await evalInWindow(
        window,
        `await fs.cd("/this/path/does/not/exist/__bounce_test__")`,
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

    // cd to the project root so we know there's something to list
    const projectRoot = path.join(__dirname, "..");
    await evalInWindow(window, `await fs.cd(${JSON.stringify(projectRoot)})`);
    await evalInWindow(window, "await fs.ls()");

    const text = await getTerminalText(window);
    // package.json must appear in the listing
    expect(text).toContain("package.json");

    await electronApp.close();
  });

  test("fs.ls() hides dotfiles, fs.la() shows them", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    const projectRoot = path.join(__dirname, "..");
    await evalInWindow(window, `await fs.cd(${JSON.stringify(projectRoot)})`);

    // .github should be hidden by ls
    await evalInWindow(window, "await fs.ls()");
    const lsText = await getTerminalText(window);
    expect(lsText).not.toContain(".github");

    // .github should be visible with la
    await evalInWindow(window, "await fs.la()");
    const laText = await getTerminalText(window);
    expect(laText).toContain(".github");

    await electronApp.close();
  });

  test("fs.glob() returns matched paths", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    const projectRoot = path.join(__dirname, "..");
    await evalInWindow(window, `await fs.cd(${JSON.stringify(projectRoot)})`);

    // *.json should match package.json at minimum
    const result = await evalInWindow<string[]>(
      window,
      "await fs.glob('*.json')",
    );

    expect(Array.isArray(result)).toBe(true);
    expect((result as string[]).some((p) => p.endsWith("package.json"))).toBe(
      true,
    );

    await electronApp.close();
  });

  test("fs.walk() invokes callback for each file", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    // Walk the tests directory and collect file names
    const testsDir = path.join(__dirname, "..");
    await evalInWindow(
      window,
      `
      var _walkPaths = [];
      await fs.walk(
        ${JSON.stringify(testsDir + "/tests")},
        { [fs.FileType.File]: async (p) => { _walkPaths.push(p); } }
      );
      _walkPaths
      `,
    );

    // At minimum our own spec file should appear
    const text = await getTerminalText(window);
    expect(text).toContain("filesystem.spec.ts");

    await electronApp.close();
  });

  test("fs.walk() with catch-all callback receives all entry types", async () => {
    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    const testsDir = path.join(__dirname);
    await evalInWindow(
      window,
      `
      var _walkTypes = [];
      await fs.walk(
        ${JSON.stringify(testsDir)},
        async (filePath, type) => { _walkTypes.push(type); }
      );
      _walkTypes
      `,
    );

    // Tests directory has only files — type "file" must appear
    const text = await getTerminalText(window);
    expect(text).toContain("file");

    await electronApp.close();
  });

  test("display() resolves relative path against cwd", async () => {
    // Copy a test wav to a temp dir, cd there, then display with a relative name
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-fs-test-"));
    const srcWav = path.join(
      __dirname,
      "../flucoma-core/Resources/AudioFiles/Tremblay-SlideChoirAdd-M.wav",
    );

    if (!fs.existsSync(srcWav)) {
      console.log("Skipping relative-path display test: test WAV not found");
      return;
    }

    const destWav = path.join(tmpDir, "test.wav");
    fs.copyFileSync(srcWav, destWav);

    const electronApp = await launchApp();
    const window = await electronApp.firstWindow();
    await window.waitForTimeout(1000);

    await evalInWindow(window, `await fs.cd(${JSON.stringify(tmpDir)})`);
    await evalInWindow(window, `await display("test.wav")`);

    await expect(window.locator("#waveform-container")).toBeVisible({
      timeout: 5000,
    });

    await electronApp.close();
    fs.rmSync(tmpDir, { recursive: true });
  });
});
