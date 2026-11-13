---
"cyber-agentkit": minor
---

`/skill` now asks for a description that is to the point: it opens with the job, in the words users type, with no lead-in such as "Use this skill when" or "Use when" and no filler words. The agent reads the description to decide whether to load the skill, so every word should serve that. TRG-1 checks it. Two kinds of skill are exempt, because the agent never picks them by their description: a name-only (direct-invocation) skill, whose description is a fixed marker, and a user-only skill, which turns model invocation off. The package's own skills now use descriptions in this form.
