---
"cyber-agentkit": minor
---

Reference names now resolve to JSON, YAML, TOML, and text files as well as Markdown. A data file is not merged: the highest tier holding it answers whole, and `show` and `list` report its format.

A skill's assets can be loaded by name through the same tiers and `select` with `reference show --assets` or `loadReference(name, { folder: 'assets' })`, so a plugin, the project, or the user can override which data file a skill loads.
