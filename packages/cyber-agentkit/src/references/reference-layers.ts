import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type { HarnessId } from '../harness/harness-id.js'
import type { Platform } from '../harness/platform.js'
import { isRecord } from '../plugins/json-file.js'
import { declaredDependencies, packageDir } from '../plugins/package-dependencies.js'
import { pluginManifestName } from '../plugins/plugin-manifest.js'
import { harnessSkillFolders, pluginSkillFolders } from '../skills/harness-skill-folders.js'
import { type FoundSkill, skillName, skillsIn } from '../skills/skill-folder.js'
import { detectedHarnesses, enabledPluginLayers, harnessManagedLayers } from './harness-layers.js'
import type { ReferenceWarning } from './reference-warning.js'

/** Where a contribution lives. Listed highest first; the stack (plugins and `default`) is ordered by `extends`. */
export type ReferenceTier = 'managed' | 'project' | 'user' | 'plugin' | 'default'

export type ReferenceLayer = {
	tier: ReferenceTier
	/** The folder read for contributions. */
	dir: string
	/** The plugin tier: the plugin's manifest `name`, which a qualified `<plugin>/<name>` uses. */
	plugin?: string | undefined
	/** The default tier: the skill's `SKILL.md` `name`. */
	skill?: string | undefined
	/** Set when the layer is never read, and why: policy held in MDM, a plugin with no install folder. */
	skipped?: string | undefined
	/** The default tier of an assets call: files are `<name>.<ext>` with no `.default` marker. */
	plain?: boolean | undefined
	/** Raised on every name resolved through this layer, such as a `--default` folder that does not exist. */
	warning?: ReferenceWarning | undefined
}

export type ReferenceFolder = 'references' | 'assets'

export type ReferenceLayerOptions = {
	root: string
	home: string
	platform: Platform
	/**
	 * The plugin running the resolver. Its `references/` is the first plugin layer, and its install,
	 * when a harness has it enabled, is not read a second time.
	 */
	plugin?: ReferencePlugin | undefined
	/** The calling skill's folder: its `references/<name>.default.md` forms the `default` tier. */
	defaultSkill?: string | undefined
	/** The folder every tier reads: `references` (the default), or `assets` for an assets call. */
	folder?: ReferenceFolder | undefined
	/** Detects the harness and reads its settings. Defaults to `process.env`. */
	env?: Readonly<Record<string, string | undefined>>
}

export type ReferencePlugin = {
	/** Its manifest `name`, which a qualified `<plugin>/<name>` uses. */
	name: string
	/** The plugin root, which holds its `references/`. */
	root: string
}

export type ReferenceLayers = {
	/** Highest first: managed, project (nearest first), user, plugin, default. */
	layers: ReferenceLayer[]
	/** The harnesses detected, whose managed folders and enabled plugins were read. */
	harnesses: readonly HarnessId[]
	/** The installed skills that hold a default, which `list`, `search`, and `check` reach. */
	skills?: SkillDefaults | undefined
}

/** The installed skills holding a default contribution, found in the skill folders the detected harnesses read. */
export type SkillDefaults = {
	skills: FoundSkill[]
	/** Why some skills' defaults are not listed: no harness detected, or one whose skill folders are not verified. */
	unverified?: string | undefined
}

export function projectReferencesDir(root: string): string {
	return join(root, '.agents', 'references')
}

