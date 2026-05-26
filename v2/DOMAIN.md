# Bounce v2 Domain Model

This document defines the bounded contexts, ubiquitous language, and aggregate roots for Bounce v2.
It is a living document — when a bean introduces a new domain concept, updating this file is part
of "done."

---

## Bounded Contexts

### Analysis

**Package:** `internal/analysis/`

Responsible for running FluCoMa DSP algorithms against audio data and returning structured results.
Analysis is stateless and runs entirely in the client process — it does not require the server.

**Owns:** slicing algorithms, feature extractors, normalization, KD-tree

**Interfaces with:** Sample (receives audio data to analyze)

---

### Audio

**Package:** `internal/audio/`

The client-side interface to the audio server. Provides a typed Go client for the server's HTTP API.
Does not own playback logic — that lives in the server and its C++ engine.

**Owns:** HTTP client for the server, playback command types

**Interfaces with:** Server (sends playback commands over HTTP)

---

### Server

**Package:** `internal/server/`

The HTTP server that owns the audio engine and application state. Manages the lifecycle of the
C++ miniaudio engine, exposes REST endpoints, holds transport state.

**Owns:** HTTP handlers, audio engine lifecycle, transport state

**Interfaces with:** Audio Engine (C++, via cgo), Sample (reads audio files for playback)

---

### Sample

**Package:** `internal/db/`

Responsible for sample metadata persistence. A sample is an audio file that has been imported into
Bounce — its metadata (hash, duration, sample rate, channels, file path) is stored in SQLite.
The audio data itself lives on disk as a plain file.

**Owns:** SQLite schema, migrations, sample CRUD, analysis result storage

**Interfaces with:** Analysis (stores analysis results), filesystem (audio file paths)

---

### Freesound

**Package:** `internal/freesound/`

A minimal HTTP client for the Freesound API. Currently exists only to download test fixtures.
May grow into a full browsing/searching integration in the future.

**Owns:** Freesound API authentication, sound download

**Interfaces with:** external Freesound API

---

## Ubiquitous Language

| Term | Definition |
|------|-----------|
| **Sample** | An audio file that has been imported into Bounce. Identified by its content hash. Has metadata (duration, sample rate, channels, frame count) stored in SQLite. The audio data is a plain file on disk. |
| **Slice** | A time segment within a sample, produced by a slicing algorithm. Defined by a start frame (inclusive) and end frame (exclusive). |
| **Analysis** | The act of running a FluCoMa algorithm against a sample's audio data. Produces a structured result (slices, feature vectors, or components). |
| **Feature** | A numeric descriptor extracted from audio — e.g. MFCC coefficients, spectral centroid. Features are per-frame or per-slice. |
| **Algorithm** | A specific FluCoMa analysis operation: onset slice, amplitude slice, MFCC extraction, etc. Each algorithm has typed parameters and a typed result. |
| **Server** | The long-running `bounce serve` process that owns the audio engine and application state. Communicates with clients over HTTP. |
| **Transport** | The playback state: playing/stopped, current position, current file. Owned by the server. |
| **Normalization** | A transformation that scales numeric data (features or audio) to a standard range. Three modes: min-max, standardize, robust. |
| **Corpus** | (Deferred) A collection of samples with precomputed features, queryable by similarity. |
| **Instrument** | (Deferred) A playback configuration that maps MIDI notes to samples. |

---

## Aggregate Roots

### Sample (in the Sample/DB context)

The primary entity. All analysis results reference a sample by its hash. A sample's identity
is its content hash — the same audio data always produces the same sample, regardless of
filename or location.

**Invariants:**
- A sample's hash is computed from its audio content and is immutable
- A sample must reference a file that exists on disk
- Analysis results belong to exactly one sample

### Transport (in the Server context)

The playback state machine. At any time the transport is either stopped or playing a specific file
at a specific position.

**Invariants:**
- Only one file can be playing at a time
- Position is always within [0, duration] of the current file
- Stopping resets position to 0
