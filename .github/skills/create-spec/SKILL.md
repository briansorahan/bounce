---
name: create-new-spec
description: Creates specification documents for new features and bug fixes in Bounce. Use when planning non-trivial work that requires research, planning, and implementation tracking. Follows a three-phase workflow (RESEARCH → PLAN → IMPL) with structured templates, and uses beads for all task tracking.
license: ISC
metadata:
  author: briansorahan
  version: "2.0"
  created: "2026-02-25"
  updated: "2026-04-06"
---

# Skill: Create New Spec

## Purpose

This skill guides the creation of specification documents for new features and significant bug fixes or refactoring in Bounce. The spec workflow ensures thorough research, planning, and implementation tracking for all non-trivial work.

Each spec corresponds to **one parent beads issue** with a graph of child task issues. The parent issue represents the feature as a whole; child issues are the discrete implementation tasks. Task progress is tracked entirely in beads — never in markdown files.

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

The spec process has four stages:

1. **RESEARCH** - Gather context, explore prior art, understand constraints
2. **PLAN** - Design the solution, define architecture, and create the beads task graph
3. **REVIEW** - Multi-agent review rounds to catch issues before implementation begins
4. **IMPL** - Document implementation decisions and deviations; agents execute autonomously via beads

Each stage has its own markdown file. Task tracking lives in beads, not in these files.

## Required REPL Interface Contract

Whenever the feature adds or changes Bounce REPL surface area, treat the REPL API as a user-facing product surface and document the following in the spec:

- Every exposed REPL object or namespace should provide a `help()` method with a short explanation and usage examples
- Every custom object returned from an evaluated REPL expression should print a useful terminal summary when displayed
- Returned summaries should highlight the most relevant, workflow-driving properties for that type instead of dumping raw structure
- Automated coverage should explicitly confirm both `help()` output and returned-object display behavior using unit tests and/or Playwright tests
- Every global object used to execute commands should offer tab-completion for those commands

This requirement must be carried through RESEARCH, PLAN, and IMPL. Do not leave it implicit.

## Step-by-Step Process

### Step 1: Create Spec Structure and Parent Issue

```bash
# Choose a concise SLUG describing the work (kebab-case)
SLUG="onset-visualization"  # example

# Create spec directory and copy templates
mkdir -p specs/$SLUG
cp .github/skills/create-new-spec/assets/RESEARCH.md.tmpl specs/$SLUG/RESEARCH.md
cp .github/skills/create-new-spec/assets/PLAN.md.tmpl specs/$SLUG/PLAN.md
cp .github/skills/create-new-spec/assets/IMPL.md.tmpl specs/$SLUG/IMPL.md
# REVIEW.md is created during Step 5 — do not pre-create it

# Create the parent beads issue
bd create \
  --title="[spec] $SLUG" \
  --description="Parent issue for the $SLUG spec. See specs/$SLUG/ for research, plan, and implementation docs." \
  --type=feature \
  --priority=2
# Note the returned issue ID (e.g. beads-42) — you will need it throughout

# Fill in placeholders in the spec files (replace {SLUG}, {FEATURE_NAME}, {DATE}, {BEADS_PARENT_ID})
```

### Step 2: Create Git Branch

```bash
# Branch name matches the SLUG
git checkout -b $SLUG
```

### Step 3: Research Phase

**File:** `specs/{SLUG}/RESEARCH.md`

Fill out research documentation:
- Load context: read existing relevant code
- Document findings in RESEARCH.md
- If REPL surface area is involved, identify the user-facing help and display conventions that must remain consistent

**This file is immutable after moving to PLAN phase** (unless critical flaw discovered).

### Step 4: Planning Phase

**File:** `specs/{SLUG}/PLAN.md`

Create the implementation plan:
- Reference research findings from RESEARCH.md
- Design the solution architecture
- Identify all files that need changes
- Define testing strategy and success criteria
- For REPL-facing features, explicitly document the `help()` surface, returned-object terminal summaries, and which unit and/or Playwright tests will verify them

