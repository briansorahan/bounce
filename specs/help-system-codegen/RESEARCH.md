# Research: JSDoc-Driven CommandHelp Generator

**Spec:** specs/help-system-codegen  
**Created:** 2026-03-28  
**Status:** Complete

## Problem Statement

The Bounce REPL help system (built in the `help-system-checks` spec) uses hand-authored `CommandHelp[]` arrays in each namespace file. These arrays duplicate information that already exists (or should exist) in the function signatures — parameter names, types, and optionality. The documentation lives separately from the code it describes, so the two can drift out of sync. We already proved this: the `fs` namespace has functions with `dirPath` parameters but the `CommandHelp` entries document them as `path`.

We need a system where **documentation lives next to the code** (as JSDoc comments on the actual command functions) and a **build-time generator** produces the `CommandHelp[]` arrays from those annotations. A **validator** then cross-checks the generated output against the actual function signatures as a safety net.

## Background

### Current State (post help-system-checks spec)

The help system infrastructure is in `src/renderer/help.ts`:

```typescript
export interface CommandHelp {
  name: string;       // command name (e.g. "read")
  signature: string;  // display signature (e.g. "sn.read(path)")
  summary: string;    // one-line summary
  description?: string;  // multi-line detailed description
  params?: Array<{
    name: string;
    type: string;
    description: string;
    optional?: boolean;
  }>;
  examples?: string[];
}
```

Each namespace file exports a `CommandHelp[]` array (e.g. `fsCommands`, `visCommands`) and uses `withHelp(fn, commandsArray[N])` to attach `.help()` methods to functions. There are 12 namespace files + globals, totaling ~56 commands.

### The Problem with Manual Sync

The `params` field in `CommandHelp` is manually authored. We proved with a TS compiler API prototype that drift already exists:

```
❌ ls: param[0] name mismatch: fn=dirPath help=path
❌ la: param[0] name mismatch: fn=dirPath help=path
❌ cd: param[0] name mismatch: fn=dirPath help=path
❌ walk: param[0] name mismatch: fn=dirPath help=path
```

The function parameter is `dirPath` but the help says `path`. This is exactly the class of bug we want to eliminate.

### Proposed Solution

1. **Annotate command functions with JSDoc**: `@param` for parameter descriptions, first line for summary, full block for description, `@example` for examples
2. **Build-time generator script**: Uses the TypeScript compiler API to parse JSDoc + function signatures → produces `CommandHelp[]` arrays
3. **Build-time validator**: Cross-checks generated output against actual function signatures (param count, names, optionality)

## Related Work / Prior Art

- **TypeDoc**: Full documentation generator from TypeScript + JSDoc. Much heavier than what we need — we only want to extract into a runtime data structure, not generate HTML docs.
- **TSDoc**: Microsoft's standardized JSDoc-for-TypeScript. Uses tags like `@param`, `@example`, `@remarks`. We can follow these conventions.
- **ts-morph**: High-level wrapper around the TS compiler API. Would simplify AST traversal, but adds a dependency. The raw compiler API is sufficient for our needs and `typescript` is already installed.

## Technical Constraints

### TS Compiler API Capabilities (Proven via Prototype)

The TypeScript compiler API (`ts.createSourceFile` + AST walking) can extract:

- **Function signatures**: parameter names, types, optionality (via `?` token or default initializer)
- **JSDoc comments**: full description text, all tags (`@param`, `@example`, etc.)
- Works on a single source file without needing a full program/type-checker — fast and simple

**Prototype output** from a JSDoc-annotated test function:
```
Function: read
  Description: Load an audio file from disk and return a Sample object.
    The sample is stored in the project database for future access via sn.load().
  @param: path - File path (absolute, relative, or ~). Supports WAV, MP3, OGG, FLAC.
  @example: sn.read("kick.wav")
  @example: sn.read("~/samples/drums/kick.wav")
```

### Three Namespace Construction Patterns

Not all namespace files wire commands the same way. The generator needs to handle:

**Pattern A — `withHelp()` (10 of 12 namespaces)**:
```typescript
ls: withHelp(
  function ls(dirPath?: string): LsResultPromise { ... },
  fsCommands[0],
),
```
Used by: fs, vis, env, corpus, midi, transport, pat, mixer, instrument, globals (mostly).

**Pattern B — Class constructor + manual help assignment (2 namespaces)**:
```typescript
const proj = new ProjectNamespace(helpText, {
  load: async (name: string) => { ... },
  // ...
});
(proj.load as ...).help = () => renderCommandHelp(projectCommands[2]);
```
Used by: project-namespace, sample-namespace.

