---
# bounce-5j4n
title: CLI command structure
status: completed
type: task
priority: normal
created_at: 2026-05-25T20:46:46Z
updated_at: 2026-05-25T20:59:14Z
---

Wire up cobra (or stdlib) CLI with subcommands: serve, play, stop, analyze (onset/amplitude/novelty/transient/mfcc/spectral/nmf), normalize. Establish the command pattern that all future commands follow.

## Summary of Changes\n\nCreated `v2/internal/cmd/` package with cobra command tree:\n- root, serve (--port), play (--server), stop (--server), analyze (7 subcommands), normalize, version\n- All commands return 'not implemented' for now — structure only\n- 6 tests verifying arg validation, help output, and error cases\n- Establishes one-file-per-command-group pattern
