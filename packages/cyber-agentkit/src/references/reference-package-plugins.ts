import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { declaredDependencies, packageDir } from '../plugins/package-dependencies.js'
import { pluginManifestName, pluginVersion } from '../plugins/plugin-manifest.js'
import type { ReferenceLayers } from './reference-layers.js'
import { type ProjectFolderCache, type ProjectFolders, projectFolders } from './reference-projects.js'

/** A plugin a `package.json` below the root declares, which reaches only that package's folder (K36). */
export type PackagePlugin = {
	/** The package's folder, relative to the root, with `/` between segments. */
	folder: string
	/** Its manifest `name`. */
	plugin: string
	/** The plugin root, which holds its `references/`. */
	root: string
	version?: string | undefined
}

/** One answer per discovery, so a run resolving many names reads each `package.json` once. */
const found = new WeakMap<ProjectFolders, PackagePlugin[]>()

function readJson(path: string): unknown {
	try {
		return JSON.parse(readFileSync(path, 'utf8'))
	} catch {
		return undefined
	}
}

function declared(top: string, folders: readonly string[]): PackagePlugin[] {
	const plugins: PackagePlugin[] = []
	for (const folder of folders) {
		const manifestPath = join(top, ...folder.split('/'), 'package.json')
		const manifest = readJson(manifestPath)
		for (const pkg of declaredDependencies(manifest)) {
			const dir = packageDir(pkg, manifestPath)
			const plugin = dir && pluginManifestName(dir)
			if (!dir || !plugin) continue
			// An outer package declaring the plugin already covers this folder (UC21.2).
			if (plugins.some((outer) => outer.plugin === plugin && folder.startsWith(`${outer.folder}/`))) continue
			if (plugins.some((same) => same.plugin === plugin && same.folder === folder)) continue
			plugins.push({ folder, plugin, root: dir, version: pluginVersion(dir) })
		}
	}
	return plugins
}

/**
 * The package plugins below `root`, in path order (R115): each plugin a `package.json` in a folder
 * git does not ignore declares, less the ones `held` names (the plugin tier holds them, so they are
 * in the main document) and the ones a package outside that folder already declares.
 */
export function packagePlugins(
	root: string,
	cache: ProjectFolderCache | undefined,
	held: ReadonlySet<string>,
): PackagePlugin[] {
	const folders = projectFolders(root, cache)
	let all = found.get(folders)
	if (!all) {
		all = declared(root, folders.packages)
		found.set(folders, all)
	}
	return all.filter(({ plugin }) => !held.has(plugin))
}

/** The `references/` folder of a package plugin. */
export function packagePluginReferences(plugin: PackagePlugin): string {
	return join(plugin.root, 'references')
}

/** The plugins the plugin tier holds: each read plugin layer's, and each plugin read for its version (R13). */
export function heldPlugins({ layers, plugins = [] }: Pick<ReferenceLayers, 'layers' | 'plugins'>): Set<string> {
	return new Set([
		...layers.flatMap(({ tier, plugin, skipped }) => (tier === 'plugin' && plugin && !skipped ? [plugin] : [])),
		...plugins.flatMap(({ plugin, origin }) => (origin === 'package' ? [] : [plugin])),
	])
}
