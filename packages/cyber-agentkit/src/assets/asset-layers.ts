import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type { HarnessId } from '../harness/harness-id.js'
import type { Platform } from '../harness/platform.js'
import { isRecord } from '../plugins/json-file.js'
import { declaredDependencies, packageDir } from '../plugins/package-dependencies.js'
import { pluginManifestName } from '../plugins/plugin-manifest.js'
import { skillName } from '../skills/skill-folder.js'
import { detectedHarnesses, enabledPluginLayers, harnessManagedLayers } from './asset-harness-layers.js'

/** Where an asset lives. Listed highest first. */
export type AssetTier = 'managed' | 'project' | 'user' | 'plugin' | 'default'

/** A fault that never stops a name from resolving. The `code` is stable; the `message` is for a person. */
export type AssetWarning = {
	code: 'default-folder-missing' | 'default-in-tier' | 'file-ignored' | 'selection-invalid'
	message: string
}

export type AssetLayer = {
	tier: AssetTier
	/** The `assets/` folder read for this tier. */
	dir: string
	/** The plugin tier: the plugin's manifest `name`, which a qualified `<plugin>/<name>` uses. */
	plugin?: string | undefined
	/** The default tier: the skill's `SKILL.md` `name`. */
	skill?: string | undefined
	/** Set when the layer is never read, and why: policy held in MDM, a plugin with no install folder. */
	skipped?: string | undefined
	/** Raised on every name resolved through this layer, such as a `--default` folder that does not exist. */
	warning?: AssetWarning | undefined
}

export type AssetPlugin = {
	/** Its manifest `name`, which a qualified `<plugin>/<name>` uses. */
	name: string
	/** The plugin root, which holds its `assets/`. */
	root: string
}

export type AssetLayerOptions = {
	root: string
	home: string
	platform: Platform
	/** The plugin running the resolver. Its `assets/` is the first plugin layer. */
	plugin?: AssetPlugin | undefined
	/** The calling skill's folder: its `assets/<name>.<ext>` forms the `default` tier. */
	defaultSkill?: string | undefined
	/** Detects the harness and reads its settings. Defaults to `process.env`. */
	env?: Readonly<Record<string, string | undefined>>
}

export type AssetLayers = {
	/** Highest first: managed, project (nearest first), user, plugin, default. */
	layers: AssetLayer[]
	/** The harnesses detected, whose managed folders and enabled plugins were read. */
	harnesses: readonly HarnessId[]
}

export function projectAssetsDir(root: string): string {
	return join(root, '.agents', 'assets')
}

export function userAssetsDir(home: string): string {
	return join(home, '.agents', 'assets')
}

function readJson(path: string): unknown {
	try {
		return JSON.parse(readFileSync(path, 'utf8'))
	} catch {
		return undefined
	}
}

function isRepositoryRoot(dir: string): boolean {
	if (existsSync(join(dir, '.git')) || existsSync(join(dir, 'pnpm-workspace.yaml'))) return true
	const manifest = readJson(join(dir, 'package.json'))
	return isRecord(manifest) && manifest['workspaces'] !== undefined
}

/**
 * `root` and each folder above it up to the repository root, nearest first. With no repository root
 * above, `root` alone: a walk that never finds one would read every ancestor up to the filesystem root.
 */
export function projectChain(root: string): string[] {
	const start = resolve(root)
	const chain: string[] = []
	let dir = start
	for (;;) {
		chain.push(dir)
		if (isRepositoryRoot(dir)) return chain
		const parent = dirname(dir)
		if (parent === dir) return [start]
		dir = parent
	}
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory()
	} catch {
		return false
	}
}

function nearestManifest(root: string): string | undefined {
	let dir = root
	for (;;) {
		const path = join(dir, 'package.json')
		if (existsSync(path)) return path
		const parent = dirname(dir)
		if (parent === dir) return undefined
		dir = parent
	}
}

function canonical(path: string): string {
	try {
		return realpathSync(path)
	} catch {
		return path
	}
}

/** Declared dependencies only; only a package with a plugin manifest is a plugin, named by that manifest. */
function dependencyLayers(root: string, skip: ReadonlySet<string>): AssetLayer[] {
	const manifestPath = nearestManifest(root)
	if (!manifestPath) return []
	const layers: AssetLayer[] = []
	for (const pkg of declaredDependencies(readJson(manifestPath))) {
		const dir = packageDir(pkg, manifestPath)
		if (!dir || skip.has(canonical(dir))) continue
		const assets = join(dir, 'assets')
		if (!isDirectory(assets)) continue
		const plugin = pluginManifestName(dir)
		layers.push(
			plugin ? { tier: 'plugin', dir: assets, plugin } : { tier: 'plugin', dir: assets, skipped: 'not a plugin' },
		)
	}
	return layers
}

/** The `default` tier for the skill at `folder`; a folder that does not exist warns and adds no contribution. */
export function defaultAssetLayer(folder: string): AssetLayer {
	const dir = join(folder, 'assets')
	if (!isDirectory(folder)) {
		return {
			tier: 'default',
			dir,
			skill: basename(folder),
			skipped: 'no skill folder',
			warning: {
				code: 'default-folder-missing',
				message: `the skill folder ${folder} does not exist; the name resolves without its default`,
			},
		}
	}
	return { tier: 'default', dir, skill: skillName(folder) ?? basename(folder) }
}

export async function assetLayers({
	root,
	home,
	platform,
	plugin,
	defaultSkill,
	env = process.env,
}: AssetLayerOptions): Promise<AssetLayers> {
	const harnesses = detectedHarnesses(env)
	const chain = projectChain(root)
	const ownRoot = plugin && canonical(plugin.root)
	const enabled = await enabledPluginLayers(harnesses, chain, { env, homedir: home, cwd: resolve(root), platform })
	const layers: AssetLayer[] = [
		...harnessManagedLayers(harnesses, platform, env),
		...chain.map((dir): AssetLayer => ({ tier: 'project', dir: projectAssetsDir(dir) })),
		{ tier: 'user', dir: userAssetsDir(home) },
		...(plugin ? [{ tier: 'plugin' as const, dir: join(plugin.root, 'assets'), plugin: plugin.name }] : []),
		...enabled.filter(
			(layer) => layer.skipped || (isDirectory(layer.dir) && canonical(dirname(layer.dir)) !== ownRoot),
		),
		...dependencyLayers(root, new Set(ownRoot ? [ownRoot] : [])),
		...(defaultSkill === undefined ? [] : [defaultAssetLayer(resolve(defaultSkill))]),
	]
	// A repository checked out at the home directory would read the same folder as project and user.
	const seen = new Set<string>()
	const placed = layers.filter(({ dir }) => !seen.has(dir) && seen.add(dir))
	return { layers: placed, harnesses }
}
