import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pluginManifestName } from '../plugins/plugin-manifest.js'
import type { FoundSkill } from '../skills/skill-folder.js'
import { frontmatterPattern } from './reference-document.js'
import { ReferenceFailure } from './reference-error.js'
import { loadsIn } from './reference-skill-audit.js'

/**
 * A skill ships a copy of each plugin reference it loads, at `references/<name>.default.md`, since an
 * installed skill gets only its own folder. This module writes those copies from the plugin's canonical
 * `references/<name>.md` and checks them.
 */

export type BundleState =
	/** The copy matches what the canonical reference renders to. */
	| 'current'
	/** The copy is missing or differs from the canonical; `defaults` without `--check` writes it. */
	| 'missing'
	| 'stale'
	/** The skill loads the name and holds its copy under the wrong file name, such as `<name>.md`. */
	| 'misnamed'
	/** A `<name>.default.md` the skill no longer loads. Never deleted: the author decides. */
	| 'orphan'
	/** The skill loads the name, but the plugin does not ship a canonical reference to copy. Not a failure. */
	| 'unbundled'

export type BundleEntry = {
	name: string
	state: BundleState
	/** The copy, relative to the skill folder. */
	file: string
	/** Set on `written` results when the copy was created or rewritten by this run. */
	written?: boolean
}

export type BundleReport = {
	skill: FoundSkill
	pluginRoot: string
	entries: BundleEntry[]
	/** True when every entry is `current` or `unbundled`. */
	ok: boolean
}

/** Walks a folder for text files, skipping `node_modules` and `.git`. */
function textFiles(dir: string, top = dir): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir).sort()) {
		if (entry === 'node_modules' || entry === '.git') continue
		const path = join(dir, entry)
		if (statSync(path).isDirectory()) out.push(...textFiles(path, top))
		else if (/\.(md|mdx|txt|yaml|yml|json|toml)$/i.test(entry) && !/\.default\.[a-z]+$/i.test(entry))
			out.push(relative(top, path).split(sep).join('/'))
	}
	return out
}

/** The reference names the skill loads with the `reference` skill, read from its own text files. */
export function loadedNames(skillFolder: string): string[] {
	const names = new Set<string>()
	for (const file of textFiles(skillFolder)) {
		const { names: found } = loadsIn(readFileSync(join(skillFolder, file), 'utf8'))
		for (const name of found) names.add(name)
	}
	return [...names].sort()
}

/**
 * The text a skill's copy holds: the canonical reference with `default` taken out of its `extends`. A
 * copy names what the plugin builds on, so the default it replaces is not repeated.
 */
export function bundledCopy(canonical: string): string {
	const match = frontmatterPattern.exec(canonical)
	if (!match) return canonical
	const kept = (items: string[]) =>
		items.map((item) => item.trim()).filter((item) => item && !/^['"]?default['"]?$/.test(item))
	let frontmatter = match[1] as string
	frontmatter = frontmatter.replace(/^extends:[ \t]*\[([^\]]*)\][ \t]*$/m, (_line, list: string) => {
		const items = kept(list.split(','))
		return items.length ? `extends: [${items.join(', ')}]` : ''
	})
	frontmatter = frontmatter.replace(/^extends:[ \t]*\n((?:[ \t]+-[^\n]*\n?)+)/m, (_block, list: string) => {
		const items = kept(list.split('\n').map((line) => line.replace(/^[ \t]*-/, '')))
		return items.length ? `extends:\n${items.map((item) => `  - ${item}`).join('\n')}\n` : ''
	})
	frontmatter = frontmatter
		.split('\n')
		.filter((line) => line.trim() !== '')
		.join('\n')
	const body = canonical.slice(match[0].length)
	return frontmatter === '' ? body : `---\n${frontmatter}\n---\n${body.startsWith('\n') ? body.slice(1) : body}`
}

/** The plugin root of a skill: the nearest folder at or above it that carries a plugin manifest. */
export function pluginRootOf(skillFolder: string): string | undefined {
	let dir = resolve(skillFolder)
	for (;;) {
		if (pluginManifestName(dir)) return dir
		const parent = dirname(dir)
		if (parent === dir) return undefined
		dir = parent
	}
}

export type BundleOptions = {
	skill: FoundSkill
	pluginRoot: string
	/** Writes the missing and stale copies. Without it, nothing is written. */
	write: boolean
}

/** Compares, and with `write` brings up to date, each copy the skill's loaded names need. */
export function bundleSkill({ skill, pluginRoot, write }: BundleOptions): BundleReport {
	const refs = join(skill.folder, 'references')
	const loaded = loadedNames(skill.folder)
	const entries: BundleEntry[] = []
	for (const name of loaded) {
		const copy = `references/${name}.default.md`
		const canonicalPath = join(pluginRoot, 'references', `${name}.md`)
		if (!existsSync(canonicalPath)) {
			entries.push({ name, state: 'unbundled', file: copy })
			continue
		}
		const expected = bundledCopy(readFileSync(canonicalPath, 'utf8'))
		const copyPath = join(skill.folder, copy)
		if (existsSync(copyPath)) {
			if (readFileSync(copyPath, 'utf8') === expected) entries.push({ name, state: 'current', file: copy })
			else entries.push(writeEntry(write, name, 'stale', copy, copyPath, expected))
			continue
		}
		if (existsSync(join(refs, `${name}.md`))) {
			entries.push({ name, state: 'misnamed', file: `references/${name}.md` })
			continue
		}
		entries.push(writeEntry(write, name, 'missing', copy, copyPath, expected))
	}
	for (const file of existingDefaults(refs)) {
		const name = file.slice(0, -'.default.md'.length)
		if (!loaded.includes(name)) entries.push({ name, state: 'orphan', file: `references/${file}` })
	}
	entries.sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file))
	return {
		skill,
		pluginRoot,
		entries,
		ok: entries.every(({ state }) => state === 'current' || state === 'unbundled'),
	}
}

function writeEntry(
	write: boolean,
	name: string,
	state: 'missing' | 'stale',
	file: string,
	path: string,
	text: string,
): BundleEntry {
	if (!write) return { name, state, file }
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, text)
	return { name, state: 'current', file, written: true }
}

function existingDefaults(refs: string): string[] {
	if (!existsSync(refs)) return []
	return readdirSync(refs)
		.filter((file) => file.endsWith('.default.md'))
		.sort()
}

/** The refusal `defaults` gives when a skill has no plugin to copy from. */
export function noPluginFailure(skill: FoundSkill): ReferenceFailure {
	return new ReferenceFailure(
		'plugin-not-found',
		`The skill "${skill.name}" has no plugin manifest above its folder, so there is no canonical reference to copy; give the plugin's folder with --plugin.`,
		{ details: { skill: skill.folder } },
	)
}

/** The refusal `defaults --check` gives when any copy is out of date. */
export function outOfDateFailure(report: BundleReport): ReferenceFailure {
	const bad = report.entries.filter(({ state }) => state !== 'current' && state !== 'unbundled')
	return new ReferenceFailure(
		'bundle-out-of-date',
		`${bad.length} bundled default ${bad.length === 1 ? 'copy is' : 'copies are'} out of date in ${report.skill.name}; run \`defaults\` without --check to write the missing and stale copies.`,
		{
			details: {
				skill: report.skill.folder,
				entries: bad.map(({ name, state, file }) => `${state}: ${name} (${file})`),
			},
		},
	)
}
