---
name: create-new-spec
description: Creates specification documents for new features and bug fixes in Bounce. Use when planning non-trivial work that requires research, planning, and implementation tracking. Follows a three-phase workflow (RESEARCH → PLAN → IMPL) with structured templates.
license: ISC
metadata:
  author: briansorahan
  version: "1.1"
  created: "2026-02-25"
---

# Skill: Create New Spec

## Purpose

This skill guides the creation of specification documents for new features and significant bug fixes or refactoring in Bounce. The spec workflow ensures thorough research, planning, and implementation tracking for all non-trivial work.

## When to Use

Use this skill when:
- Adding new FluCoMa algorithms or audio analysis features
- Implementing new terminal UI features or visualizations
- Making architectural changes
- Fixing complex bugs that require investigation
- Any work that involves more than a few lines of code

**Don't use specs for:**
- Typos and formatting fixes
- Simple 1-2 line bug fixes
- Dependency version updates
- Documentation corrections

## Workflow Overview

The spec process has three stages:

1. **RESEARCH** - Gather context, explore prior art, understand constraints
2. **PLAN** - Design the solution, define architecture, outline implementation
3. **IMPL** - Document implementation decisions, track progress, note deviations

Each stage has its own markdown file, and each file informs every subsequent stage.

## Required REPL Interface Contract

Whenever the feature adds or changes Bounce REPL surface area, treat the REPL API as a user-facing product surface and document the following in the spec:

- Every exposed REPL object or namespace should provide a `help()` method with a short explanation and usage examples
- Every custom object returned from an evaluated REPL expression should print a useful terminal summary when displayed
- Returned summaries should highlight the most relevant, workflow-driving properties for that type instead of dumping raw structure
- Automated coverage should explicitly confirm both `help()` output and returned-object display behavior using unit tests and/or Playwright tests
- Every global object used to execute commands should offer tab-completion for those commands.

This requirement should be carried through RESEARCH, PLAN, and IMPL. Do not leave it implicit.

## Step-by-Step Process

### Step 1: Create Spec Structure

```bash
# Choose a concise SLUG describing the work (kebab-case)
SLUG="onset-visualization"  # example

# Create spec directory
mkdir -p specs/$SLUG

# Copy templates from skill assets
cp .github/skills/create-new-spec/assets/RESEARCH.md.tmpl specs/$SLUG/RESEARCH.md
cp .github/skills/create-new-spec/assets/PLAN.md.tmpl specs/$SLUG/PLAN.md
cp .github/skills/create-new-spec/assets/IMPL.md.tmpl specs/$SLUG/IMPL.md

# Fill in placeholders (replace {SLUG}, {FEATURE_NAME}, {DATE})
```

### Step 2: Create Git Branch

```bash
# Branch name matches the SLUG
git checkout -b $SLUG
```

### Step 3: Research Phase

**File:** `specs/{SLUG}/RESEARCH.md`

Work with Copilot to fill out research documentation:
- Load context: Tell Copilot to read existing relevant code
- Collaborate on research questions
- Document findings in RESEARCH.md
- If REPL surface area is involved, identify the user-facing help and display conventions that must remain consistent

**This file is immutable after moving to PLAN phase** (unless critical flaw discovered).

### Step 4: Planning Phase

**File:** `specs/{SLUG}/PLAN.md`

Work with Copilot to create implementation plan:
- **Context loading:** `@specs/{SLUG}/RESEARCH.md` - Reference research findings
- Design the solution architecture
- Identify all files that need changes
- Define testing strategy
- Set success criteria
- For REPL-facing features, explicitly document the `help()` surface, returned-object terminal summaries, and which unit and/or Playwright tests will verify them

**This file is immutable after moving to IMPL phase** (unless critical flaw discovered).

### Step 5: Implementation Phase

**File:** `specs/{SLUG}/IMPL.md`

