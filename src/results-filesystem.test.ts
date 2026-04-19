/**
 * Unit tests for src/renderer/results/filesystem.ts
 *
 * No Electron dependency — all classes are pure TypeScript.
 */

/// <reference path="./renderer/types.d.ts" />

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  formatLsEntries,
  LsResult,
  GlobResult,
  LsResultPromise,
  GlobResultPromise,
} from "./renderer/results/filesystem.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(
  name: string,
  type: string,
  isAudio: boolean,
  path = `/${name}`,
): FsLsEntry {
  return { name, path, type, isAudio };
}

function makeLsResult(entries: FsLsEntry[], total?: number, truncated = false): LsResult {
  const t = total ?? entries.length;
  const display = formatLsEntries(entries, truncated, t);
  return new LsResult(display, entries, t, truncated);
}

// ---------------------------------------------------------------------------
// formatLsEntries — directories
// ---------------------------------------------------------------------------

test("formatLsEntries: directory entry gets blue ANSI and trailing slash", () => {
  const output = formatLsEntries([{ name: "sounds", type: "directory", isAudio: false }], false, 1);
  assert.ok(output.includes("\x1b[34m"), "blue escape code present");
  assert.ok(output.includes("sounds/"), "trailing slash appended");
  assert.ok(output.includes("\x1b[0m"), "reset code present");
});

// ---------------------------------------------------------------------------
// formatLsEntries — audio files
// ---------------------------------------------------------------------------

test("formatLsEntries: audio file gets green ANSI", () => {
  const output = formatLsEntries([{ name: "kick.wav", type: "file", isAudio: true }], false, 1);
  assert.ok(output.includes("\x1b[32m"), "green escape code present");
  assert.ok(output.includes("kick.wav"), "filename present");
  assert.ok(output.includes("\x1b[0m"), "reset code present");
  assert.ok(!output.includes("\x1b[34m"), "no blue escape code for audio file");
});

// ---------------------------------------------------------------------------
// formatLsEntries — plain files
// ---------------------------------------------------------------------------

test("formatLsEntries: plain file has no ANSI codes", () => {
  const output = formatLsEntries([{ name: "notes.txt", type: "file", isAudio: false }], false, 1);
  assert.equal(output, "notes.txt", "plain filename with no ANSI codes");
});

// ---------------------------------------------------------------------------
// formatLsEntries — mixed entries join with newline
// ---------------------------------------------------------------------------

test("formatLsEntries: multiple entries separated by newlines", () => {
  const entries = [
    { name: "docs", type: "directory", isAudio: false },
    { name: "beat.wav", type: "file", isAudio: true },
    { name: "readme.txt", type: "file", isAudio: false },
  ];
  const output = formatLsEntries(entries, false, 3);
  const lines = output.split("\n");
  assert.equal(lines.length, 3, "three lines for three entries");
  assert.ok(lines[0].includes("docs/"), "first line is directory");
  assert.ok(lines[1].includes("beat.wav"), "second line is audio file");
  assert.equal(lines[2], "readme.txt", "third line is plain file");
});

// ---------------------------------------------------------------------------
// formatLsEntries — truncation message
// ---------------------------------------------------------------------------

test("formatLsEntries: truncated=true appends yellow '... N more items' line", () => {
  const entries = [{ name: "a.wav", type: "file", isAudio: true }];
  // total=205 → 205 - 200 = 5 more items
  const output = formatLsEntries(entries, true, 205);
  const lines = output.split("\n");
  assert.equal(lines.length, 2, "entry line plus truncation line");
  const lastLine = lines[lines.length - 1];
  assert.ok(lastLine.includes("\x1b[33m"), "yellow escape code on truncation line");
  assert.ok(lastLine.includes("5 more items"), "correct remaining count");
  assert.ok(lastLine.includes("\x1b[0m"), "reset code on truncation line");
});

test("formatLsEntries: truncated=false adds no extra line", () => {
  const entries = [{ name: "a.wav", type: "file", isAudio: true }];
  const output = formatLsEntries(entries, false, 300);
  assert.equal(output.split("\n").length, 1, "no truncation line when not truncated");
});

// ---------------------------------------------------------------------------
// LsResult — constructor and toString
// ---------------------------------------------------------------------------

test("LsResult.toString returns the display string", () => {
  const entries = [makeEntry("kick.wav", "file", true)];
  const r = makeLsResult(entries);
  const text = r.toString();
  assert.ok(text.includes("kick.wav"), "display includes filename");
});

