---
'cyber-agentkit': minor
---

`skill case try <folder> <case>` runs one outcome case's setup script alone, as `skill test` runs it, in the same
script sandbox and empty home, with no model call. It prints the run folder's `git status --porcelain` and what the
setup printed, and keeps the run's folder and home under the skill's results path, so a setup can be checked
without a paid run and nothing needs deleting.
