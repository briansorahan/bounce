---
# bounce-7kt9
title: Audio server with miniaudio
status: completed
type: task
priority: normal
created_at: 2026-05-25T20:46:46Z
updated_at: 2026-05-25T21:22:45Z
blocked_by:
    - bounce-5j4n
---

bounce serve command: HTTP server that initializes the C++ miniaudio engine, exposes REST endpoints for play/stop, holds transport state, shuts down on SIGINT/SIGTERM. C++ audio engine in v2/native/engine/.

## Summary of Changes\n\nCreated the audio server infrastructure:\n\n**C++ engine** (`v2/native/engine/`):\n- Minimal miniaudio playback engine with extern "C" API\n- Functions: init, shutdown, load, play, stop, is_playing, position, sample_rate, channels, total_frames\n- Supports null backend for testing\n- Builds as libengine.a\n\n**Go audio package** (`v2/internal/audio/`):\n- Cgo bindings wrapping the C++ engine\n- Engine type with Load/Play/Stop/IsPlaying/Position/etc\n- 6 tests passing (all use null backend)\n\n**Go server package** (`v2/internal/server/`):\n- HTTP server with REST endpoints: POST /play, POST /stop, POST /load, GET /status, GET /health\n- JSON request/response\n- 7 tests passing with httptest\n\n**Wired up CLI commands:**\n- `bounce serve` now starts the real HTTP server with signal handling\n- `bounce play <file>` sends load+play to the server\n- `bounce stop` sends stop to the server
