import { realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'

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

/** The extension namespaces a root `plugin.json` may author its dependency list under, newest first (E-DEP-6, E-DEP-7). */
const extensionNamespaces = ['io.github.cyber-uni.plugin-manager', 'org.cyberuni.universal-plugin'] as const

/**
 * Read what the plugin at `pluginRoot` declares: `dependencies` under `extensions["io.github.cyber-uni.plugin-manager"]`,
 * else under `extensions["org.cyberuni.universal-plugin"]` in the root `plugin.json`, else `dependencies` in
 * `.claude-plugin/plugin.json` (E-DEP-1, E-DEP-6, E-DEP-7).
 */
export async function readPluginDependencies(pluginRoot: string): Promise<PluginDependenciesRead> {
	const root = join(pluginRoot, 'plugin.json')
	const sources: { path: string; pick: (manifest: unknown) => unknown }[] = [
		...extensionNamespaces.map((namespace) => ({
			path: root,
			pick: (manifest: unknown) => {
				const extensions = isRecord(manifest) ? manifest.extensions : undefined
				return isRecord(extensions) ? extensions[namespace] : undefined
			},
		})),
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
	return { dependencies: [], path: sources.at(-1)?.path ?? pluginRoot, ...(error && { error }) }
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
	/** The marketplace a bare name resolves in, when known (the one passed in, else the one the plugin is installed from). */
	readonly declaringMarketplace?: string
	/**
	 * What to do next, in a fixed order: each `missing`, `disabled`, or `unknown` dependency's steps,
	 * in declared order, with the steps for the whole list around them. Empty when none needs any.
	 */
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
	/**
	 * The marketplace the declaring plugin comes from, where a bare name resolves (E-DEP-1). Defaults
	 * to the marketplace `pluginRoot` is installed from; with neither, a bare name is `unknown`.
	 */
	readonly declaringMarketplace?: string
}

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
	const declaringMarketplace =
		options.declaringMarketplace ?? (await installedFrom(options.pluginRoot, installed.plugins))

	const dependencies = read.dependencies.map((dependency): CheckedDependency => {
		if (!installed.supported) return { ...dependency, state: 'unknown' }
		// E-DEP-1: a bare name resolves in the declaring plugin's marketplace, never in another one.
		const marketplace = dependency.marketplace ?? declaringMarketplace
		if (marketplace === undefined) return { ...dependency, state: 'unknown' }
		const id = `${dependency.name}@${marketplace}`
		if (!installed.plugins.some((plugin) => plugin.id === id)) return { ...dependency, state: 'missing' }
		const flag = enablement.get(id)
		const state: DependencyState = flag === true ? 'enabled' : flag === false ? 'disabled' : 'installed'
		return { ...dependency, state, id }
	})

	const supported = supportsPluginDependencies(harness)
	return {
		harness,
		supported,
		autoResolved: supported,
		dependencies,
		...(declaringMarketplace && { declaringMarketplace }),
		steps: supported
			? claudeCodeSteps(dependencies, declaringMarketplace)
			: manualSteps(harness, dependencies, declaringMarketplace),
		...(read.error && { error: read.error }),
		research: ['E-DEP-1', 'E-DEP-2', 'E-DEP-3', 'E-DEP-4', 'E-DEP-5', 'E-DEP-6', 'E-DEP-7', 'E-CC-X1'],
	}
}

/** The marketplace of the install whose folder is `pluginRoot`, when exactly one marketplace has it there. */
async function installedFrom(
	pluginRoot: string | undefined,
	plugins: readonly { readonly id: string; readonly path: string }[],
): Promise<string | undefined> {
	if (pluginRoot === undefined) return undefined
	const real = (path: string) => realpath(path).catch(() => resolve(path))
	const root = await real(pluginRoot)
	const marketplaces = new Set<string>()
	for (const plugin of plugins) {
		const at = plugin.id.indexOf('@')
		if (at > 0 && (await real(plugin.path)) === root) marketplaces.add(plugin.id.slice(at + 1))
	}
	return marketplaces.size === 1 ? [...marketplaces][0] : undefined
}

const label = (dependency: PluginDependency) =>
	dependency.marketplace ? `${dependency.name}@${dependency.marketplace}` : dependency.name

/** R13 (N5): no verified query tells which marketplaces a harness has added, so the user is asked. */
const marketplaceQuestion = (dependency: PluginDependency, harness: string) =>
	`Check that the marketplace ${dependency.marketplace} is added to ${harness}, and add it if it is not.`

/** R12: an unknown bare name gets no guessed command. */
const unknownDeclaringStep = (dependency: PluginDependency) =>
	`${dependency.name} names no marketplace, and the marketplace of the plugin that declares it is not known. Install that plugin from a marketplace, or declare ${dependency.name}@<marketplace> with one.`

/**
 * E-DEP-2: `plugin install` installs a plugin and its dependencies; E-DEP-3: a dependency in another
 * marketplace needs the root marketplace's allow-list. Per dependency: install or enable, the
 * marketplace question, the add-the-marketplace step; then the reload step for the whole list.
 */
function claudeCodeSteps(dependencies: readonly CheckedDependency[], declaring: string | undefined): string[] {
	const steps: string[] = []
	let changes = false
	for (const dependency of dependencies) {
		if (dependency.state === 'disabled') {
			steps.push(`Enable ${dependency.id ?? label(dependency)}: set it to true in enabledPlugins.`)
			changes = true
			continue
		}
		if (dependency.state !== 'missing' && dependency.state !== 'unknown') continue
		const marketplace = dependency.marketplace ?? declaring
		if (marketplace === undefined) {
			steps.push(unknownDeclaringStep(dependency))
			continue
		}
		const id = `${dependency.name}@${marketplace}`
		steps.push(
			dependency.state === 'missing'
				? `Install ${id}: claude plugin install ${id}`
				: `Check whether ${id} is installed and enabled. If it is not, install it: claude plugin install ${id}`,
		)
		changes = true
		if (dependency.state !== 'missing' || dependency.marketplace === undefined) continue
		steps.push(marketplaceQuestion(dependency, 'Claude Code'))
		if (dependency.marketplace !== declaring)
			steps.push(
				`Add the marketplace ${dependency.marketplace}: the root marketplace must list it in allowCrossMarketplaceDependenciesOn, or you must already have ${id} enabled. Otherwise the install completes and the plugin fails to load.`,
			)
	}
	if (changes) steps.push('Run /reload-plugins.')
	return steps
}

/**
 * E-DEP-4, E-DEP-5, E-CC-X1: no other harness's manifest declares dependencies, and no install
 * command is verified, so each step is manual. The first says nothing is installed for the user.
 */
function manualSteps(
	harness: HarnessId,
	dependencies: readonly CheckedDependency[],
	declaring: string | undefined,
): string[] {
	const steps: string[] = []
	for (const dependency of dependencies) {
		const marketplace = dependency.marketplace ?? declaring
		const from = marketplace ? ` from ${marketplace}` : ''
		if (dependency.state === 'disabled') {
			steps.push(`Enable ${dependency.id ?? label(dependency)} through ${harness}'s plugin settings.`)
		} else if (dependency.state === 'missing') {
			steps.push(`Install ${dependency.name}${from} through ${harness}'s plugin install flow, then enable it.`)
			if (dependency.marketplace) steps.push(marketplaceQuestion(dependency, harness))
		} else if (dependency.state === 'unknown') {
			steps.push(
				dependency.marketplace === undefined && declaring === undefined
					? unknownDeclaringStep(dependency)
					: `Check whether ${dependency.name}${from} is installed and enabled in ${harness}. If it is not, install it through ${harness}'s plugin install flow, then enable it.`,
			)
		}
	}
	if (steps.length === 0) return []
	return [
		`${harness} has no plugin dependency field, so nothing is installed for you. Install and enable each plugin yourself.`,
		...steps,
	]
}
