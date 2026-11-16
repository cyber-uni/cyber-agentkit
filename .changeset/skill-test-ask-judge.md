---
'cyber-agentkit': patch
---

`skill` now asks which model should judge when an eval criterion can only be decided by a `judge` check, instead of
leaving it untested. When drafting evals it prefers a `regex` or `contains` check, and `skill test` lists the
judge-only criteria before a run, offers `--judge <model>`, and no longer grades a not-tested criterion by reading
the replies itself.