test("LsResult.total and truncated are stored", () => {
  const entries = [makeEntry("a.wav", "file", true)];
  const r = makeLsResult(entries, 999, true);
  assert.equal(r.total, 999, "total stored correctly");
  assert.equal(r.truncated, true, "truncated stored correctly");
});

// ---------------------------------------------------------------------------
// LsResult — length
// ---------------------------------------------------------------------------

test("LsResult.length reflects entry count", () => {
  const entries = [
    makeEntry("a.wav", "file", true),
    makeEntry("b.wav", "file", true),
    makeEntry("src", "directory", false),
  ];
  const r = makeLsResult(entries);
  assert.equal(r.length, 3, "length equals number of entries");
});

test("LsResult.length is 0 for empty list", () => {
  const r = makeLsResult([]);
  assert.equal(r.length, 0, "empty LsResult has length 0");
});

// ---------------------------------------------------------------------------
// LsResult — filter
// ---------------------------------------------------------------------------

test("LsResult.filter returns matching FsLsEntry array", () => {
  const entries = [
    makeEntry("kick.wav", "file", true),
    makeEntry("notes.txt", "file", false),
    makeEntry("snare.wav", "file", true),
  ];
  const r = makeLsResult(entries);
  const audio = r.filter((e) => e.isAudio);
  assert.equal(audio.length, 2, "two audio entries");
  assert.ok(audio.every((e) => e.isAudio), "all filtered entries are audio");
});

test("LsResult.filter returns empty array when nothing matches", () => {
  const r = makeLsResult([makeEntry("readme.txt", "file", false)]);
  const result = r.filter((e) => e.isAudio);
  assert.equal(result.length, 0, "no audio entries found");
});

// ---------------------------------------------------------------------------
// LsResult — map
// ---------------------------------------------------------------------------

test("LsResult.map transforms entries", () => {
  const entries = [
    makeEntry("a.wav", "file", true),
    makeEntry("b.wav", "file", true),
  ];
  const r = makeLsResult(entries);
  const names = r.map((e) => e.name);
  assert.deepEqual(names, ["a.wav", "b.wav"], "map extracts names");
});

// ---------------------------------------------------------------------------
// LsResult — find
// ---------------------------------------------------------------------------

test("LsResult.find returns first matching entry", () => {
  const entries = [
    makeEntry("a.txt", "file", false),
    makeEntry("b.wav", "file", true),
    makeEntry("c.wav", "file", true),
  ];
  const r = makeLsResult(entries);
  const found = r.find((e) => e.isAudio);
  assert.ok(found !== undefined, "found a result");
  assert.equal(found?.name, "b.wav", "returns first match");
});

test("LsResult.find returns undefined when no match", () => {
  const r = makeLsResult([makeEntry("notes.txt", "file", false)]);
  const found = r.find((e) => e.isAudio);
  assert.equal(found, undefined, "undefined when no match");
});

// ---------------------------------------------------------------------------
// LsResult — forEach
// ---------------------------------------------------------------------------

test("LsResult.forEach iterates all entries in order", () => {
  const entries = [
    makeEntry("a.wav", "file", true),
    makeEntry("b.wav", "file", true),
    makeEntry("c.wav", "file", true),
  ];
  const r = makeLsResult(entries);
  const visited: string[] = [];
  r.forEach((e) => visited.push(e.name));
  assert.deepEqual(visited, ["a.wav", "b.wav", "c.wav"], "visits all entries in order");
});

// ---------------------------------------------------------------------------
// LsResult — some
// ---------------------------------------------------------------------------

test("LsResult.some returns true when at least one entry matches", () => {
  const entries = [makeEntry("notes.txt", "file", false), makeEntry("kick.wav", "file", true)];
  const r = makeLsResult(entries);
  assert.ok(r.some((e) => e.isAudio), "some returns true for audio entry");
});

test("LsResult.some returns false when no entry matches", () => {
  const r = makeLsResult([makeEntry("notes.txt", "file", false)]);
  assert.ok(!r.some((e) => e.isAudio), "some returns false when no audio entries");
});

// ---------------------------------------------------------------------------
// LsResult — every
// ---------------------------------------------------------------------------

