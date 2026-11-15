---
"cyber-agentkit": minor
---

`skill accept` and `skill test --accept` now keep the expected result they replace in the skill's `evals/accepted/`, the 3 newest, so accepted runs can be compared. Each case in a result counts the runs that went right, and `skill test`'s report names under `moved` the cases whose pass rate changed across the kept accepted results and this run. An existing `evals/expected.json` keeps working as the newest entry, with no migration step.
