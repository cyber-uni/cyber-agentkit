---
"cyber-agentkit": minor
---

`skill doctor [skills...]` examines whether each skill's references work as installed and configured here. It reads the load lines of what an agent reads when the skill runs (its `SKILL.md` and `references/`, outside fenced examples), checks each name as `reference check` composes it through the tiers with the skill's own default joined, and, for an interface whose implementations the skill loads, checks the interface and each implementation. Per reference it reports the tiers that answer it, the file on top, and each failure or warning with what to do, such as `reference customize` or `reference migrate`. It changes nothing, and exits 1 only when a reference fails. Given no skill, it examines every skill the detected harnesses load here. `ReferenceLayers.skills.loaded` lists those skills, whether or not they hold a default.
