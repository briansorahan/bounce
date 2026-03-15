# Research: Sononym Feature Parity

**Spec:** specs/sononym-feature-parity  
**Created:** 2026-03-12  
**Status:** In Progress

## Problem Statement

Bounce already has meaningful audio-analysis functionality, but it does not yet present itself as a Sononym-like sample browser. Sononym's value proposition is not just "audio features exist"; it is a tightly integrated product around library management, descriptor-driven discovery, similarity search, duplicate handling, curation workflows, and a polished browsing UI.

This research document identifies the current gap between Sononym's documented feature set (based on the Sononym 1.5.0 user manual reviewed during this session) and Bounce's current implementation. The goal is to establish which parity areas are already partially covered by existing Bounce capabilities, which are entirely absent, and which may require product-level adaptation rather than direct one-to-one replication.

## Background

Sononym is organized around several user-facing pillars:

- Indexed libraries built from sample folders
- Fast browsing of folders and libraries
- Search input with synonyms, exclusions, and keyword suggestions
- Similarity search over indexed material
- Duplicate detection with actions
- Projects, favorites, export, and renaming workflows
- Descriptor-based filtering and metadata-aware search
- Waveform-driven preview and selection
- Broad preferences and desktop-oriented usability polish

Bounce, by contrast, is currently an Electron application with a terminal-first interface and a programmable API surface exposed through a TypeScript REPL. Its strongest existing capabilities are audio loading, playback, FluCoMa-backed analysis, waveform visualization, slicing, NMF separation, corpus building, nearest-neighbor resynthesis, and filesystem utilities. The primary architectural question for parity is therefore not whether Bounce can analyze audio, but whether it can wrap those primitives in the library/search/curation workflows that define Sononym.

## Related Work / Prior Art

The primary prior art for this spec is the Sononym 1.5.0 manual, which documents these notable feature areas:

- Libraries with indexing, refresh, upgrade, and multi-library selection
- Explore mode for recursive folder browsing and library detection
- Search input with thesaurus-backed synonyms, exclusions, and keyword suggestions
- Similarity search with adjustable aspects (`overall`, `spectrum`, `timbre`, `pitch`, `amplitude`)
- Duplicate detection with hide/link/delete workflows
- Projects, favorites, colors, export/import, and advanced renaming
- Descriptor tables and filter panels for file info, loudness, note/frequency, BPM, brightness, harmonicity, noisiness, class, and category
- Embedded metadata search and display
- Waveform interaction, preview, recording, and keyboard shortcuts
- Preferences for audio, display, search, and project behavior

Bounce's current implementation should therefore be evaluated against Sononym as a product workflow, not only as a DSP toolkit.

## FluCoMa Algorithm Details

Bounce already uses FluCoMa-oriented analysis patterns and native bindings for core DSP features. In the current codebase:

- onset analysis and slicing are exposed through the REPL API in `src/renderer/bounce-api.ts`
- corpus similarity is built from averaged MFCCs and spectral-shape descriptors in `src/electron/corpus-manager.ts`
- additional analysis workflows include NMF separation, cross-synthesis, and granular workflows in `src/renderer/bounce-api.ts` and the `src/electron/commands/` directory

This means the parity problem is not "Bounce lacks audio analysis." The deeper gap is that Sononym turns analysis into searchable, browsable, classifiable library UX, while Bounce currently exposes analysis mostly as procedural commands.

## Technical Constraints

- Bounce is terminal-first. Its core interaction model is the xterm.js REPL in `src/renderer/terminal.ts` and `src/renderer/app.ts`, not a multi-pane browser UI like Sononym.
- Bounce's public API surface is command-oriented and scriptable through `src/renderer/bounce-api.ts`.
- Bounce persists audio samples and analysis features in SQLite via `src/electron/database.ts`, but there is no user-facing concept of "library" comparable to Sononym's indexed library abstraction.
- Current persisted user settings are minimal and centered on working directory management through `src/electron/settings-store.ts`.
- Current supported audio extensions are explicitly enumerated in `src/electron/audio-extensions.ts`.

These constraints suggest that Sononym parity should probably be designed as a Bounce-native adaptation rather than a literal clone of Sononym's GUI and workflows.

## Audio Processing Considerations

Bounce already computes descriptors internally for some workflows:

- corpus similarity uses 20-dimensional features: 13 averaged MFCC coefficients plus 7 averaged spectral-shape descriptors (`centroid`, `spread`, `skewness`, `kurtosis`, `rolloff`, `flatness`, `crest`) in `src/electron/corpus-manager.ts`
- waveform overlays support onset-slice markers and NMF activation displays in `src/renderer/waveform-visualizer.ts`
- NMF, onset slicing, and cross-synthesis are already exposed as end-user operations in `src/renderer/bounce-api.ts`

