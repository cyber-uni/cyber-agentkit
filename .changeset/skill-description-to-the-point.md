---
"cyber-agentkit": minor
---

`/skill` now asks for a description that is to the point: it opens with the job, in the words users type, with no lead-in such as "Use this skill when" or "Use when" and no filler words. The agent reads the description to decide whether to load the skill, so every word should serve that. TRG-1 checks it. A skill only a user invokes directly, which the agent never loads on its own, is exempt. The `skill` skill's own description follows the new form.
