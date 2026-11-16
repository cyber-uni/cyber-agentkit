import { execFile } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { readPluginDependencies } from '../dependencies/plugin-dependencies.js'
import type { InstalledPlugin } from '../plugins/installed-plugins.js'
import { pluginManifestName } from '../plugins/plugin-manifest.js'

/** A plugin a run loads beside the plugin under test, because that plugin, or one it needs, declares it. */
export type DependencyPlugin = { name: string; path: string }

/** Where a dependency's folder is found: the folders the author passed, then the harness's installed plugins. */
export type DependencySources = {
	/** Plugin folders the author named with `--plugin`; each is matched by its manifest `name`. */
	folders?: readonly string[] | undefined
	/** The plugins the harness has installed (`installedPlugins`). */
	installed?: readonly InstalledPlugin[] | undefined
}

/** The installed plugin a dependency resolves to: a user-scope install first, as the harness loads that one everywhere. */
function installedFolder(
	installed: readonly InstalledPlugin[],
	name: string,
	marketplace: string | undefined,
): string | undefined {
	const matches = installed.filter((plugin) =>
		marketplace ? plugin.id === `${name}@${marketplace}` : plugin.id.split('@')[0] === name,
	)
	return (matches.find((plugin) => plugin.scope === 'user') ?? matches[0])?.path
}

/**
 * The plugins a plugin needs, and the ones those need in turn, each with the folder a run loads it from (E-CC-X1,
 * E-CC-H10). Answers a problem naming the first one that has no folder, or whose manifest cannot be read.
 */
export async function resolveDependencyPlugins(
	root: string,
	name: string,
	sources: DependencySources,
): Promise<{ plugins: DependencyPlugin[] } | { problem: string }> {
	const named = new Map<string, string>()
	for (const folder of sources.folders ?? []) {
		const manifest = pluginManifestName(folder)
		if (manifest !== undefined && !named.has(manifest)) named.set(manifest, resolve(folder))
	}
	const plugins: DependencyPlugin[] = []
	const seen = new Set([name])
	const queue = [{ name, path: root }]
	for (let next = queue.shift(); next; next = queue.shift()) {
		const read = await readPluginDependencies(next.path)
		if (read.error) return { problem: `cannot read what ${next.name} depends on: ${read.error}` }
		for (const dependency of read.dependencies) {
			if (seen.has(dependency.name)) continue
			seen.add(dependency.name)
			const path =
				named.get(dependency.name) ?? installedFolder(sources.installed ?? [], dependency.name, dependency.marketplace)
			if (path === undefined) {
				const id = dependency.marketplace ? `${dependency.name}@${dependency.marketplace}` : dependency.name
				return {
					problem: `${next.name} depends on ${id}, which is not installed; install it (claude plugin install ${id}) or pass its folder with --plugin <folder>`,
				}
			}
			plugins.push({ name: dependency.name, path })
			queue.push({ name: dependency.name, path })
		}
	}
	return { plugins }
}

/** One plugin `claude plugin list --json` reports (E-CC-H10). */
export type ListedPlugin = { id?: string; enabled?: boolean; installPath?: string; errors?: string[] }

/** Lists the plugins a session loads from these folders, as `claude --plugin-dir … plugin list --json` does; tests pass a fake. */
export type PluginList = (folders: readonly string[]) => Promise<{ plugins: ListedPlugin[] } | { problem: string }>

/** `claude plugin list --json` with each folder as a `--plugin-dir`, under an empty config folder, as a run starts (E-CC-H10). */
export const listPlugins: PluginList = (folders) =>
	new Promise((done) => {
		const config = mkdtempSync(join(tmpdir(), 'skill-test-load-'))
		const env = { ...process.env, CLAUDE_CONFIG_DIR: config }
		const args = [...folders.flatMap((folder) => ['--plugin-dir', folder]), 'plugin', 'list', '--json']
		execFile('claude', args, { cwd: config, env, timeout: 60_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
			rmSync(config, { recursive: true, force: true })
			try {
				const plugins: unknown = JSON.parse(stdout)
				if (Array.isArray(plugins)) return done({ plugins: plugins as ListedPlugin[] })
			} catch {}
			done({ problem: error?.message ?? 'claude plugin list printed no JSON' })
		})
	})

const real = (path: string) => {
	try {
		return realpathSync(path)
	} catch {
		return resolve(path)
	}
}

/**
 * Checks that every plugin a run loads does load: each folder must be listed, enabled, with no errors. Answers the
 * problem when one does not, or a warning when the check itself could not run, so the test goes on unchecked.
 */
export async function checkPluginsLoad(
	plugins: readonly DependencyPlugin[],
	list: PluginList,
): Promise<{ problem: string } | { warning: string } | undefined> {
	const listed = await list(plugins.map((plugin) => plugin.path))
	if ('problem' in listed)
		return { warning: `could not check that the plugins load (claude plugin list: ${listed.problem.split('\n')[0]})` }
	for (const plugin of plugins) {
		const entry = listed.plugins.find(
			(item) => item.installPath !== undefined && real(item.installPath) === real(plugin.path),
		)
		if (!entry) return { problem: `${plugin.name} did not load from ${plugin.path}` }
		if (entry.errors?.length || entry.enabled === false)
			return {
				problem: `${plugin.name} does not load: ${entry.errors?.join('; ') || 'Claude Code lists it as disabled'}`,
			}
	}
	return undefined
}
