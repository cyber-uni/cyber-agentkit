---
"cyber-agentkit": minor
---

`reference load` now reads the plugins a workspace package lists in its own `package.json`. Each one that the plugin tier does not already hold adds a project section for that package's folder: its version of the name, ahead of the folder's own section, marked `<project folder="..." plugin="...">` in text and carrying `plugin` in structured output. The main document stays the same from every folder. `list`, `search`, and the trace name the plugin, and `customize --in <folder>` reads those sections and records their plugins as sources, so the section goes stale when one changes.
