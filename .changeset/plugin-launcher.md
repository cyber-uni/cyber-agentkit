---
'cyber-agentkit': minor
---

Ship a plugin-local `cyber-agentkit` launcher. `plugin.json` now declares it, `plugin build` writes `bin/cyber-agentkit`, and the skills call the bare `cyber-agentkit` command first when it is on the PATH, falling back to `pnpm exec` and the pinned `npx`. `pnpm plugin:check` fails when the launcher is missing or stale.
