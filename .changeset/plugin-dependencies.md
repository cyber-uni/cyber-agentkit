---
"@cyberuni/agent-harness": minor
---

Add the plugin dependency domain. `declaredPluginDependencies` and `readPluginDependencies` read the `dependencies` a Claude Code `plugin.json` declares. `checkPluginDependencies(harness, { pluginRoot })` reports each as `enabled`, `installed`, `disabled`, `missing`, or `unknown` using `installedPlugins` and `enabledPlugins`, and returns install steps: Claude Code's own commands, or manual steps on every harness without a dependency field, with a note that nothing is resolved for you.

The package now ships a `plugin-dependencies` reference, generated from the same facts, that the `reference` skill loads.