test("LsResult.every returns true when all entries match", () => {
  const entries = [makeEntry("a.wav", "file", true), makeEntry("b.wav", "file", true)];
  const r = makeLsResult(entries);
  assert.ok(r.every((e) => e.isAudio), "every returns true when all are audio");
});

test("LsResult.every returns false when some entries do not match", () => {
  const entries = [makeEntry("a.wav", "file", true), makeEntry("readme.txt", "file", false)];
  const r = makeLsResult(entries);
  assert.ok(!r.every((e) => e.isAudio), "every returns false when not all are audio");
});

test("LsResult.every returns true for empty array (vacuous truth)", () => {
  const r = makeLsResult([]);
  assert.ok(r.every(() => false), "every returns true for empty entries");
});

// ---------------------------------------------------------------------------
// LsResult — Symbol.iterator
// ---------------------------------------------------------------------------

test("LsResult[Symbol.iterator] yields all entries in order", () => {
  const entries = [
    makeEntry("a.wav", "file", true),
    makeEntry("src", "directory", false),
    makeEntry("b.txt", "file", false),
  ];
  const r = makeLsResult(entries);
  const collected: FsLsEntry[] = [];
  for (const e of r) {
    collected.push(e);
  }
  assert.equal(collected.length, 3, "iterates all entries");
  assert.equal(collected[0].name, "a.wav", "first entry correct");
  assert.equal(collected[1].name, "src", "second entry correct");
  assert.equal(collected[2].name, "b.txt", "third entry correct");
});

// ---------------------------------------------------------------------------
// GlobResult — empty (no matches)
// ---------------------------------------------------------------------------

test("GlobResult (empty) uses no-matches display", () => {
  const r = new GlobResult([]);
  const text = r.toString();
  assert.ok(text.includes("(no matches)"), "empty GlobResult shows no-matches message");
  assert.ok(text.includes("\x1b[90m"), "no-matches message is dimmed (grey)");
  assert.equal(r.length, 0, "length is 0");
});

// ---------------------------------------------------------------------------
// GlobResult — non-empty
// ---------------------------------------------------------------------------

test("GlobResult (non-empty) joins paths with newlines", () => {
  const paths = ["/samples/kick.wav", "/samples/snare.wav"];
  const r = new GlobResult(paths);
  const text = r.toString();
  assert.ok(text.includes("/samples/kick.wav"), "first path present");
  assert.ok(text.includes("/samples/snare.wav"), "second path present");
  assert.ok(text.includes("\n"), "paths separated by newline");
  assert.equal(r.length, 2, "length reflects path count");
});

// ---------------------------------------------------------------------------
// GlobResult — filter
// ---------------------------------------------------------------------------

test("GlobResult.filter returns matching paths", () => {
  const r = new GlobResult(["/a/kick.wav", "/b/snare.aif", "/c/readme.txt"]);
  const wavs = r.filter((p) => p.endsWith(".wav"));
  assert.deepEqual(wavs, ["/a/kick.wav"], "only .wav paths returned");
});

// ---------------------------------------------------------------------------
// GlobResult — map
// ---------------------------------------------------------------------------

test("GlobResult.map transforms paths", () => {
  const r = new GlobResult(["/a/kick.wav", "/a/snare.wav"]);
  const names = r.map((p) => p.split("/").pop()!);
  assert.deepEqual(names, ["kick.wav", "snare.wav"], "map extracts filenames");
});

// ---------------------------------------------------------------------------
// GlobResult — find
// ---------------------------------------------------------------------------

test("GlobResult.find returns first matching path", () => {
  const r = new GlobResult(["/a/readme.txt", "/b/kick.wav", "/c/snare.wav"]);
  const found = r.find((p) => p.endsWith(".wav"));
  assert.equal(found, "/b/kick.wav", "finds first .wav path");
});

test("GlobResult.find returns undefined when no match", () => {
  const r = new GlobResult(["/a/readme.txt"]);
  assert.equal(r.find((p) => p.endsWith(".wav")), undefined, "undefined when no match");
});

// ---------------------------------------------------------------------------
// GlobResult — forEach
// ---------------------------------------------------------------------------

test("GlobResult.forEach iterates all paths", () => {
  const paths = ["/a.wav", "/b.wav"];
  const r = new GlobResult(paths);
  const visited: string[] = [];
  r.forEach((p) => visited.push(p));
  assert.deepEqual(visited, paths, "forEach visits all paths in order");
});

// ---------------------------------------------------------------------------
// GlobResult — some
// ---------------------------------------------------------------------------

