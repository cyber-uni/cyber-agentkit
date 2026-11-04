import { type Dirent, existsSync, readdirSync, renameSync, rmdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { editFrontmatter } from './create-reference.js'
import { aliasIndex } from './reference-aliases.js'
import type { ReferenceWarning } from './reference-codes.js'
import { tryRead } from './reference-contribution.js'
import { parseDocument } from './reference-document.js'
import { ReferenceFailure } from './reference-error.js'
import { dataExtensions } from './reference-format.js'
import { type ReferenceLayers, repoReferencesDir, userReferencesDir } from './reference-layers.js'
import {
	defaultLayoutFinding,
	type LegacyFinding,
	type LegacyForm,
	legacyRewrite,
	type QualifiedOverride,
	qualifiedOverrideFinding,
	qualifiedOverrides,
} from './reference-legacy.js'
import { defaultSuffix, metadataSuffix, parseReferenceName } from './reference-name.js'
import { projectFolders } from './reference-projects.js'
import { renameTable, renameTableFile } from './reference-renames.js'
import { bareName, sourceFolder } from './reference-write-target.js'

/** Where a migrated file sits: a tier `migrate` reads by default, or a source folder it was given. */
export type MigrationTier = 'repo' | 'user' | 'project' | 'plugin' | 'default'

/** One change of the plan (R121). */
export type MigrationRow = {
	/** The file as it is now. */
	path: string
	tier: MigrationTier
	/** A project section's folder, relative to the root, `/`-separated. */
	folder?: string
	/** The name the file answers now. */
	name: string
	form: LegacyForm | 'renamed'
	/** The form as written, or the file's name for a rename. */
	from: string
	/** What it becomes; unset on a manual row. */
	to?: string
	/** Why `migrate` leaves the change to a person. */
	manual?: string
	/** For a rename: who declared it. */
	by?: string
}

export type MigrateOptions = {
	/** The repository root. Defaults to the root the layers were read from. */
	root?: string | undefined
	home: string
	/** Limit the run to the files of these names, a file under an older name of one included (R125). */
	names?: readonly string[] | undefined
	/** A plugin's source folder in the repository: only its `references/` is read (R123). */
	plugin?: string | undefined
	/** A skill's source folder in the repository: only its `references/` is read (R123). */
	default?: string | undefined
	/** Apply each change that is not manual; without it, nothing is written. */
	write?: boolean | undefined
}

export type MigrateResult = {
	rows: MigrationRow[]
	/** Set when `write` applied at least one change. */
	written: boolean
	/** Faults in what declares the renames, such as a malformed rename table (`rename-invalid`). */
	warnings: ReferenceWarning[]
}

type Place = { tier: MigrationTier; dir: string; folder?: string | undefined }

/** One file a place holds, by the name it answers. `suffix` follows the name in the file's path. */
type Held = { name: string; path: string; suffix: string; kind: 'markdown' | 'data' | 'metadata'; folderForm: boolean }

/** What applying the plan does to one file. `prune` is a folder removed once the move leaves it empty. */
type Operation = { path: string; content?: string; moveFrom?: string; moveTo?: string; prune?: string }

const dataSuffixes = dataExtensions.map(({ extension }) => extension)

function entries(dir: string): Dirent[] {
	try {
		return readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
	} catch {
		return []
	}
}

function valid(name: string): boolean {
	return !parseReferenceName(name).invalid
}

/** The files a place holds for each name, in the forms its tier answers. */
function heldFiles(place: Place): Held[] {
	const held: Held[] = []
	const isDefault = place.tier === 'default'
	const own = isDefault ? defaultSuffix : ''
	for (const entry of entries(place.dir)) {
		const file = entry.name
		const path = join(place.dir, file)
		if (entry.isDirectory()) {
			if (!isDefault && valid(file) && tryRead(join(path, 'README.md')) !== undefined) {
				held.push({
					name: file,
					path: join(path, 'README.md'),
					suffix: '/README.md',
					kind: 'markdown',
					folderForm: true,
				})
			}
			continue
		}
		if (file === renameTableFile) continue
		const metadata = `${own}${metadataSuffix}.md`
		if (file.endsWith(metadata)) {
			const name = file.slice(0, -metadata.length)
			if (valid(name)) held.push({ name, path, suffix: metadata, kind: 'metadata', folderForm: false })
			continue
		}
		const markdown = `${own}.md`
		if (file.endsWith(markdown)) {
			const name = file.slice(0, -markdown.length)
			// A tier folder's `<name>.default.md` is not a contribution there (R51).
			if (valid(name)) held.push({ name, path, suffix: markdown, kind: 'markdown', folderForm: false })
			continue
		}
		const data = dataSuffixes.find((extension) => file.endsWith(`${own}${extension}`))
		if (data) {
			const name = file.slice(0, -`${own}${data}`.length)
			if (valid(name)) held.push({ name, path, suffix: `${own}${data}`, kind: 'data', folderForm: false })
		}
	}
	return held
}

/** The places a run reads (R123): a source folder alone, or the `repo` and `user` tiers and every project section. */
function placesOf(layers: ReferenceLayers, root: string, options: MigrateOptions): Place[] {
	if (options.plugin !== undefined && options.default !== undefined) {
		throw new ReferenceFailure('options-conflict', 'pass one of --plugin and --default.')
	}
	if (options.plugin !== undefined) {
		return [{ tier: 'plugin', dir: join(sourceFolder(options.plugin, root, 'plugin'), 'references') }]
	}
	if (options.default !== undefined) {
		return [{ tier: 'default', dir: join(sourceFolder(options.default, root, 'skill'), 'references') }]
	}
	const places: Place[] = [
		{ tier: 'repo', dir: repoReferencesDir(root) },
		{ tier: 'user', dir: userReferencesDir(options.home) },
		...projectFolders(root, layers.projects).folders.map(({ folder, dir }) => ({
			tier: 'project' as const,
			dir,
			folder,
		})),
	]
	const seen = new Set<string>()
	return places.filter(({ dir }) => {
		const key = resolve(dir)
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
}

/** The new names an older name takes: from each plugin's rename table, and from each owner's `aliases` (R124). */
function renameSources(layers: ReferenceLayers) {
	const table = renameTable(layers)
	const aliases = aliasIndex(layers)
	return (name: string): { to: string; by: string }[] => {
		// A name a plugin or a default still holds as its own is not renamed (R98).
		if (aliases.owned.has(name)) return []
		const found = new Map<string, Set<string>>()
		const add = (to: string, by: string) => found.set(to, (found.get(to) ?? new Set()).add(by))
		for (const entry of table.byOld.get(name) ?? []) add(entry.to, `plugin ${entry.plugin}'s ${renameTableFile}`)
		for (const owner of aliases.byAlias.get(name) ?? []) {
			add(
				owner.name,
				`the aliases of ${owner.tier === 'plugin' ? `plugin ${owner.plugin}` : `the default of ${owner.skill}`}`,
			)
		}
		return [...found].map(([to, by]) => ({ to, by: [...by].join(' and ') }))
	}
}

/** Whether a folder holds any file answering `name` in its tier (R60's forms). */
function holdsName(place: Place, name: string): boolean {
	const own = place.tier === 'default' ? defaultSuffix : ''
	return [
		`${name}${own}.md`,
		...(place.tier === 'default' ? [] : [join(name, 'README.md')]),
		...dataSuffixes.map((extension) => `${name}${own}${extension}`),
		`${name}${own}${metadataSuffix}.md`,
	].some((file) => existsSync(join(place.dir, file)))
}

/**
 * Finds every file in a legacy form (K37), or under a name a plugin renamed, and returns the plan
 * (R121). With `write`, it applies each change that is not manual. It reads the `repo` tier, the
 * `user` tier, and every project section below the root, or only a plugin's or a skill's source
 * folder in the repository (R123), and never changes a managed folder or an installed copy.
 */
export function migrateReferences(layers: ReferenceLayers, options: MigrateOptions): MigrateResult {
	const root = resolve(options.root ?? layers.root ?? process.cwd())
	const names = options.names?.length ? new Set(options.names.map((name) => bareName(name).name)) : undefined
	const places = placesOf(layers, root, options)
	const targetsOf = renameSources(layers)
	const installed = new Set(
		layers.layers.flatMap(({ tier, plugin, skipped }) => (tier === 'plugin' && plugin && !skipped ? [plugin] : [])),
	)
	const rows: MigrationRow[] = []
	const operations: Operation[] = []
	for (const place of places) {
		const where = place.folder === undefined ? {} : { folder: place.folder }
		const renames = place.tier === 'repo' || place.tier === 'user' || place.tier === 'project'
		/** New names this run gives files in the folder, so a second file renamed to one is manual. */
		const claimed = new Set<string>()
		const held = heldFiles(place)
		if (place.tier === 'default') held.push(...oldDefaults(place, names, held))
		for (const file of held) {
			const targets = renames ? targetsOf(file.name) : []
			if (names && !names.has(file.name) && !targets.some(({ to }) => names.has(to))) continue
			const base = { path: file.path, tier: place.tier, ...where, name: file.name }
			const operation: Operation = { path: file.path }
			if (file.kind === 'markdown') {
				const raw = tryRead(file.path) ?? ''
				const { metadata, body } = parseDocument(raw, () => {})
				const { findings, keys } = legacyRewrite(
					metadata,
					body,
					place.tier === 'project' ? 'project' : 'contribution',
					file.name,
				)
				for (const finding of findings) rows.push(rowOf(base, finding))
				if (Object.keys(keys).length) operation.content = editFrontmatter(raw, keys)
			}
			if (file.suffix === '.md' && place.tier === 'default') {
				// A default in the old layout: `references/<name>.md` becomes `<name>.default.md` (R122).
				const to = join(place.dir, `${file.name}${defaultSuffix}.md`)
				const finding = defaultLayoutFinding(file.name)
				if (existsSync(to)) {
					const { to: _, ...kept } = finding
					rows.push(
						rowOf(base, {
							...kept,
							manual: `${file.name}${defaultSuffix}.md is there too and answers the name; the old file is not read, so delete it by hand once nothing in it is needed`,
						}),
					)
				} else {
					rows.push(rowOf(base, finding))
					Object.assign(operation, { moveFrom: file.path, moveTo: to })
				}
			}
			if (targets.length) renameRow(place, file, targets, claimed, base, rows, operation)
			if (operation.content !== undefined || operation.moveTo !== undefined) operations.push(operation)
		}
		if (renames) {
			for (const found of qualifiedOverrides(place.dir)) {
				if (names && !names.has(found.name)) continue
				const base = { path: found.path, tier: place.tier, ...where, name: found.name }
				const operation = qualifiedRow(place, found, installed, claimed, base, rows)
				if (operation) operations.push(operation)
			}
		}
	}
	let written = false
	if (options.write) {
		for (const operation of operations) {
			if (operation.content !== undefined) writeFileSync(operation.path, operation.content)
			if (operation.moveFrom !== undefined && operation.moveTo !== undefined) {
				renameSync(operation.moveFrom, operation.moveTo)
			}
			if (operation.prune !== undefined) pruneEmpty(operation.prune)
			written = true
		}
	}
	return { rows, written, warnings: [...renameTable(layers).warnings] }
}

function rowOf(base: Omit<MigrationRow, 'form' | 'from'>, finding: LegacyFinding): MigrationRow {
	const row: MigrationRow = { ...base, form: finding.form, from: finding.from }
	// A form version 1 never read says so on its row, and what applying it turns on.
	const note = finding.note === undefined ? '' : `; ${finding.reads}, and ${finding.note}`
	if (finding.to !== undefined) row.to = `${finding.to}${note}`
	if (finding.manual !== undefined) row.manual = `${finding.manual}${note}`
	return row
}

/**
 * A skill's defaults in the old layout, `references/<name>.md`, for the names given (UC22.7): the
 * folder's other files may be the skill's own documents, so no name given recognizes none.
 */
function oldDefaults(place: Place, names: ReadonlySet<string> | undefined, held: readonly Held[]): Held[] {
	if (!names) return []
	return [...names].flatMap((name) => {
		const path = join(place.dir, `${name}.md`)
		if (tryRead(path) === undefined || held.some((file) => file.path === path)) return []
		return [{ name, path, suffix: '.md', kind: 'markdown' as const, folderForm: false }]
	})
}

/** The rename row of a file under an older name (R124), and the move that applies it. */
function renameRow(
	place: Place,
	file: Held,
	targets: readonly { to: string; by: string }[],
	claimed: Set<string>,
	base: Omit<MigrationRow, 'form' | 'from'>,
	rows: MigrationRow[],
	operation: Operation,
): void {
	const from = file.folderForm ? `${file.name}/` : `${file.name}${file.suffix}`
	const row: MigrationRow = { ...base, form: 'renamed', from, by: targets.map(({ by }) => by).join('; ') }
	if (targets.length > 1) {
		rows.push({
			...row,
			manual: `it is renamed differently: ${targets.map(({ to, by }) => `"${to}" by ${by}`).join(', ')}; rename it by hand to the one that applies`,
		})
		return
	}
	const { to } = targets[0] as { to: string }
	// A metadata file moves with its data file; only one of a name's files claims the new name.
	const companion = file.kind === 'metadata' || file.kind === 'data'
	if ((holdsName(place, to) && !claimed.has(to)) || (claimed.has(to) && !companion)) {
		rows.push({
			...row,
			manual: `"${to}" already has a file in that folder; merge the two by hand, then delete this one`,
		})
		return
	}
	claimed.add(to)
	const into = file.folderForm ? `${to}/` : `${to}${file.suffix}`
	rows.push({ ...row, to: into })
	const moveFrom = file.folderForm ? dirname(file.path) : file.path
	Object.assign(operation, { moveFrom, moveTo: join(place.dir, file.folderForm ? to : `${to}${file.suffix}`) })
}

function pruneEmpty(dir: string): void {
	try {
		if (!readdirSync(dir).length) rmdirSync(dir)
	} catch {
		// A folder that cannot be read or removed is left as it is.
	}
}

/**
 * The row of a qualified-name override (K37), and the move that applies it: `<plugin>/<name>.md`
 * becomes `<name>.md` beside the subfolder, extending the plugin. It is manual in a project folder,
 * for a plugin the plugin tier does not hold, beside a file that already answers the name, and for a
 * file that writes its own `extends` or `overrides`.
 */
function qualifiedRow(
	place: Place,
	found: QualifiedOverride,
	installed: ReadonlySet<string>,
	claimed: Set<string>,
	base: Omit<MigrationRow, 'form' | 'from'>,
	rows: MigrationRow[],
): Operation | undefined {
	const { plugin, name } = found
	const finding = qualifiedOverrideFinding(found, place.tier === 'project' ? 'project' : 'contribution')
	const { to, ...kept } = finding
	const manual = (why: string) => {
		rows.push(rowOf(base, { ...kept, manual: why }))
		return undefined
	}
	if (to === undefined) return manual(finding.manual as string)
	if (!installed.has(plugin)) {
		return manual(
			`plugin ${plugin} is not installed; it would become ${to}, extending a plugin that is not there: install ${plugin} and run migrate again, or delete this file`,
		)
	}
	if (holdsName(place, name) || claimed.has(name)) {
		return manual(
			`"${name}" already has a file in that folder; move this file's sections into it and add ${plugin} to its extends, then delete this one`,
		)
	}
	const raw = tryRead(found.path) ?? ''
	const { metadata, body } = parseDocument(raw, () => {})
	const own = ['extends', 'overrides'].find((key) => key in metadata)
	if (own !== undefined) {
		return manual(`it also writes \`${own}\`; move it to ${name}.md by hand, with an extends that names ${plugin}`)
	}
	claimed.add(name)
	rows.push(rowOf(base, finding))
	const { findings, keys } = legacyRewrite(metadata, body, 'contribution', name)
	for (const other of findings) rows.push(rowOf(base, other))
	return {
		path: found.path,
		content: editFrontmatter(raw, { ...keys, extends: [plugin] }),
		moveFrom: found.path,
		moveTo: join(place.dir, `${name}.md`),
		prune: dirname(found.path),
	}
}
