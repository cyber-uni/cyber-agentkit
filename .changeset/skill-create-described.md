---
"cyber-agentkit": minor
---

`/skill` with a description of a skill and no command now runs `create`. `create` no longer stops at each aspect:
its default autonomy is `apply`, so it writes each aspect, builds the skill, runs `check` (deciding every read check
and repairing what fails), and then asks before `test`'s runs start. A team that wants each draft approved sets
`create` back to `ask` with `/skill customize`. A bare `/skill` still shows `help`.