test("GlobResult.some returns true when at least one path matches", () => {
  const r = new GlobResult(["/a/readme.txt", "/b/kick.wav"]);
  assert.ok(r.some((p) => p.endsWith(".wav")), "some returns true");
});

test("GlobResult.some returns false when no paths match", () => {
  const r = new GlobResult(["/a/readme.txt"]);
  assert.ok(!r.some((p) => p.endsWith(".wav")), "some returns false");
});

// ---------------------------------------------------------------------------
// GlobResult — every
// ---------------------------------------------------------------------------

test("GlobResult.every returns true when all paths match", () => {
  const r = new GlobResult(["/a.wav", "/b.wav"]);
  assert.ok(r.every((p) => p.endsWith(".wav")), "every returns true");
});

test("GlobResult.every returns false when some paths do not match", () => {
  const r = new GlobResult(["/a.wav", "/b.txt"]);
  assert.ok(!r.every((p) => p.endsWith(".wav")), "every returns false");
});

// ---------------------------------------------------------------------------
// GlobResult — Symbol.iterator
// ---------------------------------------------------------------------------

test("GlobResult[Symbol.iterator] yields all paths in order", () => {
  const paths = ["/a/kick.wav", "/b/snare.wav", "/c/hat.wav"];
  const r = new GlobResult(paths);
  const collected: string[] = [];
  for (const p of r) {
    collected.push(p);
  }
  assert.deepEqual(collected, paths, "iterator yields all paths in order");
});

// ---------------------------------------------------------------------------
// LsResultPromise — then (resolves to LsResult)
// ---------------------------------------------------------------------------

test("LsResultPromise.then resolves with LsResult", async () => {
  const entries = [makeEntry("kick.wav", "file", true)];
  const inner = makeLsResult(entries);
  const p = new LsResultPromise(Promise.resolve(inner));
  const result = await p.then((r) => r);
  assert.ok(result instanceof LsResult, "resolves with LsResult instance");
  assert.equal(result.length, 1, "correct entry count");
});

// ---------------------------------------------------------------------------
// LsResultPromise — catch (handles rejection)
// ---------------------------------------------------------------------------

test("LsResultPromise.catch handles rejected promise", async () => {
  const rejected = Promise.reject(new Error("disk error")) as Promise<LsResult>;
  const p = new LsResultPromise(rejected);
  let caughtMessage = "";
  await p.catch((err: unknown) => {
    if (err instanceof Error) caughtMessage = err.message;
  });
  assert.equal(caughtMessage, "disk error", "catch receives rejection reason");
});

// ---------------------------------------------------------------------------
// LsResultPromise — filter (creates new LsResultPromise → LsResult)
// ---------------------------------------------------------------------------

test("LsResultPromise.filter returns a new LsResultPromise with filtered entries", async () => {
  const entries = [
    makeEntry("kick.wav", "file", true),
    makeEntry("notes.txt", "file", false),
    makeEntry("snare.wav", "file", true),
  ];
  const inner = makeLsResult(entries, 3);
  const p = new LsResultPromise(Promise.resolve(inner));
  const filtered = await p.filter((e) => e.isAudio);
  assert.ok(filtered instanceof LsResult, "filter resolves to LsResult");
  assert.equal(filtered.length, 2, "two audio entries after filter");
  assert.ok(filtered.entries.every((e) => e.isAudio), "all entries are audio");
  assert.equal(filtered.truncated, false, "filtered result is not truncated");
});

test("LsResultPromise.filter returns LsResultPromise (chainable)", () => {
  const entries = [makeEntry("kick.wav", "file", true)];
  const inner = makeLsResult(entries);
  const p = new LsResultPromise(Promise.resolve(inner));
  const chainedPromise = p.filter((e) => e.isAudio);
  assert.ok(chainedPromise instanceof LsResultPromise, "filter returns LsResultPromise");
});

// ---------------------------------------------------------------------------
// LsResultPromise — map
// ---------------------------------------------------------------------------

test("LsResultPromise.map transforms entries", async () => {
  const entries = [makeEntry("a.wav", "file", true), makeEntry("b.wav", "file", true)];
  const p = new LsResultPromise(Promise.resolve(makeLsResult(entries)));
  const names = await p.map((e) => e.name);
  assert.deepEqual(names, ["a.wav", "b.wav"], "map extracts names");
});

