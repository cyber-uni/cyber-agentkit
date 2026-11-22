---
'cyber-agentkit': minor
---

`skill test` holds each run to a cost cap based on its case's own recorded cost, twice its dearest run and never below $0.50, and a case can set its own `costCap` in the eval set. A run stopped at the cap says so and records the cost it reached. `skill test --estimate` now sums each case's recorded cost, and a test counts as within its budget only when both its cost and its run count fit.
