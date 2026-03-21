---
name: prune-specs
description: Removes completed spec directories from specs/. Use when the specs/ directory is cluttered with finished work and you want to clean it up. A spec is considered complete when its IMPL.md contains a Status line matching "Complete".
license: ISC
metadata:
  author: briansorahan
  version: "1.0"
  created: "2026-03-21"
---

# Skill: Prune Specs

## Purpose

Remove spec directories from `specs/` that have been fully implemented. This keeps the specs directory focused on active and planned work rather than historical records.

## When to Use

- The `specs/` directory has grown large and contains many finished specs
- You want to remove completed work before starting a new spec cycle
- Cleaning up before a release or milestone

**Don't use this skill for:**
- Specs that are in progress (`Status: In Progress`)
- Specs that have no IMPL.md yet (still in RESEARCH or PLAN phase)
- Archiving specs (if you want to keep them, commit them elsewhere first)

## What "Complete" Means

A spec is complete when its `IMPL.md` file contains a status line of the form:

```
**Status:** Complete
```

This is the canonical completion marker. Specs without an IMPL.md, or whose IMPL.md does not contain this marker, are **not** pruned.

## Step-by-Step Process

### Step 1: Identify Completed Specs

```bash
grep -rl "Status.*Complete" specs/*/IMPL.md
```

This lists all IMPL.md files whose status line matches `Complete`. Each result corresponds to a completed spec directory.

### Step 2: Present the List for Approval

Display the completed specs clearly — one per line — and ask the user:

> "The following specs are marked Complete and will be removed. If any of these are **not** actually done, type their names (space- or newline-separated) and press Enter. If everything looks good, type **all good** and press Enter."

Show each spec as its slug, e.g.:

```
  - audio-recording
  - concat-synth
  - typescript-repl
  - filesystem-utilities
  ...
```

Use `ask_user` with `allow_freeform: true` and no choices so the user can either type slugs to flag or leave blank to approve all.

### Step 3: Investigate Flagged Specs

If the user names any specs they believe are **not** actually complete:

1. Read the full `IMPL.md` of each flagged spec.
2. Determine why it was marked `Status: Complete` — look for:
   - Incomplete checklist items in the Final Status section
   - Outstanding issues or TODOs that were never resolved
   - A status marker that was set prematurely (e.g., copied from a template or set before verification)
3. Report findings to the user: explain what led to the `Complete` status and whether the spec genuinely needs more work.
4. Update the `**Status:**` line in the flagged spec's IMPL.md to reflect its true state (e.g., `In Progress`, `Blocked`, or `Needs Verification`) and remove it from the prune list.
5. Continue with pruning only the specs that remain confirmed complete.

### Step 4: Remove Confirmed Spec Directories

For each confirmed spec, remove its directory:

```bash
# Example: remove a single completed spec
rm -rf specs/sample-object-api

# Example: remove all confirmed completed specs at once
rm -rf specs/sample-object-api specs/typescript-repl specs/filesystem-utilities
```

### Step 5: Verify

```bash
# Show remaining specs
ls specs/
```

Confirm that only in-progress or not-yet-started specs remain.

### Step 6: Commit

```bash
git add -A specs/
git commit -m "chore: prune completed specs

Remove spec directories that have reached Status: Complete.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Identifying Completion Status Quickly

To get a summary of all specs and their current status:

```bash
for dir in specs/*/; do
  slug=$(basename "$dir")
  impl="$dir/IMPL.md"
  if [ -f "$impl" ]; then
    status=$(grep -m1 "\*\*Status:\*\*" "$impl" | sed 's/.*\*\*Status:\*\* *//')
    echo "$slug: $status"
  else
    echo "$slug: (no IMPL.md)"
  fi
done
```

## Safety Notes

- Always present the full list to the user before deleting anything
- Use `ask_user` to collect flagged specs — do not assume approval if the user has not responded
- Do not prune specs that lack an IMPL.md — they are still active
- Do not prune specs where IMPL.md status is anything other than `Complete` (e.g., `In Progress`, `Blocked`, `Paused`)
- If the user flags a spec as not actually done, **always investigate** before proceeding — a premature `Status: Complete` marker is a spec quality issue that should be corrected in the file, not silently skipped
