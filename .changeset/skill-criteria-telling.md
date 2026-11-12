---
"cyber-agentkit": patch
---

`/skill`'s own Done-when criteria now say what the skill adds: C2 also asks `check` to report each check only a run can decide as not checked, and C7 asks `fix` to report each failure by its ID. Its evals read `check`'s verdict from closing `Failed:` and `Not checked:` lines instead of the prose around them, and its missing-skill case names the skill instead of a path, so the run looks it up in the user's skills folders too.
