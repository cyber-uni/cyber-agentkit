import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type { HarnessId } from '../harness/harness-id.js'
import type { Platform } from '../harness/platform.js'
import { declaredDependencies, packageDir } from '../plugins/package-dependencies.js'
import { pluginManifestName, pluginVersion } from '../plugins/plugin-manifest.js'
import { harnessSkillFolders, pluginSkillFolders } from '../skills/harness-skill-folders.js'
import { type FoundSkill, skillName, skillsIn } from '../skills/skill-folder.js'
import { detectedHarnesses, enabledPluginLayers, harnessManagedLayers } from './harness-layers.js'
import type { ReferenceWarning } from './reference-codes.js'
import { ReferenceFailure } from './reference-error.js'

/**
 * Where a contribution lives. Listed highest first; the stack (plugins and `default`) is ordered by
 * `extends`. `project` is a `.agents/references/` folder below the root, which adds a project section
 * rather than a layer.
 */
export type ReferenceTier = 'managed' | 'repo' | 'project' | 'user' | 'plugin' | 'default'

/** How a plugin layer came to be read: the plugin running the resolver, one a harness enabled, or a dependency of the root's `package.json`. */
export type PluginOrigin = 'host' | 'enabled' | 'dependency'

export type ReferenceLayer = {
	tier: ReferenceTier
	/** The folder read for contributions. */
	dir: string
	/** The plugin tier: the plugin's manifest `name`, which a qualified `<plugin>/<name>` uses. */
	plugin?: string | undefined
	/** The default tier: the skill's `SKILL.md` `name`. */
	skill?: string | undefined
	/** The plugin tier: how the plugin came to be read. */
	origin?: PluginOrigin | undefined
	/** The plugin tier: the installed version, from the install record, else the plugin manifest, else `package.json`. */
	version?: string | undefined
	/** Set when the layer is never read, and why: policy held in MDM, a plugin with no install folder. */
	skipped?: string | undefined
	/** Raised on every name resolved through this layer, such as a `--default` folder that does not exist. */
	warning?: ReferenceWarning | undefined
}

export type ReferenceLayerOptions = {
	/**
	 * The repository root. Its `.agents/references/` is the `repo` tier and its `package.json` names the
	 * dependency plugins. When given, it must exist, or the call throws `root-missing`. Defaults to the
	 * nearest folder at or above `cwd` holding `.git`, else `cwd`.
	 */
	root?: string | undefined
	/** The working folder the root is found from. Defaults to `process.cwd()`. */
	cwd?: string | undefined
	home: string
	platform: Platform
	/**
	 * The plugin running the resolver. Its `references/` is the first plugin layer, and its install,
	 * when a harness has it enabled, is not read a second time.
	 */
	plugin?: ReferencePlugin | undefined
	/** The calling skill's folder: its `references/<name>.default.md` forms the `default` tier. */
	defaultSkill?: string | undefined
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
	/** Highest first: managed, repo, user, plugin, default. */
	layers: ReferenceLayer[]
	/** The repository root the layers were read from. */
	root?: string | undefined
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

export function repoReferencesDir(root: string): string {
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

export function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory()
	} catch {
		return false
	}
}

/**
 * The repository root found from `cwd`: the nearest folder at or above it holding `.git`, a folder or
 * a file (a git worktree), else `cwd` itself.
 */
export function findRoot(cwd: string): string {
	const start = resolve(cwd)
	for (let dir = start; ; ) {
		if (existsSync(join(dir, '.git'))) return dir
		const parent = dirname(dir)
		if (parent === dir) return start
		dir = parent
	}
}

/** The root a call reads from: `root` when given, which must be a folder (`root-missing`), else the one found from `cwd`. */
export function referenceRoot(root: string | undefined, cwd: string = process.cwd()): string {
	if (root === undefined) return findRoot(cwd)
	const folder = resolve(cwd, root)
	if (!isDirectory(folder)) {
		throw new ReferenceFailure('root-missing', `the root ${folder} does not exist or is not a folder.`, {
			details: { root: folder },
		})
	}
	return folder
}

