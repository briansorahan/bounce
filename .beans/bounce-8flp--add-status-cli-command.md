---
# bounce-8flp
title: Add status CLI command
status: todo
type: task
created_at: 2026-05-25T21:35:40Z
updated_at: 2026-05-25T21:35:40Z
---

Add a 'bounce status' command that queries GET /status on the server and prints playback state (playing/stopped, position, file info) in a human-readable format. Also add a --json flag for machine-readable output. Simple HTTP client, no new dependencies.