**Pattern C — Mixed/Object.assign (globals, partial)**:
```typescript
const errors = Object.assign(
  async function errors() { ... },
  { dismiss: withHelp(async function dismiss(id: number) { ... }, globalCommands[5]) },
);
```

### Implications for the Generator

- **Pattern A** is straightforward: the function definition is the first argument to `withHelp()`. JSDoc goes directly on the function. The generator replaces the `CommandHelp` array reference with the generated one.
- **Pattern B** is harder: commands are inline arrow functions in a constructor call. Arrow functions don't have JSDoc in the same way. These namespaces may need refactoring to use named functions (possibly extracted to top-level, then passed into the constructor).
- **Pattern C** (globals `errors`) is a special case: nested sub-commands. Can be handled with named functions + `withHelp()`.

### What the Generator Produces vs What Remains Manual

From JSDoc + function signature, the generator can automatically produce:
- `name` — from the function name
- `signature` — from namespace name + function name + param list
- `summary` — from the first line of the JSDoc block
- `description` — from the full JSDoc block
- `params` — merged from function signature (name, type, optional) + `@param` tag (description)
- `examples` — from `@example` tags

**Nothing remains manual** — the entire `CommandHelp` entry is generated. The hand-authored `CommandHelp[]` arrays in each namespace file are replaced by the generator's output.

### What the Validator Checks

After generation, the validator cross-references the generated `CommandHelp` entries against the actual function AST:
- Param count matches
- Param names match
- Param optionality matches
- Every function with parameters has a non-empty `params` array
- Every command has a non-empty `summary`

## Terminal UI Considerations

The generated `CommandHelp` entries feed into the existing `renderNamespaceHelp()` and `renderCommandHelp()` functions. The REPL output format does not change — only the authoring workflow changes (JSDoc on functions instead of separate arrays).

No REPL surface area changes. The `help()` methods and their output remain identical.

## Cross-Platform Considerations

The generator is a Node.js script using the TypeScript compiler API. No platform-specific code. Runs as part of the build pipeline on all platforms.

## Open Questions

1. **Where does the generated output go?** Options:
   - (a) Generate a separate `*-commands.generated.ts` file that each namespace imports
   - (b) Generate in-place within the namespace file (replacing a marked region)
   - (c) Generate a single `generated-help.ts` file with all commands
   Option (a) seems cleanest — each namespace imports its generated array.

2. **How to handle Pattern B namespaces (project, sample)?** Options:
   - (a) Refactor to use named functions with JSDoc, then pass into class constructors
   - (b) Support JSDoc on arrow functions in the generator (fragile, non-standard)
   - (c) Keep those two namespaces manual for now, migrate later
   Option (a) is preferred — aligns them with the majority pattern.

3. **When does the generator run?** Options:
   - (a) As a pre-build step (npm script, e.g. `npm run generate:help`)
   - (b) Integrated into `npm run build:electron`
   - (c) As a test that fails if generated output is stale
   Option (a) with (c) as enforcement seems best — generate on demand, test that output is fresh.

4. **How does the namespace name get associated with functions?** The generator needs to know that `ls` belongs to the `fs` namespace to produce `signature: "fs.ls(path?)"`. Options:
   - (a) A config file or marker comment mapping namespace names to source files
   - (b) Convention: the `build*Namespace` function name encodes it (e.g. `buildFsNamespace` → `fs`)
   - (c) A JSDoc tag on the builder function (e.g. `@namespace fs`)
   Option (b) or (c) both work. (c) is more explicit.

## Research Findings

1. **The TS compiler API is fully capable** of extracting JSDoc tags, function signatures, parameter metadata. Proven via working prototypes.
2. **The validator concept works** — a prototype already caught 4 real drift issues in `fs-namespace.ts`.
3. **10 of 12 namespaces** use the clean `withHelp()` pattern that's straightforward for the generator. The 2 class-based namespaces (project, sample) need refactoring.
4. **No custom JSDoc tags needed** — standard `@param` and `@example` tags, plus the description block, provide everything `CommandHelp` requires.
5. **`typescript` is already a project dependency** — no new dependencies needed for the generator.
6. **The authoring experience improves significantly**: developers document the function right where it's defined, and the help system stays in sync automatically.

## Next Steps

In the PLAN phase:
1. Design the generator script architecture (input discovery, AST traversal, output format)
2. Define the JSDoc annotation conventions for command functions
3. Plan the migration order (Pattern A namespaces first, then Pattern B refactoring)
4. Define the validator as a unit test
5. Decide on open questions (output location, namespace name association, build integration)