Important distinction: Sononym's descriptor-driven browsing is an end-user search/filter product feature. Bounce's descriptor extraction is currently an implementation detail behind analysis and corpus workflows rather than a general-purpose browsing/filtering system.

## Terminal UI Considerations

Bounce's existing UX is strong for scripted and experimental workflows:

- terminal commands with help text and examples in `src/renderer/bounce-api.ts`
- command history and reverse history search in `src/renderer/app.ts`
- tab completion in the REPL and tests around that behavior in `src/tab-completion.test.ts`
- waveform visualization adjacent to the terminal in `src/renderer/app.ts` and `src/renderer/waveform-visualizer.ts`

However, Sononym's parity target includes several interaction patterns that are not naturally present yet in a terminal-first interface:

- table-based browsing of large result sets with sortable descriptor columns
- persistent filter panels
- category/class click targets
- favorites/projects sidebars
- waveform drag-selection and record-as-query flows

This is one of the largest product gaps in the current codebase.

## Cross-Platform Considerations

Bounce is structurally cross-platform because it is built with Electron and platform-neutral Node APIs. Audio extension support is centralized in `src/electron/audio-extensions.ts`, and build/test scripts target a cross-platform Electron app in `package.json`.

That said, Sononym parity includes desktop-quality polish across browsing, preferences, file operations, and possibly OS-specific workflows such as symbolic-link handling for duplicates. Bounce currently has a much smaller cross-platform product surface in those areas.

## Open Questions

1. What does "parity" mean for this spec: exact product mimicry, or Sononym-equivalent capability delivered through Bounce's terminal-first model?
2. Should Bounce introduce a first-class library abstraction, or build discovery/search over raw filesystem paths plus the existing sample database?
3. How much of Sononym's curation layer is in scope for early parity: favorites only, or full projects/export/renaming?
4. Is embedded metadata support a requirement for initial parity, or can descriptor and filename/path search come first?
5. Should duplicate handling aim for Sononym-style near-duplicate detection, or start with exact-content duplicate workflows based on hashes?

## Research Findings

### Summary

Bounce already has strong low-level analysis and playback primitives, but Sononym parity is currently incomplete across most product-facing categories. The largest gaps are library management, search/discovery UX, metadata/filtering, curation workflows, and user-facing duplicate tooling.

The best way to characterize current parity is:

- **Strong foundations, weak product wrapping**
- **Strong analysis, weak browsing/search**
- **Strong programmable workflows, weak curated library workflows**

### Feature-by-feature gap analysis

#### 1. Library management and indexing

**Sononym:** Indexed libraries are a first-class concept. Users can create, open, refresh, upgrade, combine, and remove libraries, and Sononym treats those libraries as the basis for similarity search and many other workflows.

**Bounce today:** Bounce persists samples and extracted features in SQLite through `src/electron/database.ts`, and `display()` / analysis commands can store and retrieve audio by hash through the API in `src/renderer/bounce-api.ts`. But there is no explicit user-facing library model, no "create library" workflow, no library refresh/upgrade UI, no multi-library selection, and no library browser.

**Gap assessment:** **Missing at the product level.** Bounce has storage infrastructure, but not Sononym-style library management.

**Implication:** Parity likely requires introducing a new abstraction above the existing sample database rather than reusing current sample persistence as-is.

#### 2. Explore mode and file/folder browsing

**Sononym:** Explore mode recursively scans folders, detects libraries, caches folder scans, highlights indexed folders, and supports recent-folder workflows.

**Bounce today:** Bounce has a solid terminal-based filesystem toolkit in `src/renderer/bounce-api.ts`: `fs.ls()`, `fs.la()`, `fs.cd()`, `fs.pwd()`, `fs.glob()`, and `fs.walk()`. Current working directory persistence is implemented in `src/electron/settings-store.ts`. This gives users meaningful file navigation power, but it is command-driven rather than browse-driven.

**Gap assessment:** **Partial.** Bounce covers low-level filesystem navigation well, but does not yet provide Sononym's scan-and-browse product experience.

**Implication:** This is one of the clearest places where Bounce already has technical primitives but not the right UX layer.

#### 3. Search input, synonyms, exclusions, and keyword suggestions

**Sononym:** Search is a core UX surface. It supports path-aware search, excluded terms, a thesaurus/synonym database, keyword suggestions, and metadata-aware querying.

**Bounce today:** There is no comparable sample-search input. Bounce supports REPL command entry, tab completion, and reverse history search in `src/renderer/app.ts` and `src/renderer/terminal.ts`, but these are terminal affordances rather than sample discovery features. `fs.glob()` in `src/renderer/bounce-api.ts` is useful, but it is still explicit filesystem pattern matching, not a search index.