#### Creating the Beads Task Graph

At the end of the planning phase, decompose the work into discrete beads issues and wire up their dependencies. **This must be done before moving to IMPL.**

```bash
# Create child issues in parallel (use sub-agents for many issues)
# Each issue description must be self-contained — enough context to implement without re-reading the spec
bd create --title="..." --description="..." --type=task --priority=2
bd create --title="..." --description="..." --type=task --priority=2
# ... repeat for each task

# Wire up dependencies (task B cannot start until task A is done)
bd dep add beads-YYY beads-XXX   # beads-YYY depends on beads-XXX
bd dep add beads-ZZZ beads-YYY   # beads-ZZZ depends on beads-YYY

# Link all child issues to the parent
bd dep add beads-PARENT beads-LAST-CHILD  # parent closes when last child is done
```

Record all created issue IDs in the **Task Graph** section of PLAN.md.

**This file is immutable after moving to IMPL phase** (unless critical flaw discovered).

### Step 5: Spec Review Phase

**File:** `specs/{SLUG}/REVIEW.md`

After completing the planning phase, ask the user if they would like to run a spec review. The default number of reviewers is **5** (the user may specify a different number before starting).

#### Running a Review Round

1. **Create or update `specs/{SLUG}/REVIEW.md`**: Copy `assets/REVIEW.md.tmpl` on the first round; append a new round section on subsequent rounds.

2. **Spawn N sub-agents** (default: 5), each with a fresh context window. Each sub-agent must:
   - Read all documents in `specs/{SLUG}/` (RESEARCH.md, PLAN.md, and IMPL.md if it exists)
   - Read any related documents referenced in the spec (e.g., `ARCHITECTURE.md`, `README.md`)
   - Evaluate the spec against the **Reviewer Checklist** below
   - Return a structured critique: issues found, questions raised, and specific suggested changes

3. **Collect and present results**: Collect all sub-agent reviews, synthesize them into a consolidated report (highlighting themes and priority issues), present the report to the user, and write/append it to `specs/{SLUG}/REVIEW.md`.

4. **Apply agreed-upon changes**: Automatically apply all agreed-upon edits to the relevant documents. This may include any spec file (RESEARCH.md, PLAN.md, IMPL.md) or any other project document that needs updating (ARCHITECTURE.md, README.md, etc.). Record every change made — document name, what changed, and rationale — in the **Changes Applied** table in REVIEW.md.

5. **Continue or stop**: Ask the user whether they would like to run another review round. If yes, repeat from step 2. Continue until the user declines.

#### Reviewer Checklist

Each sub-agent reviewer must evaluate the spec against all of the following dimensions:

**Completeness**
- Are all sections of RESEARCH.md and PLAN.md (and IMPL.md if present) filled in meaningfully?
- Are open questions answered or explicitly deferred with rationale?
- Is the task graph specific enough to execute each issue without ambiguity?
- Does each beads issue description contain enough standalone context to implement without re-reading the full spec?

**Consistency**
- Do RESEARCH.md and PLAN.md agree on the approach, constraints, and scope?
- Are there any contradictions within or between documents?
- If IMPL.md exists, does it reflect the plan, or are deviations documented with rationale?

**Feasibility**
- Is the proposed approach technically sound given the Bounce three-process architecture?
- Are risks identified with concrete mitigations?

**REPL Interface Contract**
- If REPL surface area is involved, is the `help()` contract fully specified for every exposed object/function?
- Are returned-object terminal summaries defined for all new custom types?
- Is test coverage for `help()` and display behavior explicitly planned?

**Testing Strategy**
- Are unit and E2E tests identified for all meaningful behaviors?
- Does the testing strategy cover edge cases and cross-platform concerns?
- For REPL-facing features, are `help()` and returned-object display assertions explicitly included?

**Clarity**
- Is the spec clear enough for someone unfamiliar with the feature to understand and implement it?
- Are architectural decisions well-motivated?
- Are deviations from established conventions documented?

### Step 6: Implementation Phase

