---
# bounce-w30p
title: Freesound fixture integration tests
status: todo
type: task
created_at: 2026-05-25T21:35:30Z
updated_at: 2026-05-25T21:35:30Z
blocked_by:
    - bounce-hoy4
---

Add integration tests that download a real audio file from Freesound (sound ID 638775) using the freesound package, then run each analysis algorithm on it. Verify results are non-empty and within expected ranges. Cache the fixture in v2/testdata/.cache/ (gitignored). Skip tests if FREESOUND_API_KEY is not set. This validates the full pipeline: download → decode → analyze.
