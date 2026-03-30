import assert from "node:assert/strict";
import {
  type CommandHelp,
  renderNamespaceHelp,
  renderCommandHelp,
  withHelp,
} from "./renderer/help.js";

// --- renderNamespaceHelp ---

{
  const commands: CommandHelp[] = [
    { name: "foo", signature: "ns.foo(x)", summary: "Do foo things" },
    { name: "bar", signature: "ns.bar()", summary: "Do bar things" },
  ];
  const result = renderNamespaceHelp("ns", "Test namespace", commands);
  const text = result.toString();

  assert.ok(text.includes("ns"), "namespace name appears in help");
  assert.ok(text.includes("Test namespace"), "namespace description appears");
  assert.ok(text.includes("ns.foo(x)"), "foo signature appears");
  assert.ok(text.includes("Do foo things"), "foo summary appears");
  assert.ok(text.includes("ns.bar()"), "bar signature appears");
  assert.ok(text.includes("Do bar things"), "bar summary appears");
  assert.ok(text.includes("ns.<cmd>.help()"), "footer mentions per-command help");
}

// --- renderCommandHelp ---

{
  const cmd: CommandHelp = {
    name: "read",
    signature: "sn.read(path)",
    summary: "Load an audio file",
    description: "Load an audio file from disk and return a Sample object.",
    params: [
      { name: "path", type: "string", description: "File path", optional: false },
    ],
    examples: ['sn.read("kick.wav")', 'sn.read("~/samples/loop.flac")'],
  };
  const result = renderCommandHelp(cmd);
  const text = result.toString();

  assert.ok(text.includes("sn.read(path)"), "signature appears");
  assert.ok(text.includes("Load an audio file from disk"), "description appears");
  assert.ok(text.includes("path"), "param name appears");
  assert.ok(text.includes("File path"), "param description appears");
  assert.ok(text.includes('sn.read("kick.wav")'), "example appears");
}

// --- renderCommandHelp with minimal fields ---

{
  const cmd: CommandHelp = {
    name: "stop",
    signature: "transport.stop()",
    summary: "Stop the clock",
  };
  const result = renderCommandHelp(cmd);
  const text = result.toString();

  assert.ok(text.includes("transport.stop()"), "signature appears");
  assert.ok(text.includes("Stop the clock"), "summary used as description");
  assert.ok(!text.includes("Examples"), "no examples section when none provided");
}

// --- renderCommandHelp with optional params ---

{
  const cmd: CommandHelp = {
    name: "bpm",
    signature: "transport.bpm(value?)",
    summary: "Get or set BPM",
    params: [
      { name: "value", type: "number", description: "BPM (1-400)", optional: true },
    ],
  };
  const text = renderCommandHelp(cmd).toString();
  assert.ok(text.includes("(optional)"), "optional param is marked");
}

// --- withHelp ---

{
  const fn = (x: number) => x * 2;
  const meta: CommandHelp = {
    name: "double",
    signature: "double(x)",
    summary: "Double a number",
  };
  const enhanced = withHelp(fn, meta);

  assert.equal(enhanced(3), 6, "original function still works");
  assert.equal(typeof enhanced.help, "function", ".help is a function");
  const helpText = enhanced.help().toString();
  assert.ok(helpText.includes("double(x)"), "help contains signature");
  assert.ok(helpText.includes("Double a number"), "help contains summary");
}

console.log("help.test.ts: all tests passed");
