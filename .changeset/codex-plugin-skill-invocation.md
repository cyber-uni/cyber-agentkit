---
"cyber-agentkit": patch
---

`skillInvocation('codex', …)` now returns `$<plugin>:<skill>` with `namespaced: true`, instead of the bare `$<skill>`. Codex names a plugin's skill `<plugin>:<skill>`, and its `$` mention takes the whole name.
