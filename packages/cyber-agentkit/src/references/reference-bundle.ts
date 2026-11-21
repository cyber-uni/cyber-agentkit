import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pluginManifestName } from '../plugins/plugin-manifest.js'
import { consumerPaths } from './reference-consumer-files.js'
import { frontmatterPattern } from './reference-document.js'
import { ReferenceFailure } from './reference-error.js'
import { loadsIn } from './reference-uses.js'

/**
 * A folder that loads references, such as a skill, ships a copy of each plugin reference it loads, at
 * `references/<name>.default.md`, since an installed copy of it gets only its own folder. This module
 * writes those copies from the plugin's canonical `references/<name>.md` and checks them.
 */

export type BundleState =
	/** The copy matches what the canonical reference renders to. */
	| 'current'
	/** The copy is missing or differs from the canonical; `defaults` without `--check` writes it. */
	| 'missing'
	| 'stale'
	/** The folder loads the name and holds its copy under the wrong file name, such as `<name>.md`. */
	| 'misnamed'
	/** A `<name>.default.md` the folder no longer loads. Never deleted: the author decides. */
	| 'orphan'
	/** The folder loads the name, but the plugin does not ship a canonical reference to copy. Not a failure. */
	| 'unbundled'

export type BundleEntry = {
	name: string
	state: BundleState
	/** The copy, relative to the folder. */
	file: string
	/** Set on `written` results when the copy was created or rewritten by this run. */
	written?: boolean
}

export type BundleReport = {
	/** The folder whose copies were compared. */
	folder: string
	pluginRoot: string
	entries: BundleEntry[]
	/** True when every entry is `current` or `unbundled`. */
	ok: boolean
}

/**
 * The reference names the text in a folder loads with the `reference` skill, bundled default copies
 * left out. An interface it loads is named `<id>.interface`, the name its document is held under.
 */
export function loadedNames(folder: string): string[] {
	const names = new Set<string>()
	for (const file of consumerPaths([folder], folder).flatMap((consumer) => consumer.files)) {
		const { names: found, interfaces } = loadsIn(readFileSync(file.absolute, 'utf8'))
		for (const name of found) names.add(name)
		for (const id of interfaces) names.add(`${id}.interface`)
	}
	return [...names].sort()
}

/**
 * The text a bundled copy holds: the canonical reference with `default` taken out of its `extends`. A
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

/** The plugin root of a folder: the nearest folder at or above it that carries a plugin manifest. */
export function pluginRootOf(folder: string): string | undefined {
	let dir = resolve(folder)
	for (;;) {
		if (pluginManifestName(dir)) return dir
		const parent = dirname(dir)
		if (parent === dir) return undefined
		dir = parent
	}
}

export type BundleOptions = {
	/** The folder that loads references and holds their copies under `references/`. */
	folder: string
	pluginRoot: string
	/** Writes the missing and stale copies. Without it, nothing is written. */
	write: boolean
}

/** Compares, and with `write` brings up to date, each copy the folder's loaded names need. */
export function bundleDefaults({ folder, pluginRoot, write }: BundleOptions): BundleReport {
	const refs = join(folder, 'references')
	const loaded = loadedNames(folder)
	const entries: BundleEntry[] = []
	for (const name of loaded) {
		const copy = `references/${name}.default.md`
		const canonicalPath = join(pluginRoot, 'references', `${name}.md`)
		if (!existsSync(canonicalPath)) {
			entries.push({ name, state: 'unbundled', file: copy })
			continue
		}
		const expected = bundledCopy(readFileSync(canonicalPath, 'utf8'))
		const copyPath = join(folder, copy)
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
		folder,
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

/** The refusal `defaults` gives when a folder has no plugin to copy from. */
export function noPluginFailure(folder: string): ReferenceFailure {
	return new ReferenceFailure(
		'plugin-not-found',
		`${folder} has no plugin manifest at or above it, so there is no canonical reference to copy; give the plugin's folder with --plugin.`,
		{ details: { folder } },
	)
}

/** The refusal `defaults --check` gives when any copy is out of date. */
export function outOfDateFailure(report: BundleReport): ReferenceFailure {
	const bad = report.entries.filter(({ state }) => state !== 'current' && state !== 'unbundled')
	return new ReferenceFailure(
		'bundle-out-of-date',
		`${bad.length} bundled default ${bad.length === 1 ? 'copy is' : 'copies are'} out of date in ${report.folder}; run \`defaults\` without --check to write the missing and stale copies.`,
		{
			details: {
				folder: report.folder,
				entries: bad.map(({ name, state, file }) => `${state}: ${name} (${file})`),
			},
		},
	)
}