**Gap assessment:** **Missing.**

**Implication:** A Sononym-like search surface will likely require indexed textual search over filenames, paths, descriptors, and eventually metadata, plus a UI model for suggestions and filter state.

#### 4. Similarity search

**Sononym:** Similarity search is central. Users can launch it from many places, compare against indexed libraries, and rebalance similarity aspects such as `overall`, `spectrum`, `timbre`, `pitch`, and `amplitude`.

**Bounce today:** Bounce already has real similarity infrastructure, but in a narrower form. The `corpus` API in `src/renderer/bounce-api.ts` exposes `build()`, `query()`, and `resynthesize()`. `src/electron/corpus-manager.ts` builds a KD-tree over onset-slice segments using averaged MFCC and spectral-shape features, then performs nearest-neighbor queries and concatenative resynthesis.

**Gap assessment:** **Partial, with strong technical foundations.**

**What Bounce has:**

- actual nearest-neighbor search
- descriptor extraction
- resynthesis from query results
- scriptable workflows

**What Bounce lacks relative to Sononym:**

- search over user-managed libraries rather than only a built corpus
- broad source selection UX
- user-visible similarity aspect controls
- result-table ratings and sortable similarity columns
- integration with category/class browsing

**Implication:** This is one of the most promising parity areas because Bounce already has the underlying analysis/search engine shape, even if the product surface is much smaller.

#### 5. Duplicate detection

**Sononym:** Duplicate detection is user-facing and action-oriented. It handles exact and near duplicates, works over folders/libraries, and lets users hide, link, or delete duplicate entries.

**Bounce today:** The sample database in `src/electron/database.ts` uses hashes heavily and enforces uniqueness for stored sample hashes and feature hashes. That is useful internal deduplication infrastructure, but it is not a user duplicate-detection workflow, and it does not expose Sononym-like near-duplicate inspection or actions.

**Gap assessment:** **Mostly missing.**

**Implication:** If parity is desired here, exact-hash duplicate tooling could be an incremental first step, but Sononym-level parity would require a dedicated duplicate review and action flow.

#### 6. Projects, collections, favorites, and curation

**Sononym:** Users can create projects, organize sounds in trees, assign colors, favorite files, export/import projects, and use those structures as an ongoing curation workflow.

**Bounce today:** No comparable user-facing project or favorites subsystem was found. `GrainCollection` in `src/renderer/grain-collection.ts` is an internal collection abstraction for granular workflows, not a saveable end-user curation feature.

**Gap assessment:** **Missing.**

**Implication:** This is a major product gap if the goal is feature parity rather than analysis parity.

#### 7. Renaming and naming profiles

**Sononym:** Supports regular rename, batch rename, advanced token-based renaming, naming profiles, and metadata-aware tokens.

**Bounce today:** No user-facing renaming or naming-profile system was found in the current API surface exposed by `src/renderer/bounce-api.ts`.

**Gap assessment:** **Missing.**

**Implication:** This area appears orthogonal to Bounce's current strengths and would likely need to be built mostly from scratch if considered in scope.

#### 8. Descriptor-driven filtering and class/category browsing

**Sononym:** Descriptor-driven browsing is a headline feature. Users can sort and filter by file info, loudness, pitch/note, BPM, brightness, harmonicity, noisiness, classes, and categories. Class/category predictions are visible and can be overridden manually.

**Bounce today:** Bounce extracts meaningful descriptors internally. `src/electron/corpus-manager.ts` computes MFCC and spectral-shape features, and `src/renderer/waveform-visualizer.ts` visualizes slices and NMF overlays. But there is no user-facing descriptor table, no filter panel, no class/category taxonomy, no manual descriptor override, and no browsing model built around descriptors.

**Gap assessment:** **Mostly missing at the product level.**

**Important nuance:** This is not a raw DSP gap. It is a productization gap. Bounce already computes some descriptors, but not as a general search/filter system.

#### 9. Embedded metadata search and display

**Sononym:** Supports searching and displaying many embedded metadata fields, including artist, title, genre, album, pictures, and other tags.

**Bounce today:** No embedded metadata subsystem was found in the current codebase. Public APIs in `src/renderer/bounce-api.ts` focus on loading audio, analysis, playback, corpus workflows, filesystem navigation, and REPL utilities. Searches through the source tree did not reveal any tag-parsing or metadata-browsing surface comparable to Sononym.

**Gap assessment:** **Missing.**

**Implication:** If metadata parity matters, this is a distinct subsystem and should not be conflated with descriptor extraction.

#### 10. Waveform display, selection, playback, and recording

