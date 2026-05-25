---
# bounce-pdhw
title: Store analysis results in SQLite
status: todo
type: task
created_at: 2026-05-25T21:35:35Z
updated_at: 2026-05-25T21:35:35Z
blocked_by:
    - bounce-l60c
---

Wire the analyze commands to persist results in the SQLite database. After running analysis, store the result in the analysis_results table keyed by sample path + algorithm + parameters hash. Add a 'bounce results' subcommand to query stored results. This enables the corpus workflow: analyze once, query many times.
