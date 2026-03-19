import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { launchApp, waitForReady, sendCommand } from "./helpers";

function createTestWavFile(filePath: string, durationSeconds = 0.2) {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const numChannels = 1;
  const bytesPerSample = 2;
  const dataSize = numSamples * numChannels * bytesPerSample;
  const fileSize = 36 + dataSize;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(fileSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const value = Math.sin(2 * Math.PI * 440 * t);
    const sample = Math.floor(value * 32767);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

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

test.describe("Project workflows", () => {
  const testDir = path.join(__dirname, "../test-results/projects-test");

  test.beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  test("proj.current() starts in default and omits redundant current label", async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-projects-userdata-"));
    const electronApp = await launchApp(userDataDir);
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, "proj.current()");

    await expect(window.locator(".xterm-rows")).toContainText("Current Project", {
      timeout: 5000,
    });
    await expect(window.locator(".xterm-rows")).toContainText("name:      default");
    await expect(window.locator(".xterm-rows")).not.toContainText("current:   yes");

    await electronApp.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test("proj.list() and proj.load() show project creation and scoped sample counts", async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-projects-userdata-"));
    const testFile = path.join(testDir, `project-sample-${Date.now()}.wav`);
    createTestWavFile(testFile, 0.25);

    const electronApp = await launchApp(userDataDir);
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, 'proj.load("drums")');
    await expect(window.locator(".xterm-rows")).toContainText("Loaded Project", {
      timeout: 5000,
    });
    await expect(window.locator(".xterm-rows")).toContainText("name:      drums");

    await sendCommand(window, `sn.read("${testFile}")`);
    await sendCommand(window, "proj.list()");

    await expect(window.locator(".xterm-rows")).toContainText("Projects", {
      timeout: 5000,
    });
    await expect(window.locator(".xterm-rows")).toContainText("drums");
    await expect(window.locator(".xterm-rows")).toContainText("default");

    const projects = await callIpc<
      Array<{ name: string; sample_count: number; current: boolean }>
    >(window, "listProjects");
    const drums = projects.find((project) => project.name === "drums");
    expect(drums?.sample_count).toBe(1);
    expect(drums?.current).toBe(true);

    await electronApp.close();
    fs.unlinkSync(testFile);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test("proj.rm() blocks removing the current project and removes non-current projects", async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bounce-projects-userdata-"));
    const electronApp = await launchApp(userDataDir);
    const window = await electronApp.firstWindow();
    await waitForReady(window);

    await sendCommand(window, 'proj.load("drums")');
    await sendCommand(window, 'proj.rm("drums")');

    await expect(window.locator(".xterm-rows")).toContainText(
      'Cannot remove the current project "drums". Load a different project first.',
      { timeout: 5000 },
    );

    await sendCommand(window, 'proj.load("default")');
    await sendCommand(window, 'proj.rm("drums")');
    await expect(window.locator(".xterm-rows")).toContainText("Removed project drums.", {
      timeout: 5000,
    });

    const projects = await callIpc<Array<{ name: string }>>(window, "listProjects");
    expect(projects.some((project) => project.name === "default")).toBe(true);
    expect(projects.some((project) => project.name === "drums")).toBe(false);

    await electronApp.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });
});
