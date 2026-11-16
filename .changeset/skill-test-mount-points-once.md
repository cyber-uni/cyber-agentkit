---
'cyber-agentkit': patch
---

`skill test` no longer hangs on a skill whose plugin declares dependencies. Each dependency copy now gets its sandbox
mount points once, and the step that makes them no longer walks into the folders it made, so the copies stop growing
about eightfold with every run.
