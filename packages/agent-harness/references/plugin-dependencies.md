---
description: How to install the plugins another plugin depends on, for Claude Code and for every harness that has no dependency field.
tags: [plugin, dependencies, install]
---

## What a plugin declares

Only Claude Code's manifest declares dependencies: a `dependencies` array in `.claude-plugin/plugin.json` whose entries are `"name"`, `"name@marketplace"`, or `{ "name", "marketplace", "version" }` (E-DEP-1). A bare name resolves in the declaring plugin's own marketplace. A plugin can author the same list once in its root `plugin.json`, at `extensions["org.spikyuni.plugin-manager"].dependencies` or, in plugins built before that key, `extensions["org.cyberuni.universal-plugin"].dependencies` (E-DEP-6, E-DEP-7). Read it from there first, then from `.claude-plugin/plugin.json`, whichever harness you run on.

## Check what is missing

Run the library's `checkPluginDependencies(harness, { pluginRoot })`. It reports each dependency as `enabled`, `installed` (no explicit setting), `disabled`, `missing`, or `unknown` (the harness keeps no readable install record), and returns the steps below that apply. It installs nothing.

## Claude Code

Claude Code resolves dependencies itself. `claude plugin install`, `/reload-plugins`, auto-update, and `marketplace add` install the missing ones, and a plugin whose dependency is missing or disabled does not load (E-DEP-2).

1. For a missing dependency, run `claude plugin install <name>@<marketplace>`.
2. For a disabled dependency, set its `<name>@<marketplace>` key to `true` in `enabledPlugins`.
3. Run `/reload-plugins`.

A dependency in another marketplace is not installed unless the root marketplace lists it in `allowCrossMarketplaceDependenciesOn`, or you already have it enabled. Without that, the install completes and the plugin then fails to load (E-DEP-3).

## Every other harness

`cursor`, `codex`, `copilot-cli`, `opencode`, `kilo`, `gemini-cli`, `qwen-code`, `vscode-copilot`, `cline`, `crush`, `openhands`, `augment` have no dependency field (E-DEP-4, E-DEP-5, E-CC-X1). Nothing is resolved for you, and no install command is given because none has been verified.

1. Read the dependencies as above.
2. Tell the user which marketplace each one needs. You cannot tell whether the harness has that marketplace added, so ask the user to check, and to add it if it is not.
3. Install each one through the harness's own plugin install flow, from its marketplace when one is named.
4. Enable each one.