/**
 * The working folder and each folder above it up to the root, nearest first, or the root alone when
 * the working folder is outside it. Only harness matching walks it: a Claude Code project-scoped
 * install is recorded with the project path it was installed in, and a harness reads project skill
 * folders from the working folder up. No reference tier is read along it.
 */
export function workingChain(cwd: string, root: string): string[] {
	const top = resolve(root)
	const chain: string[] = []
	for (let dir = resolve(cwd); ; ) {
		chain.push(dir)
		if (dir === top) return chain
		const parent = dirname(dir)
		if (parent === dir) return [top]
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
 * Exactly the root's `package.json`: a workspace package's own adds no plugin, so the plugin tier is
 * the same from any working folder. Declared dependencies only: a transitive package never becomes a
 * plugin, because a reference is instruction text an agent follows. Only a package with a plugin
 * manifest is a plugin, named by that manifest; one that ships `references/` without a manifest is
 * shown, not read.
 */
function dependencyPackages(root: string): string[] {
	const manifestPath = join(root, 'package.json')
	const manifest = readJson(manifestPath)
	if (manifest === undefined) return []
	return declaredDependencies(manifest).flatMap((pkg) => {
		const dir = packageDir(pkg, manifestPath)
		return dir ? [dir] : []
	})
}

function dependencyLayers(packages: readonly string[], skip: ReadonlySet<string>): ReferenceLayer[] {
	const layers: ReferenceLayer[] = []
	for (const dir of packages) {
		if (skip.has(canonical(dir))) continue
		const references = join(dir, 'references')
		if (!isDirectory(references)) continue
		const plugin = pluginManifestName(dir)
		layers.push(
			plugin
				? { tier: 'plugin', dir: references, plugin, origin: 'dependency', version: pluginVersion(dir) }
				: { tier: 'plugin', dir: references, origin: 'dependency', skipped: 'not a plugin' },
		)
	}
	return layers
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
	root: given,
	cwd = process.cwd(),
	home,
	platform,
	plugin,
	defaultSkill,
	env = process.env,
}: ReferenceLayerOptions): Promise<ReferenceLayers> {
	const root = referenceRoot(given, cwd)
	const harnesses = detectedHarnesses(env)
	const chain = workingChain(cwd, root)
	const ownRoot = plugin && canonical(plugin.root)
	const enabled = await enabledPluginLayers(harnesses, chain, { env, homedir: home, cwd: root, platform })
	const packages = dependencyPackages(root)
	const pluginRoots = [
		...(plugin ? [plugin.root] : []),
		...enabled.flatMap(({ dir, skipped }) => (skipped ? [] : [dirname(dir)])),
		...packages.filter((dir) => pluginManifestName(dir)),
	]
	const skills = skillDefaults(harnesses, { chain, home, platform, env }, pluginRoots)
	const host: ReferenceLayer[] = plugin
		? [
				{
					tier: 'plugin',
					dir: join(plugin.root, 'references'),
					plugin: plugin.name,
					origin: 'host',
					version: pluginVersion(plugin.root),
				},
			]
		: []
	const layers: ReferenceLayer[] = [
		...harnessManagedLayers(harnesses, platform, env),
		{ tier: 'repo', dir: repoReferencesDir(root) },
		{ tier: 'user', dir: userReferencesDir(home) },
		...host,
		...enabled.filter(
			(layer) => layer.skipped || (isDirectory(layer.dir) && canonical(dirname(layer.dir)) !== ownRoot),
		),
		...dependencyLayers(packages, new Set(ownRoot ? [ownRoot] : [])),
		...(defaultSkill === undefined ? [] : [defaultLayer(resolve(cwd, defaultSkill))]),
	]
	// A repository checked out at the home directory would read the same folder as repo and user.
	const seen = new Set<string>()
	const placed = layers.filter(({ dir }) => !seen.has(dir) && seen.add(dir))
	return { layers: placed, root, harnesses, skills }
}
