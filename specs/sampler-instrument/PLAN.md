# Plan: Sampler Instrument

**Spec:** specs/sampler-instrument  
**Created:** 2026-03-21  
**Status:** In Progress

## Context

<!-- Brief summary referencing key points from RESEARCH.md -->

## Approach Summary

<!-- High-level description of the solution -->

## Architecture Changes

<!-- How does this fit into existing architecture? New components? -->

## Changes Required

### Native C++ Changes

<!-- List of C++ files and changes needed, or "None" -->

### TypeScript Changes

<!-- List of TS files and changes needed -->

### Terminal UI Changes

<!-- UI/UX changes in the terminal interface -->

### REPL Interface Contract

<!--
If this work adds or changes REPL-facing API surface:
- Which objects/namespaces/functions expose help()?
- What should each returned custom object print when shown in the terminal?
- Which high-value properties matter most to the user at a glance?
If not applicable, write "None".
-->

#### REPL Contract Checklist

- [ ] Every exposed object/namespace/function has a `help()` entry point or an explicit reason why not
- [ ] Every returned custom REPL type defines a useful terminal summary
- [ ] The summary highlights workflow-relevant properties, not raw internal structure
- [ ] Unit tests and/or Playwright tests are identified for `help()` output
- [ ] Unit tests and/or Playwright tests are identified for returned-object display behavior

### Configuration/Build Changes

<!-- package.json, tsconfig, binding.gyp, etc. -->

## Testing Strategy

### Unit Tests

<!-- What unit tests are needed? Include REPL help() and returned-object display assertions when applicable. -->

### E2E Tests

<!-- What Playwright tests are needed? Include REPL help() and returned-object display assertions when applicable. -->

### Manual Testing

<!-- What should be manually verified beyond automated coverage? -->

## Success Criteria

<!-- How do we know this is complete and working? Include REPL interface consistency when applicable. -->

## Risks & Mitigation

<!-- Potential issues and how to handle them -->

## Implementation Order

<!-- Step-by-step sequence for implementing changes -->

## Estimated Scope

<!-- Rough estimate: Small/Medium/Large -->

## Plan Consistency Checklist

<!-- Complete this before moving to IMPL phase -->
- [ ] All sections agree on backwards compatibility requirements
- [ ] All sections agree on the data model / schema approach
- [ ] REPL-facing changes define help() coverage and returned-object terminal summaries
- [ ] Testing strategy names unit and/or Playwright coverage for REPL help/display behavior where applicable
- [ ] No contradictory constraints exist between sections
- [ ] Any revised decisions have had stale/opposing content removed
