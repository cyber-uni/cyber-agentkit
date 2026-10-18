import { join } from 'node:path'

import type { HarnessEnvironment } from '../harness/harness-environment.js'
import type { HarnessId } from '../harness/harness-id.js'
import { enabledPlugins } from '../plugins/enabled-plugins.js'
import { installedPlugins } from '../plugins/installed-plugins.js'
import { isRecord, readText, stripJsonComments } from '../plugins/json-file.js'
import { supportsPluginDependencies } from '../plugins/plugin-dependencies.js'

/** One plugin another plugin declares it needs. */
export interface PluginDependency {
	readonly name: string
	/** The marketplace to resolve it in. Absent: the declaring plugin's own marketplace (E-DEP-1). */
	readonly marketplace?: string
	/** The version the declaring plugin asked for. Reported, never compared. */
	readonly version?: string
}

/**
 * Read the `dependencies` array of a Claude Code `plugin.json`: `"name"`, `"name@marketplace"`, or
 * `{ name, marketplace, version }` entries (E-DEP-1, E-CC-X1). Entries of any other shape are skipped.
 */
export function declaredPluginDependencies(manifest: unknown): PluginDependency[] {
	const entries = isRecord(manifest) ? manifest.dependencies : undefined
	if (!Array.isArray(entries)) return []
	const dependencies: PluginDependency[] = []
	for (const entry of entries) {
		const raw = typeof entry === 'string' ? entry : isRecord(entry) ? entry.name : undefined
		if (typeof raw !== 'string' || raw === '') continue
		const [name, inline] = raw.split('@') as [string, string | undefined]
		if (name === '') continue
		const object = isRecord(entry) ? entry : {}
		const marketplace = nonEmpty(object.marketplace) ?? nonEmpty(inline)
		const version = nonEmpty(object.version)
		dependencies.push({ name, ...(marketplace && { marketplace }), ...(version && { version }) })
	}
	return dependencies
}

const nonEmpty = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined)

export interface PluginDependenciesRead {
	readonly dependencies: readonly PluginDependency[]
	/** The manifest the list came from; the last one tried when none declares any. */
	readonly path: string
	/** Set when the manifest exists but could not be parsed. */
	readonly error?: string
}

/**
 * Read what the plugin at `pluginRoot` declares: `extensions["org.cyberuni.universal-plugin"].dependencies` in the
 * root `plugin.json`, else `dependencies` in `.claude-plugin/plugin.json` (E-DEP-1, E-DEP-6).
 */
export async function readPluginDependencies(pluginRoot: string): Promise<PluginDependenciesRead> {
	const sources: { path: string; pick: (manifest: unknown) => unknown }[] = [
		{
			path: join(pluginRoot, 'plugin.json'),
			pick: (manifest) => {
				const extensions = isRecord(manifest) ? manifest.extensions : undefined
				return isRecord(extensions) ? extensions['org.cyberuni.universal-plugin'] : undefined
			},
		},
		{ path: join(pluginRoot, '.claude-plugin', 'plugin.json'), pick: (manifest) => manifest },
	]
	let error: string | undefined
	for (const { path, pick } of sources) {
		try {
			const text = await readText(path)
			if (text === undefined) continue
			const dependencies = declaredPluginDependencies(pick(JSON.parse(stripJsonComments(text))))
			if (dependencies.length > 0) return { dependencies, path }
		} catch (cause) {
			error ??= `${path}: ${String(cause)}`
		}
	}
	return { dependencies: [], path: sources[1]?.path ?? pluginRoot, ...(error && { error }) }
}

export type DependencyState = 'enabled' | 'disabled' | 'installed' | 'missing' | 'unknown'

export interface CheckedDependency extends PluginDependency {
	readonly state: DependencyState
	/** The `<plugin>@<marketplace>` install the state was read from. */
	readonly id?: string
}

export interface PluginDependencyCheck {
	readonly harness: HarnessId
	/** Whether the harness's manifest can declare dependencies (`supportsPluginDependencies`). */
	readonly supported: boolean
	/** Whether the harness installs missing dependencies by itself. Only Claude Code does (E-DEP-2). */
	readonly autoResolved: boolean
	readonly dependencies: readonly CheckedDependency[]
	/** What to do next, in order. Empty when nothing is missing or disabled. */
	readonly steps: readonly string[]
	/** Set when the declaring manifest could not be read. */
	readonly error?: string
	readonly research: readonly string[]
}

