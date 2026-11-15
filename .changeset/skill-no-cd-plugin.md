---
"cyber-agentkit": patch
---

`/skill` now also tells the agent never to `cd` into its plugin's folders, such as the plugin's `references/`, not just
the skill's own folder: either may be read-only, and a shell left there fails every later command.
