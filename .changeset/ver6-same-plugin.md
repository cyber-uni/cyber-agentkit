---
"cyber-agentkit": patch
---

`/skill` and its VER-6 check now count a skill from the same plugin as installed: a trigger near miss that such a skill takes is valid, since it is always installed beside the skill and the test loads it. Only a near miss taken by a skill from outside the plugin is ruled out.