// ---------------------------------------------------------------------------
// LsResultPromise — find
// ---------------------------------------------------------------------------

test("LsResultPromise.find resolves with matching entry", async () => {
  const entries = [makeEntry("notes.txt", "file", false), makeEntry("kick.wav", "file", true)];
  const p = new LsResultPromise(Promise.resolve(makeLsResult(entries)));
  const found = await p.find((e) => e.isAudio);
  assert.ok(found !== undefined, "found an entry");
  assert.equal(found?.name, "kick.wav", "correct entry found");
});

test("LsResultPromise.find resolves with undefined when no match", async () => {
  const entries = [makeEntry("notes.txt", "file", false)];
  const p = new LsResultPromise(Promise.resolve(makeLsResult(entries)));
  const found = await p.find((e) => e.isAudio);
  assert.equal(found, undefined, "undefined when no match");
});

// ---------------------------------------------------------------------------
// LsResultPromise — forEach
// ---------------------------------------------------------------------------

test("LsResultPromise.forEach iterates all entries", async () => {
  const entries = [makeEntry("a.wav", "file", true), makeEntry("b.wav", "file", true)];
  const p = new LsResultPromise(Promise.resolve(makeLsResult(entries)));
  const visited: string[] = [];
  await p.forEach((e) => visited.push(e.name));
  assert.deepEqual(visited, ["a.wav", "b.wav"], "all entries visited in order");
});

// ---------------------------------------------------------------------------
// LsResultPromise — some
// ---------------------------------------------------------------------------

test("LsResultPromise.some resolves true when at least one matches", async () => {
  const entries = [makeEntry("readme.txt", "file", false), makeEntry("kick.wav", "file", true)];
  const p = new LsResultPromise(Promise.resolve(makeLsResult(entries)));
  assert.ok(await p.some((e) => e.isAudio), "some resolves true");
});

test("LsResultPromise.some resolves false when none match", async () => {
  const entries = [makeEntry("readme.txt", "file", false)];
  const p = new LsResultPromise(Promise.resolve(makeLsResult(entries)));
  assert.ok(!(await p.some((e) => e.isAudio)), "some resolves false");
});

// ---------------------------------------------------------------------------
// LsResultPromise — every
// ---------------------------------------------------------------------------

test("LsResultPromise.every resolves true when all match", async () => {
  const entries = [makeEntry("a.wav", "file", true), makeEntry("b.wav", "file", true)];
  const p = new LsResultPromise(Promise.resolve(makeLsResult(entries)));
  assert.ok(await p.every((e) => e.isAudio), "every resolves true");
});

test("LsResultPromise.every resolves false when some do not match", async () => {
  const entries = [makeEntry("a.wav", "file", true), makeEntry("b.txt", "file", false)];
  const p = new LsResultPromise(Promise.resolve(makeLsResult(entries)));
  assert.ok(!(await p.every((e) => e.isAudio)), "every resolves false");
});

// ---------------------------------------------------------------------------
// GlobResultPromise — then (resolves to GlobResult)
// ---------------------------------------------------------------------------

test("GlobResultPromise.then resolves with GlobResult", async () => {
  const inner = new GlobResult(["/a/kick.wav", "/b/snare.wav"]);
  const p = new GlobResultPromise(Promise.resolve(inner));
  const result = await p.then((r) => r);
  assert.ok(result instanceof GlobResult, "resolves with GlobResult");
  assert.equal(result.length, 2, "correct path count");
});

// ---------------------------------------------------------------------------
// GlobResultPromise — catch (handles rejection)
// ---------------------------------------------------------------------------

test("GlobResultPromise.catch handles rejected promise", async () => {
  const rejected = Promise.reject(new Error("glob error")) as Promise<GlobResult>;
  const p = new GlobResultPromise(rejected);
  let caughtMessage = "";
  await p.catch((err: unknown) => {
    if (err instanceof Error) caughtMessage = err.message;
  });
  assert.equal(caughtMessage, "glob error", "catch receives rejection reason");
});

// ---------------------------------------------------------------------------
// GlobResultPromise — filter (creates new GlobResultPromise → GlobResult)
// ---------------------------------------------------------------------------

