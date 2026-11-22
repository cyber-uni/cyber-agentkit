import { harnessIds } from '../harness/harness-id.js'
import { supportsPluginDependencies } from '../plugins/plugin-dependencies.js'

/**
 * Render the `plugin-dependencies` reference from the dependency domain's facts: which harnesses
 * declare dependencies (`supportsPluginDependencies`) and what the steps are for each case. The
 * committed `references/plugin-dependencies.md` must equal this; `pnpm run generate:references`
 * rewrites it.
 */
export function renderDependencyReference(): string {
	const others = harnessIds.filter((harness) => !supportsPluginDependencies(harness))
	return `---
description: How to install the plugins another plugin depends on, for Claude Code and for every harness that has no dependency field.
tags: [plugin, dependencies, install]
---

## What a plugin declares

Only Claude Code's manifest declares dependencies: a \`dependencies\` array in \`.claude-plugin/plugin.json\` whose entries are \`"name"\`, \`"name@marketplace"\`, or \`{ "name", "marketplace", "version" }\` (E-DEP-1). A bare name resolves in the declaring plugin's own marketplace. A plugin can author the same list once in its root \`plugin.json\`, at \`extensions["io.github.cyber-uni.plugin-manager"].dependencies\` or, in plugins built before that key, \`extensions["org.cyberuni.universal-plugin"].dependencies\` (E-DEP-6 to E-DEP-8). Read it from there first, then from \`.claude-plugin/plugin.json\`, whichever harness you run on.

## Check what is missing

Run \`cyber-agentkit dependency doctor --plugin <root>\`, or call the library's \`checkPluginDependencies(harness, { pluginRoot })\`. Both report each dependency as \`enabled\`, \`installed\` (no explicit setting), \`disabled\`, \`missing\`, or \`unknown\` (the harness keeps no readable install record, or a bare name's declaring marketplace is not known), and returns the steps below that apply, with each problem's code. Neither installs anything.

## Claude Code

Claude Code resolves dependencies itself. \`claude plugin install\`, \`/reload-plugins\`, auto-update, and \`marketplace add\` install the missing ones, and a plugin whose dependency is missing or disabled does not load (E-DEP-2).

1. For a missing dependency, run \`claude plugin install <name>@<marketplace>\`. A bare name installs as \`<name>@<declaring marketplace>\`, the marketplace the declaring plugin is installed from. When that is not known, no command is guessed: install the declaring plugin from a marketplace, or name the dependency's marketplace.
2. For a missing dependency that names a marketplace, ask the user to check that the marketplace is added, and to add it if it is not.
3. For a disabled dependency, set its \`<name>@<marketplace>\` key to \`true\` in \`enabledPlugins\`.
4. When any dependency was installed or enabled, run \`/reload-plugins\`.

A dependency in another marketplace than the declaring plugin's is not installed unless the root marketplace lists it in \`allowCrossMarketplaceDependenciesOn\`, or you already have it enabled. Without that, the install completes and the plugin then fails to load (E-DEP-3).

## Every other harness

${others.map((harness) => `\`${harness}\``).join(', ')} have no dependency field (E-DEP-4, E-DEP-5, E-CC-X1). Nothing is installed for you, and no install command is given because none has been verified. Act only on a dependency that is missing, disabled, or unknown, and do not reload.

1. Read the dependencies as above.
2. For a missing one, tell the user which marketplace it needs. You cannot tell whether the harness has that marketplace added, so ask the user to check, and to add it if it is not.
3. Install each missing one through the harness's own plugin install flow, from its marketplace, or for a bare name from the declaring plugin's marketplace.
4. Enable each one that is disabled or newly installed.
`
}
