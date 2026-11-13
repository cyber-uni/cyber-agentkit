---
"cyber-agentkit": patch
---

The `skill` skill now also loads before other work writes a file in a skill's folder, such as implementing an issue
that adds or changes a skill, even when the request never mentions skills. The work counts as the approval: the skill
writes the new skill or the change without asking about each aspect, adds an eval case for what the work adds, then
runs `check` and `test` and fixes what they find before the work is reported done.
