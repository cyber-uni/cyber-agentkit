---
"cyber-agentkit": minor
---

`cyber-agentkit` with no command now reports the harness running here and every harness installed on this machine in one call: `running` (`{ harness, evidence }`, the environment variables that showed it) and `installed` (`[{ harness, evidence }]`, the paths that showed each one), also as `--format json`. `harness` and `candidates` stay as they were. `installedHarnesses()` entries gain `evidence`.
