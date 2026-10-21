---
"cyber-agentkit": patch
---

`skillsDirectories('cursor')` adds `.grok/skills` and lists Cursor's folders in the order it reads them. `skillsDirectories('copilot-cli')` gains `relocatedBy`: when `COPILOT_HOME` names another folder, Copilot CLI reads `$COPILOT_HOME/skills` instead of its user folders.