export function userReferencesDir(home: string): string {
	return join(home, '.agents', 'references')
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

/** The repository root the project tier reads up to, or `undefined` when there is none above `root`. */
export function repositoryRoot(root: string): string | undefined {
	const chain = projectChain(root)
	const top = chain.at(-1) as string
	return isRepositoryRoot(top) ? top : undefined
}

export function isDirectory(path: string): boolean {
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

export function canonical(path: string): string {
	try {
		return realpathSync(path)
	} catch {
		return path
	}
}

/**
 * Declared dependencies only: a transitive package never becomes a plugin, because a reference is
 * instruction text an agent follows. Only a package with a plugin manifest is a plugin, named by
 * that manifest; one that ships `references/` without a manifest is shown, not read.
 */
function dependencyLayers(root: string, skip: ReadonlySet<string>, folder: ReferenceFolder): ReferenceLayer[] {
	const manifestPath = nearestManifest(root)
	if (!manifestPath) return []
	const layers: ReferenceLayer[] = []
	for (const pkg of declaredDependencies(readJson(manifestPath))) {
		const dir = packageDir(pkg, manifestPath)
		if (!dir || skip.has(canonical(dir))) continue
		const references = join(dir, folder)
		if (!isDirectory(references)) continue
		const plugin = pluginManifestName(dir)
		layers.push(
			plugin
				? { tier: 'plugin', dir: references, plugin }
				: { tier: 'plugin', dir: references, skipped: 'not a plugin' },
		)
	}
	return layers
}

/** The declared dependencies that are plugins, with or without a `references/` folder, for their skills. */
function dependencyPluginRoots(root: string): string[] {
	const manifestPath = nearestManifest(root)
	if (!manifestPath) return []
	return declaredDependencies(readJson(manifestPath)).flatMap((pkg) => {
		const dir = packageDir(pkg, manifestPath)
		return dir && pluginManifestName(dir) ? [dir] : []
	})
}

function holdsDefault(folder: string): boolean {
	try {
		return readdirSync(join(folder, 'references')).some((file) => file.endsWith('.default.md'))
	} catch {
		return false
	}
}

/**
 * The skills holding a default, in the project, user, and admin skill folders of each detected
 * harness whose folders are verified, and in each enabled plugin's skills. A skill is known by its
 * `SKILL.md` name; two skills of one name in different folders are both kept, since the harnesses
 * disagree on which one runs (`.research/skill-resolution` C).
 */
function skillDefaults(
	harnesses: readonly HarnessId[],
	options: {
		chain: readonly string[]
		home: string
		platform: Platform
		env: Readonly<Record<string, string | undefined>>
	},
	pluginRoots: readonly string[],
): SkillDefaults {
	if (!harnesses.length) {
		return {
			skills: [],
			unverified: "no harness detected, so no skill folder is read and no skill's default is listed",
		}
	}
	const folders: string[] = []
	const unverified: string[] = []
	for (const harness of harnesses) {
		const own = harnessSkillFolders(harness, options)
		if (!own) {
			unverified.push(harness)
			continue
		}
		folders.push(...own, ...pluginRoots.flatMap((root) => pluginSkillFolders(harness, root)))
	}
	const roots = pluginRoots.filter((root) => skillName(root) !== undefined)
	const skills = folders.length ? skillsIn([...folders, ...roots]).filter(({ folder }) => holdsDefault(folder)) : []
	return unverified.length
		? {
				skills,
				unverified: `the skill folders ${unverified.join(', ')} ${unverified.length === 1 ? 'reads are' : 'read are'} not verified, so ${unverified.length === 1 ? 'its' : 'their'} skills' defaults are not listed`,
			}
		: { skills }
}

/** The layer with its `references` folder swapped for `folder`; a layer that names no folder is left as it is. */
function inFolder(layer: ReferenceLayer, folder: ReferenceFolder): ReferenceLayer {
	if (folder === 'references' || basename(layer.dir) !== 'references') return layer
	const dir = join(dirname(layer.dir), folder)
	return layer.tier === 'default' ? { ...layer, dir, plain: true } : { ...layer, dir }
}

/** The `default` tier for the skill at `folder`; a folder that does not exist warns and adds no contribution. */
export function defaultLayer(folder: string): ReferenceLayer {
	const dir = join(folder, 'references')
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

export async function referenceLayers({
	root,
	home,
	platform,
	plugin,
	defaultSkill,
	folder = 'references',
	env = process.env,
}: ReferenceLayerOptions): Promise<ReferenceLayers> {
	const harnesses = detectedHarnesses(env)
	const chain = projectChain(root)
	const ownRoot = plugin && canonical(plugin.root)
	const enabled = await enabledPluginLayers(harnesses, chain, { env, homedir: home, cwd: resolve(root), platform })
	const pluginRoots = [
		...(plugin ? [plugin.root] : []),
		...enabled.flatMap(({ dir, skipped }) => (skipped ? [] : [dirname(dir)])),
		...dependencyPluginRoots(root),
	]
	const skills = folder === 'assets' ? undefined : skillDefaults(harnesses, { chain, home, platform, env }, pluginRoots)
	const layers: ReferenceLayer[] = [
		...harnessManagedLayers(harnesses, platform, env),
		...chain.map((dir): ReferenceLayer => ({ tier: 'project', dir: projectReferencesDir(dir) })),
		{ tier: 'user', dir: userReferencesDir(home) },
		...(plugin ? [{ tier: 'plugin' as const, dir: join(plugin.root, 'references'), plugin: plugin.name }] : []),
		...enabled.filter(
			(layer) =>
				layer.skipped || (isDirectory(inFolder(layer, folder).dir) && canonical(dirname(layer.dir)) !== ownRoot),
		),
		...dependencyLayers(root, new Set(ownRoot ? [ownRoot] : []), folder),
		...(defaultSkill === undefined ? [] : [defaultLayer(resolve(defaultSkill))]),
	]
	// A repository checked out at the home directory would read the same folder as project and user.
	const seen = new Set<string>()
	const placed = layers.map((layer) => inFolder(layer, folder)).filter(({ dir }) => !seen.has(dir) && seen.add(dir))
	return { layers: placed, harnesses, skills }
}
