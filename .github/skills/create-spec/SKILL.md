---
name: create-spec
description: Creates specification documents for new features and significant changes in Bounce. Follows a four-phase workflow (SHAPE → SPEC → BUILD → TEST) combining Shape Up appetite-driven scoping with test-first development. All task tracking uses beans.
license: ISC
metadata:
  author: briansorahan
  version: "3.0"
  created: "2026-02-25"
  updated: "2026-04-26"
---

# Skill: Create New Spec

## Purpose

This skill guides the creation of specification documents for new features and significant changes
in Bounce. It combines two ideas:

- **Shape Up** (Basecamp): appetite-driven scoping, resolved rabbit holes, explicit no-gos, and a
  circuit breaker that enforces scope cuts instead of timeline extensions.
- **Test-first**: per-service unit tests and workflow tests are written before (or alongside)
  production code. Tests are the executable definition of done.

Each spec corresponds to one parent bean with a graph of child task beans. Task progress is
tracked entirely in beans — never in markdown files.

## When to Use

Use this skill when:
- Adding new FluCoMa algorithms or audio analysis features
- Implementing new terminal UI features or visualizations
- Making architectural changes or adding new services
- Fixing complex bugs that require investigation
- Any work that involves more than a few files or a few hours of effort

**Don't use specs for:**
- Typos and formatting fixes
- Simple 1-2 line bug fixes
- Dependency version updates
- Documentation corrections

## Architecture Context

Bounce uses a **service-oriented JSON-RPC architecture**. Before writing a spec, understand
the key structural patterns:

- **Services** live in `src/electron/services/{name}/`. Each service is a TypeScript class that
  implements a handler interface and exposes its functionality over JSON-RPC.
- **RPC contracts** live in `src/shared/rpc/{name}.rpc.ts`. Each contract defines the params,
  results, request types, handler interface, and typed client factory for one service.
- **In-process transport** (`src/shared/rpc/connection.ts`) provides `createInProcessPair()` —
  an EventEmitter-backed JSON-RPC connection used in workflow tests.
- **Workflow tests** live in `tests/workflows/`. They use `bootServices()` from
  `tests/workflows/helpers.ts` to instantiate real services with in-memory storage and a mock
  audio engine, then exercise multi-service scenarios over the in-process JSON-RPC transport.
- **Unit tests** live alongside source files in `src/` as `*.test.ts`.

When a spec modifies or adds a service, both unit tests (for the service in isolation) and
workflow tests (for the multi-service scenario) are expected.

## Workflow Overview

```
SHAPE → SPEC → BUILD → TEST
```

1. **SHAPE** — Set appetite, sketch the solution, resolve rabbit holes, declare no-gos, confirm
   alignment with VISION.md. The agent actively challenges its own design before presenting.
   This is the gate: nothing proceeds until the user approves the shape.

2. **SPEC** — Research, per-service design, and acceptance test planning. The first bean in every
   task graph writes test skeletons before any production code is touched.

3. **BUILD** — Execute the task graph in waves. Each sub-agent writes or refines tests for its
   bean before implementing (TDD at the bean level). Orchestrator runs `npm test` after each wave.
   Circuit breaker enforces the appetite.

4. **TEST** — Hard gate. All tests pass, lockfile is current, documentation is updated. The spec
   is not done until TEST is complete.

---

## Step-by-Step Process

### Step 1: Create Spec Structure and Parent Bean

```bash
SLUG="my-feature"  # concise kebab-case identifier

mkdir -p specs/$SLUG
cp .github/skills/create-spec/assets/SHAPE.md.tmpl specs/$SLUG/SHAPE.md
cp .github/skills/create-spec/assets/SPEC.md.tmpl  specs/$SLUG/SPEC.md
cp .github/skills/create-spec/assets/BUILD.md.tmpl specs/$SLUG/BUILD.md
cp .github/skills/create-spec/assets/TEST.md.tmpl  specs/$SLUG/TEST.md

# Create the parent bean
beans create --json "$SLUG" -t feature \
  -d "Parent bean for the $SLUG spec. See specs/$SLUG/ for shape, spec, build, and test docs."
# Note the returned bean ID (e.g. bounce-abc) — you will need it throughout

# Fill in {SLUG}, {FEATURE_NAME}, {DATE}, {BEAN_ID} in all four files
```