Work with Copilot to implement and track progress:
- **Context loading:** `@specs/{SLUG}/PLAN.md` - Reference the plan
- Document implementation decisions as you code
- Track deviations from plan (with rationale)
- Note any discovered issues or TODOs
- **Add status updates** when pausing work (for resuming later)
- For REPL-facing features, record whether `help()` and returned-object display behavior match the plan, including any deviations

### Step 6: Verification

Before considering work complete:
- Run linter: `npm run lint`
- Build TypeScript: `npm run build:electron`
- Run tests: `npm test` and, when Playwright coverage is needed, `./build.sh`
- Manually test in Electron app: `npm run dev:electron`
- Verify cross-platform compatibility if possible
- If REPL surface area changed, verify that unit and/or Playwright tests cover `help()` output and returned-object terminal summaries before closing the work
- If architecture changed, review `ARCHITECTURE.md` for accuracy (see Step 7)
- Do not run Playwright directly from the host for verification docs or Copilot guidance; prefer `./build.sh`, which runs the Playwright suite in Docker

### Step 7: Completion

Before considering work done:
- Ensure the `**Status:**` header line at the top of IMPL.md reads `**Status:** Complete` — this is the canonical marker that prune-specs and other tooling use to identify finished work
- Fill in the `## Final Status` section at the bottom of IMPL.md: completion date, summary, and verification checklist
- Review `ARCHITECTURE.md` at the repo root and update it if the work changed the process model, IPC protocol, data flows, database schema, native addon surface, or renderer architecture
- Commit all spec files with implementation
- Specs remain in repo as documentation

## Handling Flaws in Previous Phases

If during PLAN or IMPL you discover a flaw in a previous phase:

1. **Pause and discuss** with Copilot
2. **Document the flaw** in the current phase's markdown file
3. **Decide together** whether to:
   - Work around it (document workaround)
   - Update the previous phase file (document why in current file)
   - Start over with new research

Previous phase files should be treated as immutable except for critical corrections.

## Maintaining Plan Consistency

Whenever any part of a plan is changed (e.g., a requirement is reversed, a constraint is dropped, an approach is revised), **immediately review the entire plan file for contradictions**:

1. **Identify all sections** that reference the changed topic (search for related keywords)
2. **Remove or update** any content that now contradicts the change
3. **Do not leave stale content** — a plan with conflicting statements is worse than one that is silent on a topic

This applies equally to PLAN.md and IMPL.md. A common failure mode is adding a new section that reflects the updated decision while leaving an old section with the opposite requirement intact.

## Resuming Paused Work

When returning to a spec after a break:

1. Read `specs/{SLUG}/IMPL.md` - look for latest status update
2. Load that context with Copilot
3. Review what was done and what's left
4. Continue implementation

## Context Management Best Practices

- **Explicit is better:** Always tell Copilot which spec files to load
- **One phase at a time:** Don't load all three files at once
- **Reference, don't copy:** Copilot should reference sections, not duplicate content
- **Keep files focused:** Each file serves one phase only

## Templates

Template files are located in `.github/skills/create-new-spec/assets/`:

- `RESEARCH.md.tmpl` - Research phase template
- `PLAN.md.tmpl` - Planning phase template  
- `IMPL.md.tmpl` - Implementation phase template

When creating a new spec, copy these templates to `specs/{SLUG}/` and fill in the placeholders:
- `{SLUG}` - The kebab-case identifier for this work
- `{FEATURE_NAME}` - Human-readable name of the feature/fix
- `{DATE}` - Current date in YYYY-MM-DD format

## Copilot Integration

When working with specs, explicitly tell Copilot:
- `"Create new spec for {feature}, SLUG: {slug-name}"` - Uses this skill
- `"Load specs/{SLUG}/RESEARCH.md"` - When starting PLAN phase
- `"Load specs/{SLUG}/PLAN.md"` - When starting IMPL phase  
- `"Load specs/{SLUG}/IMPL.md"` - When resuming paused work or coding

This keeps context focused and minimizes token usage.
