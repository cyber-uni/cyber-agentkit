import { existsSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pluginManifestName } from '../plugins/plugin-manifest.js'
import { skillName } from '../skills/skill-folder.js'
import { candidateFiles } from './reference-contribution.js'
import { ReferenceFailure } from './reference-error.js'
import { canonical, repoReferencesDir, userReferencesDir } from './reference-layers.js'
import { parseReferenceName, type ReferenceName, requireName } from './reference-name.js'

/**
 * Where a write lands: the repo or user tier, a folder's project section, or a plugin's or a skill's
 * source folder in the repository.
 */
export type WriteScope = 'repo' | 'user' | 'project' | 'plugin' | 'default'

export type WriteTarget = {
	scope: WriteScope
	/** The `references/` folder written to. */
	dir: string
	/** The file a write creates: `<name>.md`, or `<name>.default.md` for a default. */
	path: string
	/** A project section's folder, relative to the root, `/`-separated. */
	folder?: string
	/** A project section's folder, absolute. */
	folderPath?: string
}

/** The places a write can name, as its flags give them. */
export type TargetArgs = {
	/** The repository root: a `repo` write goes to its `.agents/references/`, and a source-folder write stays inside it. */
	root: string
	home: string
	scope?: string | undefined
	/** A folder strictly below the root, whose project section is written. */
	in?: string | undefined
	plugin?: string | undefined
	default?: string | undefined
}

/** A bare, valid name, or a refusal naming the bare name to use. */
export function bareName(value: string): ReferenceName {
	requireName(value)
	const name = parseReferenceName(value)
	if (name.invalid) throw new ReferenceFailure('name-invalid', name.invalid)
	if (name.plugin !== undefined) {
		throw new ReferenceFailure(
			'reference-qualified',
			`a contribution is written under the bare name, which every tier resolves; ask for "${name.name}".`,
		)
	}
	return name
}

/** A write to a source folder must land inside the repository root, and never in an installed copy. */
export function insideRepository(folder: string, root: string): boolean {
	const repository = canonical(resolve(root))
	const target = canonical(folder)
	if (target !== repository && !target.startsWith(repository + sep)) return false
	return !target.slice(repository.length).split(sep).includes('node_modules')
}

function below(root: string, folder: string): string | undefined {
	const path = relative(root, folder)
	return path && !path.startsWith('..') && !isAbsolute(path) ? path : undefined
}

/**
 * `--in`'s folder relative to the root, `/`-separated, when it is strictly below it; the root itself
 * or a folder outside it is a usage error (`in-not-below-root`).
 */
export function inFolder(folder: string, root: string): { folder: string; path: string } {
	const path = resolve(folder)
	const inside = below(resolve(root), path) ?? below(canonical(resolve(root)), canonical(path))
	if (inside === undefined) {
		throw new ReferenceFailure(
			'in-not-below-root',
			`--in names ${path}, which is ${path === resolve(root) ? 'the root itself' : 'outside the root'}; a project section is written for a folder strictly below the root ${resolve(root)}.`,
		)
	}
	return { folder: inside.split(sep).join('/'), path }
}

/** The usage rules on where a write goes: one place, and `--in` strictly below the root. */
export function checkPlaces(args: TargetArgs, flags: string): void {
	const given = [args.scope, args.in, args.plugin, args.default].filter((value) => value !== undefined)
	if (given.length > 1) throw new ReferenceFailure('options-conflict', `pass one of ${flags}.`)
}

export function checkScope(scope: string | undefined): void {
	if (scope !== undefined && scope !== 'repo' && scope !== 'user') {
		throw new ReferenceFailure('option-invalid', `--scope is repo or user; got "${scope}".`)
	}
}

export function sourceFolder(value: string, root: string, kind: 'plugin' | 'skill'): string {
	const folder = resolve(value)
	const qualifies = kind === 'plugin' ? Boolean(pluginManifestName(folder)) : skillName(folder) !== undefined
	if (!qualifies) {
		throw new ReferenceFailure(
			'folder-invalid',
			kind === 'plugin'
				? `${folder} holds no plugin manifest, so it is not a plugin folder.`
				: `${folder} holds no SKILL.md, so it is not a skill folder.`,
		)
	}
	if (!insideRepository(folder, root)) {
		throw new ReferenceFailure(
			'folder-invalid',
			`${folder} is outside the repository, such as an installed copy; write to the ${kind}'s source instead.`,
		)
	}
	return folder
}

/**
 * The file a write acts on, for `--scope`, `--in`, `--plugin`, or `--default`. The usage rules are
 * `checkPlaces`'; this checks that a source folder qualifies (`folder-invalid`).
 */
export function writeTarget(name: ReferenceName, args: TargetArgs): WriteTarget {
	const { root, home, scope, plugin, default: skill } = args
	if (plugin !== undefined) {
		const dir = join(sourceFolder(plugin, root, 'plugin'), 'references')
		return { scope: 'plugin', dir, path: join(dir, `${name.name}.md`) }
	}
	if (skill !== undefined) {
		const dir = join(sourceFolder(skill, root, 'skill'), 'references')
		return { scope: 'default', dir, path: join(dir, `${name.name}.default.md`) }
	}
	if (args.in !== undefined) {
		const { folder, path } = inFolder(args.in, root)
		const dir = join(path, '.agents', 'references')
		return { scope: 'project', dir, path: join(dir, `${name.name}.md`), folder, folderPath: path }
	}
	const dir = scope === 'user' ? userReferencesDir(home) : repoReferencesDir(resolve(root))
	return { scope: scope === 'user' ? 'user' : 'repo', dir, path: join(dir, `${name.name}.md`) }
}

/** The files that answer `name` at a target, in the order they answer (R60, J7). */
export function targetFiles(target: WriteTarget, name: string): string[] {
	return candidateFiles({ tier: target.scope === 'default' ? 'default' : 'repo' }, name).map((file) =>
		join(target.dir, ...file.split('/')),
	)
}

/** The file that answers `name` at a target now, if any; `without` is read as absent. */
export function answeringFile(target: WriteTarget, name: string, without?: string): string | undefined {
	return targetFiles(target, name).find((path) => path !== without && existsSync(path))
}

/** The metadata file (K31) beside a non-Markdown contribution of `name` at a target. */
export function metadataFile(target: WriteTarget, name: string): string {
	return join(target.dir, `${name}${target.scope === 'default' ? '.default' : ''}.meta.md`)
}

/** Who a place reaches, as `where` and a write's report say it. */
export function reachOf(target: Pick<WriteTarget, 'scope' | 'folder'>): string {
	if (target.scope === 'user') return 'only you, in every repository'
	if (target.scope === 'project') return `everyone working in ${target.folder}`
	return 'everyone working in this repository'
}
