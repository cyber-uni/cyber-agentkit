---
"cyber-agentkit": patch
---

`skill test` makes each path the shell sandbox mounts over ahead in every dependency copy, as it does in the plugin copy, so a dependency without `.mcp.json` no longer breaks every shell command of a run. A run that still hits bwrap's `Can't find source path` error is reported as a sandbox failure, counted toward no pass rate, instead of a failed run.