### Step 2: Create Git Branch

```bash
git checkout -b $SLUG
```

### Step 3: Shape Phase

**File:** `specs/{SLUG}/SHAPE.md`

#### 3a: Draft the Shape

Fill in:

1. **Appetite** — Small (~1 day), Medium (~3–4 days), or Large (~1–2 weeks). Everything else in
   the shape must fit this budget.

2. **Problem** — What are we solving and why now? 2–4 sentences.

3. **Rough solution sketch** — Fat marker level. Identify the key structural decisions and which
   services are involved. If you need more than 10–15 lines, the feature isn't shaped yet.

4. **Identify and resolve rabbit holes** — Find the specific things that could blow the budget or
   derail the work. The goal is not to list them — it is to close them. For each, either define a
   concrete boundary that prevents it from expanding, or move it to no-gos. Untangle any
   interdependencies so the work can proceed in clear, separable steps.

   > *"We reduce risk in the shaping process by solving open questions before we commit the
   > project to a time box. We don't give a project to a team that still has rabbit holes or
   > tangled interdependencies."* — Shape Up

5. **No-gos** — Explicitly out of scope for this appetite. Be specific.

6. **Alignment with VISION.md** — Read VISION.md. Evaluate the feature against each product
   principle and each technical principle. Mark each ✓ pass, ⚠ flag (with explanation), or — n/a.

#### 3b: Challenge the Design

Before presenting the shape to the user, the agent must actively challenge its own proposed
solution. Work through each of the following:

- **Simplest alternative**: What is the simplest design that would also solve the problem? Why is
  the proposed design better? If you cannot articulate why, simplify.
- **Failure modes**: What are the most likely ways this design fails in production? Are they
  acceptable?
- **Hidden dependencies**: What does this touch in the existing codebase that has not been
  accounted for? Read the relevant service files before answering.
- **Hardest part**: What is the single most technically risky piece? Is it actually resolved in
  the shape, or just named?
- **No-go safety**: Are the stated no-gos safe to exclude, or will they create downstream
  problems for a future spec?
- **Architectural fit**: Does this approach move toward the service-oriented JSON-RPC direction
  in VISION.md, or is it fighting the architecture?

Document challenges and their resolutions in the **Design Challenges** section of SHAPE.md.
If a challenge cannot be resolved, the shape is not ready.

#### 3c: Get Approval

**Present the shape to the user and get explicit approval before proceeding to SPEC.**

Before asking for approval, confirm:
- [ ] Every rabbit hole is resolved or moved to no-gos
- [ ] No tangled interdependencies remain
- [ ] Every design challenge has a resolution
- [ ] The rough solution fits the appetite
- [ ] No-gos are specific enough that a builder would know what is out of scope

The shape document is immutable after approval unless a critical flaw is discovered.

---

### Step 4: Spec Phase

**File:** `specs/{SLUG}/SPEC.md`

#### 4a: Research

Read the relevant service implementations, RPC contracts, and test files. Constrain research to
the questions raised by the shape. Record key findings.

#### 4b: Per-Service Design

For each service touched by this spec, document:
- What changes (new methods, modified behavior, new RPC contract entries)
- New `RequestType` definitions needed in the `.rpc.ts` contract file
- Handler interface changes
- Client factory changes
- Whether `bootServices()` in `tests/workflows/helpers.ts` needs updating

If a **new service** is being added:
- New service class in `src/electron/services/{name}/`
- New RPC contract in `src/shared/rpc/{name}.rpc.ts`
- New entry in `bootServices()` in `tests/workflows/helpers.ts`
- New workflow test file `tests/workflows/{name}.test.ts`

#### 4c: REPL Interface Contract

