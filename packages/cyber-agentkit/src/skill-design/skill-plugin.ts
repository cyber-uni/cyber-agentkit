import { cpSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

/** The plugin in the working copy that a skill folder is part of (R91). */
export type SkillPlugin = {
	/** The plugin's folder, holding `.claude-plugin/plugin.json`. */
	root: string
	/** The plugin's `name`: a skill it loads is called `<name>:<skill>` (research E21). */
	name: string
}

function skillsFolders(root: string, manifest: Record<string, unknown>): string[] {
	const skills = manifest['skills']
	const entries = typeof skills === 'string' ? [skills] : Array.isArray(skills) ? skills : ['./skills/']
	return entries.filter((entry): entry is string => typeof entry === 'string').map((entry) => resolve(root, entry))
}

/**
 * The plugin a skill folder is developed in: the nearest folder above it holding `.claude-plugin/plugin.json` whose
 * skills folder holds the skill. `undefined` when no such plugin exists.
 */
export function findSkillPlugin(skillFolder: string): SkillPlugin | undefined {
	const skill = resolve(skillFolder)
	let folder = dirname(skill)
	for (;;) {
		const path = join(folder, '.claude-plugin', 'plugin.json')
		if (existsSync(path)) {
			try {
				const manifest = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
				const name = manifest['name']
				if (typeof name === 'string' && name !== '' && skillsFolders(folder, manifest).includes(dirname(skill)))
					return { root: folder, name }
			} catch {
				// an unreadable manifest is not this skill's plugin
			}
		}
		const parent = dirname(folder)
		if (parent === folder) return undefined
		folder = parent
	}
}

/** Folders a plugin copy leaves out: they are not part of what an install loads. */
const skipped = new Set(['node_modules', '.git'])

/**
 * Copies a plugin to `target` for a run to load. With `without`, the skill folder at that path is left out; with
 * `replacement` as well, that folder's content comes from `replacement` instead, as the baseline's other version.
 */
export function copyPlugin(root: string, target: string, without?: string, replacement?: string): void {
	const left = without === undefined ? undefined : resolve(without)
	cpSync(root, target, {
		recursive: true,
		filter: (source) => {
			const at = resolve(source)
			if (left !== undefined && (at === left || at.startsWith(left + sep))) return false
			return !relative(root, at)
				.split(sep)
				.some((part) => skipped.has(part))
		},
	})
	if (left !== undefined && replacement !== undefined)
		cpSync(replacement, join(target, relative(root, left)), { recursive: true })
}
