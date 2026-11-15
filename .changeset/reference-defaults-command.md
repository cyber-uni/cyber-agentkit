---
"cyber-agentkit": minor
---

`reference defaults <skill>` writes a skill's bundled default copies: each plugin reference the skill loads, copied to `references/<name>.default.md` with `default` taken out of `extends`, and each interface document, copied to `references/<id>.interface.default.md`. With `--check`, it writes nothing and fails when a copy is missing, stale, misnamed, or no longer named by the skill. Orphan copies are reported and never deleted.