If this spec adds or changes REPL surface area:
- Which objects/namespaces expose `help()`?
- What do returned custom types print in the terminal?
- Which unit tests will verify `help()` output and display behavior?

If not applicable, write "None."

#### 4d: Acceptance Test Plan

Specify the tests that define done. These will be written (as skeletons) in the first BUILD bean.

**Per-service unit tests**: For each modified service, list the test file path and the key
behaviors to cover. Tests live at `src/electron/services/{name}/{name}.test.ts` or alongside
the relevant source file.

**Workflow tests**: List the workflow test scenarios to add in `tests/workflows/`. Each scenario
should name the services involved and the user-visible behavior being verified. These use the
existing `bootServices()` harness from `tests/workflows/helpers.ts`.

#### 4e: Create the Beans Task Graph

The **first bean must always be "Write test skeletons for {SLUG}"**. All implementation beans
are blocked by it.

```bash
# Create the test-skeleton bean first
beans create --json "Write test skeletons for $SLUG" -t task \
  -d "Write vitest skeleton tests (unit + workflow) that define done for $SLUG.
      See specs/$SLUG/SPEC.md §Acceptance Test Plan for the full list.
      Unit tests go in src/..., workflow tests go in tests/workflows/.
      Skeletons may use test.todo() or loose assertions — they will be fleshed
      out incrementally during BUILD. Must be committed before BUILD begins."

# Create per-service implementation beans
beans create --json "..." -t task -d "..."  # one per service or logical unit

# Block all implementation beans on the test-skeleton bean
beans update <impl-bean-id> --blocked-by <skeleton-bean-id>

# Set parent on all beans
beans update <skeleton-bean-id> --parent <parent-bean-id>
beans update <impl-bean-id> --parent <parent-bean-id>
```

Each bean description must be **fully self-contained**: the implementing agent must be able to
complete it by reading only the bean description plus the files it references.

Record all bean IDs in the Task Graph table in SPEC.md.

The spec document is immutable after moving to BUILD unless a critical flaw is discovered.

---

### Step 5: Build Phase

**File:** `specs/{SLUG}/BUILD.md`

BUILD.md is a decision log and deviation record. The Agent Execution Protocol at the top defines
the wave loop. The main agent is the orchestrator — it never writes code directly.

#### Wave Loop

```
1. beans list --json --ready  →  collect unblocked bean IDs for this spec
2. If empty → proceed to TEST phase
3. Spawn one sub-agent per ready bean (in parallel). Each sub-agent must:
     a. beans update <id> -s in-progress
     b. Read the bean description and the referenced files before writing any code
     c. Write or flesh out the tests for this bean's scope before implementing
     d. Implement the task (TDD: make the tests pass)
     e. Do NOT run the full test suite — the orchestrator does this after the wave
4. Wait for all sub-agents to complete
5. npm test          ← orchestrator; fix failures before proceeding
6. npm run lint      ← orchestrator; fix errors before proceeding
7. If step 5 or 6 fails:
     a. Spawn a sub-agent to diagnose and fix
     b. Return to step 5
8. beans update <id> -s completed  for all beans in this wave
9. Go to step 1
```

#### Circuit Breaker

If the appetite is running out before all beans are complete:

1. **Do not extend the budget.**
2. Identify which remaining beans represent the lowest-priority scope.
3. Create a follow-up feature bean for the deferred work.
4. Mark the deferred beans scrapped on this spec with a reason.
5. Document the scope cut in BUILD.md Deviations.

Ship something real within the appetite. The follow-up bean captures what was deferred.

---

### Step 6: Test Phase

**File:** `specs/{SLUG}/TEST.md`

TEST is a hard gate. The spec is not complete until every item below passes. Do not skip steps.

#### Automated Checks

```bash
npm test           # All vitest tests must pass — unit tests AND workflow tests
npm run lint       # Zero lint errors
npm run build:electron   # TypeScript must compile cleanly
```

If any check fails, fix it and re-run from `npm test` before continuing.

