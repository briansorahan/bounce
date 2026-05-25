---
# bounce-hoy4
title: Audio file I/O package
status: todo
type: task
created_at: 2026-05-25T21:35:12Z
updated_at: 2026-05-25T21:35:12Z
---

Go package (internal/audioio/) for reading and writing WAV/FLAC files to []float32 slices. This is needed by the analyze and normalize CLI commands to load audio from disk. Use a pure-Go WAV reader (go-audio/wav or similar) to avoid more cgo. Include sample rate, channels, and bit depth in the returned metadata. Table-driven tests with short synthetic WAV files created in-test.