test("GlobResultPromise.filter returns new GlobResultPromise with filtered paths", async () => {
  const inner = new GlobResult(["/a/kick.wav", "/b/readme.txt", "/c/snare.wav"]);
  const p = new GlobResultPromise(Promise.resolve(inner));
  const filtered = await p.filter((path) => path.endsWith(".wav"));
  assert.ok(filtered instanceof GlobResult, "filter resolves to GlobResult");
  assert.equal(filtered.length, 2, "two .wav paths remain");
  assert.ok(filtered.paths.every((path) => path.endsWith(".wav")), "all paths end in .wav");
});

test("GlobResultPromise.filter returns GlobResultPromise (chainable)", () => {
  const inner = new GlobResult(["/a/kick.wav"]);
  const p = new GlobResultPromise(Promise.resolve(inner));
  const chained = p.filter((path) => path.endsWith(".wav"));
  assert.ok(chained instanceof GlobResultPromise, "filter returns GlobResultPromise");
});

test("GlobResultPromise.filter with empty result shows no-matches display", async () => {
  const inner = new GlobResult(["/a/notes.txt"]);
  const p = new GlobResultPromise(Promise.resolve(inner));
  const filtered = await p.filter((path) => path.endsWith(".wav"));
  assert.ok(filtered instanceof GlobResult, "resolves to GlobResult");
  assert.equal(filtered.length, 0, "empty after filtering");
  assert.ok(filtered.toString().includes("(no matches)"), "empty GlobResult shows no-matches");
});

// ---------------------------------------------------------------------------
// GlobResultPromise — map
// ---------------------------------------------------------------------------

test("GlobResultPromise.map transforms paths", async () => {
  const inner = new GlobResult(["/samples/kick.wav", "/samples/snare.wav"]);
  const p = new GlobResultPromise(Promise.resolve(inner));
  const names = await p.map((path) => path.split("/").pop()!);
  assert.deepEqual(names, ["kick.wav", "snare.wav"], "map extracts filenames");
});

// ---------------------------------------------------------------------------
// GlobResultPromise — find
// ---------------------------------------------------------------------------

test("GlobResultPromise.find resolves with matching path", async () => {
  const inner = new GlobResult(["/a/readme.txt", "/b/kick.wav"]);
  const p = new GlobResultPromise(Promise.resolve(inner));
  const found = await p.find((path) => path.endsWith(".wav"));
  assert.equal(found, "/b/kick.wav", "correct path found");
});

test("GlobResultPromise.find resolves with undefined when no match", async () => {
  const inner = new GlobResult(["/a/readme.txt"]);
  const p = new GlobResultPromise(Promise.resolve(inner));
  const found = await p.find((path) => path.endsWith(".wav"));
  assert.equal(found, undefined, "undefined when no match");
});

// ---------------------------------------------------------------------------
// GlobResultPromise — forEach
// ---------------------------------------------------------------------------

test("GlobResultPromise.forEach iterates all paths", async () => {
  const paths = ["/a.wav", "/b.wav", "/c.wav"];
  const p = new GlobResultPromise(Promise.resolve(new GlobResult(paths)));
  const visited: string[] = [];
  await p.forEach((path) => visited.push(path));
  assert.deepEqual(visited, paths, "all paths visited in order");
});

// ---------------------------------------------------------------------------
// GlobResultPromise — some
// ---------------------------------------------------------------------------

test("GlobResultPromise.some resolves true when at least one path matches", async () => {
  const p = new GlobResultPromise(Promise.resolve(new GlobResult(["/a/readme.txt", "/b/kick.wav"])));
  assert.ok(await p.some((path) => path.endsWith(".wav")), "some resolves true");
});

test("GlobResultPromise.some resolves false when no paths match", async () => {
  const p = new GlobResultPromise(Promise.resolve(new GlobResult(["/a/readme.txt"])));
  assert.ok(!(await p.some((path) => path.endsWith(".wav"))), "some resolves false");
});

// ---------------------------------------------------------------------------
// GlobResultPromise — every
// ---------------------------------------------------------------------------

test("GlobResultPromise.every resolves true when all paths match", async () => {
  const p = new GlobResultPromise(Promise.resolve(new GlobResult(["/a.wav", "/b.wav"])));
  assert.ok(await p.every((path) => path.endsWith(".wav")), "every resolves true");
});

test("GlobResultPromise.every resolves false when some paths do not match", async () => {
  const p = new GlobResultPromise(Promise.resolve(new GlobResult(["/a.wav", "/b.txt"])));
  assert.ok(!(await p.every((path) => path.endsWith(".wav"))), "every resolves false");
});
