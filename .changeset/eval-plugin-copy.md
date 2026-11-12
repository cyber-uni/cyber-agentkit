---
"cyber-agentkit": minor
---

`skill test` gives each run a copy of the skill's plugin of its own, committed in git, and names it to `script` checks as `$SKILL_TEST_PLUGIN`, so a check can tell whether the run changed the installed plugin or run the plugin's scripts.
