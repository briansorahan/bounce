import assert from "node:assert/strict";
import {
  type CommandHelp,
  type TypeMethodHelp,
  renderNamespaceHelp,
  renderCommandHelp,
  renderMethodHelp,
  attachMethodHelp,
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
  assert.ok(!text.includes("ns.<cmd>.help()"), "footer no longer mentions per-command help");
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

// --- renderCommandHelp with returns field ---

{
  const cmd: CommandHelp = {
    name: "read",
    signature: "sn.read(path)",
    summary: "Load an audio file",
    params: [
      { name: "path", type: "string", description: "File path", optional: false },
    ],
    returns: "Sample",
    examples: ['sn.read("kick.wav")'],
  };
  const text = renderCommandHelp(cmd).toString();
  assert.ok(text.includes("Returns:"), "returns label appears");
  assert.ok(text.includes("Sample"), "return type name appears");
}

// --- renderCommandHelp omits returns when not set ---

{
  const cmd: CommandHelp = {
    name: "stop",
    signature: "sn.stop()",
    summary: "Stop playback",
  };
  const text = renderCommandHelp(cmd).toString();
  assert.ok(!text.includes("Returns:"), "no returns section when field is absent");
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

// --- renderMethodHelp ---

{
  const method: TypeMethodHelp = {
    signature: "play()",
    summary: "Play the sample from the beginning → Sample",
  };
  const text = renderMethodHelp("Sample", method).toString();
  assert.ok(text.includes("Sample.play()"), "method help shows TypeName.signature");
  assert.ok(text.includes("Play the sample"), "method help shows summary");
}

// --- attachMethodHelp ---

{
  const obj = {
    play: () => "played",
    stop: () => "stopped",
    alreadyHelped: Object.assign(() => "x", { help: () => "existing" }),
  };
  const methods: TypeMethodHelp[] = [
    { signature: "play()", summary: "Play something" },
    { signature: "stop()", summary: "Stop something" },
    { signature: "alreadyHelped()", summary: "Should not overwrite" },
  ];
  attachMethodHelp(obj, "Test", methods);

  // Wrapped methods still work
  assert.equal(obj.play(), "played", "play still returns original value");
  assert.equal(obj.stop(), "stopped", "stop still returns original value");

  // Wrapped methods have .help()
  assert.equal(typeof (obj.play as unknown as { help: () => unknown }).help, "function", "play has .help()");
  assert.equal(typeof (obj.stop as unknown as { help: () => unknown }).help, "function", "stop has .help()");

  // Methods that already had .help() are not overwritten
  assert.equal(
    (obj.alreadyHelped as unknown as { help: () => string }).help(),
    "existing",
    "pre-existing .help() is preserved",
  );
}

console.log("help.test.ts: all tests passed");

// ---------------------------------------------------------------------------
// renderTypeHelp
// ---------------------------------------------------------------------------

import {
  renderTypeHelp,
  renderMethodHelpFromDescriptor,
  renderDescriptorHelp,
  attachMethodHelpFromRegistry,
  attachNamespaceMethodHelp,
} from "./renderer/help.js";
import type { NamespaceDescriptor, TypeDescriptor } from "./shared/repl-registry.js";
import { registerNamespace, registerType, setDevMode } from "./shared/repl-registration.js";

{
  const typeHelp = {
    name: "Sample",
    summary: "An audio sample",
    description: "Loaded from disk or analysis.",
    properties: [
      { name: "hash", type: "string", description: "Content hash", readonly: true },
      { name: "duration", type: "number", description: "Length in seconds", readonly: false },
    ],
    methods: [
      { signature: "play()", summary: "Play the sample" },
      { signature: "stop()", summary: "Stop playback" },
    ],
  };

  const text = renderTypeHelp(typeHelp).toString();

  assert.ok(text.includes("Sample"), "type name appears");
  assert.ok(text.includes("An audio sample"), "summary appears");
  assert.ok(text.includes("Loaded from disk or analysis"), "description appears");
  assert.ok(text.includes("hash"), "property name appears");
  assert.ok(text.includes("(readonly)"), "readonly flag appears");
  assert.ok(text.includes("play()"), "method signature appears");
  assert.ok(text.includes("Play the sample"), "method summary appears");
  console.log("renderTypeHelp: ✓");
}

{
  // Without description, properties, or methods
  const text = renderTypeHelp({ name: "Bare", summary: "Minimal type" }).toString();
  assert.ok(text.includes("Bare"), "name appears for minimal type");
  assert.ok(text.includes("Minimal type"), "summary appears for minimal type");
  console.log("renderTypeHelp (minimal): ✓");
}

// ---------------------------------------------------------------------------
// renderMethodHelpFromDescriptor
// ---------------------------------------------------------------------------

{
  const method = {
    summary: "Play the sample",
    visibility: "porcelain" as const,
    returns: "SamplePromise",
    params: [
      { name: "channel", summary: "1–8", kind: "plain" as const, optional: true },
    ],
  };
  const text = renderMethodHelpFromDescriptor("Sample", "play", method).toString();

  assert.ok(text.includes("Sample.play(channel)"), "type.method(params) appears");
  assert.ok(text.includes("Play the sample"), "summary appears");
  assert.ok(text.includes("channel"), "param name appears");
  assert.ok(text.includes("SamplePromise"), "returns appears");
  console.log("renderMethodHelpFromDescriptor: ✓");
}

{
  // No params, no returns
  const method = { summary: "Stop", visibility: "porcelain" as const, params: [] };
  const text = renderMethodHelpFromDescriptor("Sample", "stop", method).toString();
  assert.ok(text.includes("Sample.stop()"), "no-param signature");
  console.log("renderMethodHelpFromDescriptor (no params): ✓");
}

// ---------------------------------------------------------------------------
// renderDescriptorHelp — namespace descriptor
// ---------------------------------------------------------------------------

{
  const ns: NamespaceDescriptor = {
    name: "sn",
    summary: "Sample namespace",
    visibility: "porcelain",
    methods: {
      read: { summary: "Load a file", visibility: "porcelain", params: [] },
      list: { summary: "List samples", visibility: "plumbing", params: [] },
    },
  };

  setDevMode(false);
  const text = renderDescriptorHelp(ns).toString();
  assert.ok(text.includes("sn"), "namespace name appears");
  assert.ok(text.includes("Sample namespace"), "summary appears");
  assert.ok(text.includes("sn.read()"), "public method appears prefixed");
  assert.ok(!text.includes("sn.list()"), "plumbing method hidden in non-dev mode");

  setDevMode(true);
  const devText = renderDescriptorHelp(ns).toString();
  assert.ok(devText.includes("sn.list()"), "plumbing method shown in dev mode");
  setDevMode(false);

  console.log("renderDescriptorHelp (namespace): ✓");
}

// ---------------------------------------------------------------------------
// renderDescriptorHelp — type descriptor
// ---------------------------------------------------------------------------

{
  const td: TypeDescriptor = {
    name: "SampleResult",
    summary: "A loaded sample",
    instanceName: "s",
    methods: {
      play: { summary: "Play it", visibility: "porcelain", params: [{ name: "opts", summary: "Options", kind: "plain" as const, optional: true }] },
      stop: { summary: "Stop it", visibility: "porcelain", params: [] },
    },
  };

  const text = renderDescriptorHelp(td).toString();
  assert.ok(text.includes("SampleResult"), "type name appears");
  assert.ok(text.includes("s.play(opts)"), "instanceName prefix on method with params");
  assert.ok(text.includes("s.stop()"), "instanceName prefix on no-param method");
  assert.ok(text.includes("s.play.help()"), "hint for methods with params");
  console.log("renderDescriptorHelp (type): ✓");
}

// ---------------------------------------------------------------------------
// attachMethodHelpFromRegistry
// ---------------------------------------------------------------------------

{
  // Register a test type; use a unique name to avoid polluting global registry
  const typeName = "TestResultType_Help";
  registerType({
    name: typeName,
    summary: "Test type for help coverage",
    methods: {
      doThing: { summary: "Do a thing", visibility: "porcelain", params: [] },
      hidden: { summary: "Plumbing", visibility: "plumbing", params: [] },
    },
  });

  const instance = {
    doThing() { return "done"; },
    hidden() { return "shhh"; },
  };

  attachMethodHelpFromRegistry(instance, typeName);

  const doThingFn = instance.doThing as unknown as { help: () => { toString(): string } };
  assert.equal(typeof doThingFn.help, "function", "porcelain method gets .help()");
  assert.ok(doThingFn.help().toString().includes("Do a thing"), "help text is correct");

  const hiddenFn = instance.hidden as unknown as { help?: () => unknown };
  assert.equal(typeof hiddenFn.help, "undefined", "plumbing method skipped");

  console.log("attachMethodHelpFromRegistry: ✓");
}

// ---------------------------------------------------------------------------
// attachNamespaceMethodHelp
// ---------------------------------------------------------------------------

{
  const nsName = "TestNs_Help";
  registerNamespace({
    name: nsName,
    summary: "Test namespace for help coverage",
    visibility: "porcelain",
    methods: {
      greet: { summary: "Say hello", visibility: "porcelain", params: [] },
      plumb: { summary: "Internal", visibility: "plumbing", params: [] },
    },
  });

  const ns = {
    greet() { return "hello"; },
    plumb() { return "internal"; },
  };

  attachNamespaceMethodHelp(ns, nsName);

  const greetFn = ns.greet as unknown as { help: () => { toString(): string } };
  assert.equal(typeof greetFn.help, "function", "namespace method gets .help()");
  assert.ok(greetFn.help().toString().includes("Say hello"), "namespace help text correct");

  const plumbFn = ns.plumb as unknown as { help?: () => unknown };
  assert.equal(typeof plumbFn.help, "undefined", "plumbing namespace method skipped");

  console.log("attachNamespaceMethodHelp: ✓");
}

// ---------------------------------------------------------------------------
// renderCommandHelp — nested param properties (sub-properties branch)
// ---------------------------------------------------------------------------

{
  const cmd = {
    name: "analyze",
    signature: "sn.analyze(opts)",
    summary: "Run analysis",
    params: [
      {
        name: "opts",
        type: "object",
        description: "Options",
        optional: true,
        properties: [
          { name: "threshold", type: "number", description: "Detection threshold", optional: false },
          { name: "minLen", type: "number", description: "Minimum length", optional: true },
        ],
      },
    ],
    returns: "SliceFeatureResult",
    examples: ["sn.analyze({ threshold: 0.5 })"],
  };

  const text = renderCommandHelp(cmd).toString();
  assert.ok(text.includes("opts"), "outer param name");
  assert.ok(text.includes("threshold"), "sub-property name");
  assert.ok(text.includes("(required)"), "required sub-property flag");
  assert.ok(text.includes("SliceFeatureResult"), "returns appears");
  assert.ok(text.includes("sn.analyze({ threshold: 0.5 })"), "example appears");
  console.log("renderCommandHelp (nested properties + returns + examples): ✓");
}

// ---------------------------------------------------------------------------
// renderMethodHelp — nested sub-properties + returns
// ---------------------------------------------------------------------------

{
  const method = {
    signature: "analyze(opts)",
    summary: "Run analysis",
    params: [
      {
        name: "opts",
        type: "object",
        description: "Options",
        optional: true,
        properties: [
          { name: "fftSize", type: "number", description: "FFT window", optional: false },
        ],
      },
    ],
    returns: "SliceFeatureResult",
  };

  const text = renderMethodHelp("Sample", method).toString();
  assert.ok(text.includes("fftSize"), "sub-property appears in method help");
  assert.ok(text.includes("SliceFeatureResult"), "returns appears in method help");
  console.log("renderMethodHelp (nested + returns): ✓");
}

console.log("help.test.ts (extended): all tests passed");