**File:** `specs/{SLUG}/IMPL.md`

IMPL.md is a decision log and deviation record — not a task tracker. All task tracking is in beads.

The **Agent Execution Protocol** at the top of IMPL.md defines the autonomous wave loop. The main agent acts as orchestrator — it never writes code directly. It:

1. Calls `bd ready` to find all currently unblocked tasks
2. Spawns one sub-agent per task in parallel; each claims and implements (no individual test runs)
3. After the wave completes, runs `npm test` and `npm run lint`
4. If either fails, spawns a sub-agent to fix the failure, then re-runs checks
5. Closes all tasks in the wave with `bd close`
6. Repeats until `bd ready` returns nothing

When `bd ready` is empty, proceed to Step 7 (Land the Plane).

Document decisions and deviations in IMPL.md as they arise. Do not wait until the end.

### Step 7: Land the Plane

Run this checklist in order after all child tasks are closed. Do not skip steps.

```bash
npm test                    # All unit tests must pass
npm run lint                # No lint errors
npm run build:electron      # TypeScript must compile cleanly
./build.sh                  # Full Dockerized Playwright suite — mandatory, no exceptions
npm run dev:electron        # Manual smoke test
```

If any step fails, fix the issue, re-run from `npm test`, and do not proceed until the full sequence passes cleanly.

Then:
- If architecture changed, update `ARCHITECTURE.md`
- If REPL surface area changed, verify unit and/or Playwright tests cover `help()` and returned-object display
- Fill in the `## Final Status` section of IMPL.md
- Set `**Status:** Complete` at the top of IMPL.md (required by prune-specs tooling)
- Commit all spec files and implementation
- Run `bd close {BEADS_PARENT_ID}` to close the parent issue
- Run `bd dolt push && git push`

### Step 8: Completion

Before considering work done:
- `**Status:** Complete` is set in IMPL.md
- `## Final Status` is filled in
- `ARCHITECTURE.md` is accurate
- All spec files are committed
- Parent beads issue is closed
- Changes are pushed to remote

## Handling Flaws in Previous Phases

If during PLAN or IMPL you discover a flaw in a previous phase:

1. **Pause and document** the flaw in the current phase's markdown file
2. **Decide** whether to:
   - Work around it (document workaround)
   - Update the previous phase file (document why in current file)
   - Start over with new research

Previous phase files should be treated as immutable except for critical corrections.

## Maintaining Plan Consistency

Whenever any part of a plan is changed, **immediately review the entire plan file for contradictions**:

1. **Identify all sections** that reference the changed topic
2. **Remove or update** any content that now contradicts the change
3. **Do not leave stale content** — a plan with conflicting statements is worse than one that is silent on a topic

This applies equally to PLAN.md and IMPL.md.

## Resuming Paused Work

When returning to a spec after a break:

1. Run `bd list --status=in_progress` and `bd ready` to see current state
2. Read `specs/{SLUG}/IMPL.md` for context on decisions and deviations
3. Resume the Autonomous Execution Loop from Step 6

## Context Management Best Practices

- **One phase at a time:** Don't load all three files at once
- **Reference, don't copy:** Reference sections rather than duplicating content
- **Keep files focused:** Each file serves one phase only — task tracking belongs in beads

## Templates

Template files are located in `.github/skills/create-new-spec/assets/`:

- `RESEARCH.md.tmpl` - Research phase template
- `PLAN.md.tmpl` - Planning phase template
- `REVIEW.md.tmpl` - Spec review template (created at the start of Step 5; one file per spec, new rounds appended)
- `IMPL.md.tmpl` - Implementation phase template

When creating a new spec, copy these templates to `specs/{SLUG}/` and fill in the placeholders:
- `{SLUG}` - The kebab-case identifier for this work
- `{FEATURE_NAME}` - Human-readable name of the feature/fix
- `{DATE}` - Current date in YYYY-MM-DD format
- `{BEADS_PARENT_ID}` - The beads issue ID created in Step 1 (e.g. `beads-42`)
