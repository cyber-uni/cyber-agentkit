---
"cyber-agentkit": minor
---

Add the `asset` skill and command. It lists, shows, creates, updates, and deletes the files in a skill's assets folder by path, and loads one by name through the managed, project, user, and plugin tiers with `asset load`, `asset names`, `asset where`, and `asset select` (library: `loadAsset`), with no merging or extending, so a plugin, the project, or the user can override which data file a skill loads.
