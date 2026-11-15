---
"cyber-agentkit": patch
---

The `skill` skill, reporting a `test` result with sandbox failures, now says those runs count toward no pass rate,
names `skill accept` as how to save a result held back from being the expected one, and offers no `fix` for them
(C19). An eval case checks it against a saved report.
