---
"cyber-agentkit": patch
---

`skillInvocation('opencode', …)` now returns `/<skill>` (not namespaced by plugin) instead of `undefined`. Through v1.19.3, OpenCode registers every loaded skill as a slash command, unless a built-in, config command, or MCP prompt already has the name.
