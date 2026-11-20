---
'cyber-agentkit': patch
---

`skill test` saves a first result as `evals/expected.json` only when it has at least one trigger case or criterion and
every one passed. A result with `not-run` or `not-tested` entries is no longer saved; the report carries
`notSavedAsExpected` with the reason. A test in which no run finished now exits non-zero.