**Sononym:** Provides waveform preview, scrubbing, loop-aware playback, selection-based similarity search, and record-as-query workflows.

**Bounce today:** This is an area of real strength. `display()`, `play()`, `stop()`, `playSlice()`, and `playComponent()` are exposed in `src/renderer/bounce-api.ts`. `src/renderer/waveform-visualizer.ts` provides waveform rendering, playback cursor rendering, slice markers, and NMF overlays. End-to-end playback behavior is covered by tests in `tests/playback.spec.ts`.

**Gap assessment:** **Partial, with strong foundations.**

**What Bounce has:**

- audio display and preview
- visualization tied to analysis results
- slice/component playback
- waveform-adjacent workflow

**What Bounce lacks relative to Sononym:**

- drag-to-select waveform regions
- selection-aware similarity initiation
- recording input for query capture
- Sononym-style transport/options polish

#### 11. Keyboard-driven workflow and desktop ergonomics

**Sononym:** Offers a large, discoverable keyboard-shortcut system integrated with its browser UI.

**Bounce today:** Bounce is highly keyboard-centric, but in a different way. The REPL, history handling, reverse search, and command completion in `src/renderer/app.ts` and `src/renderer/terminal.ts` make it efficient for power users. However, there is not yet a Sononym-style keyboard system layered over searchable tables, filter panels, favorites, projects, and browser widgets.

**Gap assessment:** **Partial, but not directly comparable.**

**Implication:** Bounce already has strong keyboard ergonomics for a programming tool. Sononym parity would require keyboard ergonomics for a browsing tool.

#### 12. Preferences and configuration

**Sononym:** Exposes preferences for audio devices, display, search behavior, and project defaults.

**Bounce today:** Configuration appears minimal. `src/electron/settings-store.ts` persists current working directory. `src/renderer/terminal.ts` contains a hardcoded terminal theme. The app has no comparable user preferences surface for audio device selection, display density, search defaults, project defaults, or metadata behavior.

**Gap assessment:** **Minimal / mostly missing.**

#### 13. Cross-platform support and audio formats

**Sononym:** Markets broad platform support and documents per-platform format support.

**Bounce today:** Bounce is cross-platform in architecture and already enumerates supported audio extensions in `src/electron/audio-extensions.ts`: `.wav`, `.mp3`, `.ogg`, `.flac`, `.m4a`, `.aac`, and `.opus`. Build and test scripts in `package.json` target an Electron desktop app.

**Gap assessment:** **Partial to good.**

**What is present:** reasonable format support and a cross-platform architecture.

**What is missing relative to Sononym:** a broader product-facing compatibility story around libraries, preferences, duplicate actions, and polished desktop workflows.

### Areas where Bounce is already stronger than Sononym's documented emphasis

This parity analysis should not overlook Bounce's distinctive strengths:

1. **Programmable REPL workflows**  
   Bounce exposes its functionality as a scriptable TypeScript API in `src/renderer/bounce-api.ts`, which enables composable, automatable workflows that go beyond menu-driven browsing.

2. **Corpus resynthesis and experimental audio workflows**  
   `corpus.build()`, `corpus.query()`, and `corpus.resynthesize()` in `src/renderer/bounce-api.ts` and `src/electron/corpus-manager.ts` push Bounce toward creative recomposition, not just sample retrieval.

3. **NMF separation, cross-synthesis, and granular workflows**  
   These are significant capabilities in Bounce's current API surface and represent a different creative direction than Sononym's browser-centric emphasis.

4. **Terminal-first power-user ergonomics**  
   Sononym is richer as a sample-management product today, but Bounce is already unusually capable as a programmable analysis environment.

### Priority interpretation of the gap

If "feature parity" means "match Sononym's overall user value," the highest-priority gaps appear to be:

1. **Library model and browse/search workflow**
2. **Descriptor-driven discovery UX**
3. **Metadata/text search**
4. **Similarity search productization**
5. **Curation workflows (favorites/projects)**

If "feature parity" instead means "match Sononym's most distinctive technical discovery features," the likely focus changes to:

1. **User-facing descriptor index**
2. **Library-scale similarity search**
3. **Search input with smart query assistance**
4. **Category/class systems**

## Next Steps

- Decide whether the spec targets full Sononym-style product parity or a narrower "search and similarity parity" slice.
- Define a first-class Bounce library/index model on top of the current sample database.
- Identify the minimum viable discovery workflow: library ingestion, search, descriptor filtering, and similarity search.
- Decide whether metadata, favorites/projects, and duplicate workflows belong in the first parity milestone or later milestones.
- In the PLAN phase, break the work into product layers: data model, indexing, query/filter engine, UI surfaces, and curation/export workflows.
