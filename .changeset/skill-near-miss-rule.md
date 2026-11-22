---
"cyber-agentkit": patch
---

`/skill` now takes a trigger near miss only when the skill's own description rules it out. A near miss that is rejected only when another skill is installed to take it cannot be tested, since a test loads a fixed set of skills; VER-6 checks for it, and its fix drops such a case or asks the author whether to mark it known to fail.
