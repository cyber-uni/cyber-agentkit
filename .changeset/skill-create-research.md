---
"cyber-agentkit": minor
---

`/skill create` researches a skill's job before its Intent is final, through a new open aspect,
`skill-design.aspects.research`. The default delegates to `research-workbench:deep-research`, sizes the research to
the skill (full, a quick prior-art search, or a recorded skip), and stops to ask whether to adopt an existing skill
that already does the job. `check` reports its checks RES-1 to RES-3; a skill written before this step passes RES-1
by recording `Skipped: written before the research step` under `## Research` in its README.