#### Lockfile

```bash
npm install        # Re-run to ensure package-lock.json is current
git diff package-lock.json   # Must be clean (or committed if deps changed)
```

#### Documentation

Check each condition and update the relevant document if true:

| Condition | Document to update |
|---|---|
| Any service boundary added or changed | `ARCHITECTURE.md` — update the service table and any affected data flow diagrams |
| Any RPC method added or modified | `ARCHITECTURE.md` — update the IPC/RPC channel table |
| Database schema changed | `ARCHITECTURE.md` — update the schema table |
| REPL surface added or changed | Verify `help()` and terminal summaries are covered by unit tests |
| VISION.md technical principles rendered stale | Update `VISION.md` |

#### Workflow Test Coverage

Confirm that `tests/workflows/` includes at least one test scenario exercising the primary
workflow introduced or modified by this spec. The scenario must use `bootServices()` and assert
on a meaningful outcome, not just that no error was thrown.

#### Final Steps

```bash
beans update {BEAN_ID} -s completed
git add -A && git commit -m "..."
git push
```

Fill in the `## Final Status` section of TEST.md before closing the parent bean.

---

## Key Protocols

### Test-First Protocol

- The first bean in every task graph writes test skeletons before implementation begins.
- Each sub-agent in BUILD writes or fleshes out tests for its scope before writing production
  code. Tests are not deferred to the end.
- Cutting scope means deferring beans (and their tests) to a follow-up spec — not skipping tests
  silently.

### Circuit Breaker Protocol

- Appetite is set once, in SHAPE. It does not change during BUILD.
- When appetite is exhausted, stop and scope-hammer. Deferred work becomes a follow-up bean.
- Document every scope cut in BUILD.md.

### Alignment Protocol

- SHAPE.md always includes an alignment check against VISION.md.
- Read VISION.md fresh each time — do not rely on memory.
- A flagged principle (⚠) requires explanation but does not block the spec.
- A feature that conflicts with multiple product principles should be re-shaped or abandoned.

### REPL Interface Contract

Whenever a feature adds or changes REPL surface area:
- Every exposed namespace or object provides `help()`
- Every returned custom type prints a useful, workflow-relevant terminal summary
- Tab completion covers all commands and their parameters
- Unit tests verify `help()` output and display behavior
- This is verified in TEST phase before closing the parent bean

### Workflow Test Protocol

- Every spec that touches one or more services must add or update workflow tests in
  `tests/workflows/` using the `bootServices()` harness.
- The workflow test must exercise the primary scenario end-to-end across the modified service
  boundaries — not just assert that methods exist.
- If `bootServices()` does not include a service needed by the spec, wiring it in is part of
  the spec's scope.

---

## Handling Flaws in Previous Phases

If during SPEC, BUILD, or TEST you discover a flaw in a previous phase:

1. Pause and document the flaw in the current phase's file.
2. Decide: work around it (document the workaround), update the previous file (document why),
   or stop and re-shape from scratch.
3. If updating a previous file, immediately scan it for newly contradictory content and remove
   it. A document with conflicting statements is worse than one that is silent.

---

## Resuming Paused Work

1. `beans list --json -s in-progress` and `beans list --json --ready` to find current state.
2. Read `specs/{SLUG}/BUILD.md` for decisions and deviations so far.
3. Re-check the appetite. If it is exhausted, circuit-break before resuming.
4. Run `npm test` to confirm the current baseline before starting new work.
5. If the codebase has changed significantly under the spec, check whether any beans,
   test skeletons, or service designs need updating before continuing.

---

## Templates

Template files are in `.github/skills/create-spec/assets/`:

- `SHAPE.md.tmpl` — appetite, sketch, design challenges, rabbit holes, no-gos, alignment
- `SPEC.md.tmpl`  — research, per-service design, REPL contract, acceptance test plan, task graph
- `BUILD.md.tmpl` — agent execution protocol, decisions, deviations
- `TEST.md.tmpl`  — verification checklist, documentation checklist, final status
