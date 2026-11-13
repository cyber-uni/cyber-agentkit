---
"cyber-agentkit": minor
---

`/skill` derives each run's autonomy level from the situation, as SDD's leash does. `create`, `fix`, and `enhance`
state the level and its reason before the first change. With no author present, as in a session dispatched to
implement an issue, they do the work at `apply` and report each decision they made; a decision that is the author's
alone, such as changing a skill's Intent, still stops the run. The `skill-design.autonomy` default now says `derive`
for each command.
