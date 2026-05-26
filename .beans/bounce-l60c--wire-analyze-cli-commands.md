---
# bounce-l60c
title: Wire analyze CLI commands
status: todo
type: task
created_at: 2026-05-25T21:35:18Z
updated_at: 2026-05-25T21:35:18Z
blocked_by:
    - bounce-hoy4
---

Connect the 7 analyze subcommands (onset, amp, novelty, transient, mfcc, spectral-shape, nmf) to the analysis package. Each command reads an audio file via the audioio package, calls the corresponding analysis function, and prints results as JSON to stdout. Add flags matching the analysis option structs. Tests should verify flag parsing and JSON output shape.
