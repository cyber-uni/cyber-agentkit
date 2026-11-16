---
'cyber-agentkit': minor
---

`skill` has a new `update [skill] [change]` command for work that edits an existing skill, such as an issue or a bug. It
makes the change, adds cases for the behavior it adds, runs `check` and `test`, and ends its report with both results
(or the `Test budget:` line and why `test` did not run). It runs at `apply` by default, set in `skill-design.autonomy`
under `## update`.

`fix` now also runs `check` in full after its repairs, runs `test` when within the budget, and ends its report with both
results.