export interface CheckPluginDependenciesOptions extends HarnessEnvironment {
	/** The plugin whose manifest declares the dependencies. */
	readonly pluginRoot?: string
	/** Dependencies already read; used instead of `pluginRoot`. */
	readonly dependencies?: readonly PluginDependency[]
}

const rank: Record<DependencyState, number> = { enabled: 3, installed: 2, disabled: 1, missing: 0, unknown: 0 }

/**
 * Check which declared dependencies the harness has installed and enabled, and return the steps
 * that settle the rest. Nothing is installed.
 */
export async function checkPluginDependencies(
	harness: HarnessId,
	options: CheckPluginDependenciesOptions = {},
): Promise<PluginDependencyCheck> {
	const read = options.dependencies
		? { dependencies: options.dependencies, error: undefined }
		: options.pluginRoot
			? await readPluginDependencies(options.pluginRoot)
			: { dependencies: [], error: undefined }
	const [installed, enabled] = await Promise.all([installedPlugins(harness, options), enabledPlugins(harness, options)])
	const enablement = new Map(enabled.plugins.map((plugin) => [plugin.id, plugin.enabled]))

	const dependencies = read.dependencies.map((dependency): CheckedDependency => {
		if (!installed.supported) return { ...dependency, state: 'unknown' }
		const ids = installed.plugins
			.map((plugin) => plugin.id)
			.filter((id) =>
				dependency.marketplace
					? id === `${dependency.name}@${dependency.marketplace}`
					: id.split('@')[0] === dependency.name,
			)
		let best: CheckedDependency = { ...dependency, state: 'missing' }
		for (const id of new Set(ids)) {
			const flag = enablement.get(id)
			const state: DependencyState = flag === true ? 'enabled' : flag === false ? 'disabled' : 'installed'
			if (rank[state] > rank[best.state]) best = { ...dependency, state, id }
		}
		return best
	})

	const supported = supportsPluginDependencies(harness)
	return {
		harness,
		supported,
		autoResolved: supported,
		dependencies,
		steps: supported ? claudeCodeSteps(dependencies) : manualSteps(harness, read.dependencies),
		...(read.error && { error: read.error }),
		research: ['E-DEP-1', 'E-DEP-2', 'E-DEP-3', 'E-DEP-4', 'E-DEP-5', 'E-DEP-6', 'E-CC-X1'],
	}
}

const label = (dependency: PluginDependency) =>
	dependency.marketplace ? `${dependency.name}@${dependency.marketplace}` : dependency.name

/** E-DEP-2: `plugin install` installs missing dependencies; E-DEP-3: cross-marketplace needs a root allow-list. */
function claudeCodeSteps(dependencies: readonly CheckedDependency[]): string[] {
	const steps: string[] = []
	for (const dependency of dependencies) {
		if (dependency.state === 'missing' || dependency.state === 'unknown') {
			steps.push(`Install ${label(dependency)}: claude plugin install ${label(dependency)}`)
			if (dependency.marketplace) {
				steps.push(
					`If ${label(dependency)} is not in the declaring plugin's marketplace, that marketplace's root must list ${dependency.marketplace} in allowCrossMarketplaceDependenciesOn, or you must already have it enabled.`,
				)
			}
		} else if (dependency.state === 'disabled') {
			steps.push(`Enable ${dependency.id ?? label(dependency)}: set it to true in enabledPlugins.`)
		}
	}
	if (steps.length > 0) steps.push('Run /reload-plugins.')
	return steps
}

/** E-DEP-4, E-DEP-5, E-CC-X1: no other harness's manifest declares dependencies. */
function manualSteps(harness: HarnessId, dependencies: readonly PluginDependency[]): string[] {
	if (dependencies.length === 0) return []
	return [
		`${harness} has no plugin dependency field, so nothing is resolved for you. Install and enable each plugin yourself.`,
		...dependencies.map(
			(dependency) =>
				`Install ${dependency.name}${dependency.marketplace ? ` from ${dependency.marketplace}` : ''} through ${harness}'s plugin install flow, then enable it.`,
		),
	]
}
