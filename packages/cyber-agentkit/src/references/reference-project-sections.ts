import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { WarnFn } from './reference-codes.js'
import { trimLeadingBlank, withNewline } from './reference-compose.js'
import { type Contribution, layerNames, tryRead } from './reference-contribution.js'
import {
	applyContribution,
	composedSections,
	emptyComposed,
	hasBody,
	parseDocument,
	renderComposed,
	stripMergeMarkers,
} from './reference-document.js'
import { dataExtensions, type ReferenceFormat } from './reference-format.js'
import { legacyRewrite, warnLegacy } from './reference-legacy.js'
import { type PackagePlugin, packagePluginReferences, packagePlugins } from './reference-package-plugins.js'
import { comparePaths, type ProjectFolder, type ProjectFolderCache, projectFolders } from './reference-projects.js'
import { checkGenerated, type ReferenceTraceSource, type SourceCatalog, staleMessage } from './reference-sources.js'
import { readExtends } from './reference-stack.js'
import type { ReferenceTraceSection } from './resolve-reference.js'

/** A project section as load delivers it: what one folder below the root adds after the main document. */
export type ResolvedProjectSection = {
	/** The folder it applies to, relative to the root, `/`-separated, with no leading `./` or trailing slash. */
	folder: string
	/** The file that answered. */
	path: string
	/** Its text, the managed contribution applied over it, with its own heading levels. */
	content: string
	/** Its frontmatter, less the keys a project section does not carry. */
	metadata: Record<string, unknown>
	/** Set when a package plugin (K36) supplied it: that plugin's manifest `name`. */
	plugin?: string
}

/** A project section the trace reports: one delivered, or one in a folder git ignores. */
export type ReferenceTraceProjectSection = {
	folder: string
	/** The file matched, or the folder checked when the folder is ignored. */
	path: string
	/** The file that answered, relative to the folder: `<name>.md` or `<name>/README.md`. */
	file?: string
	/** Its frontmatter as written. */
	frontmatter?: Record<string, unknown>
	/** `used`; `stale`; `shadowed by <managed> (replace|remove)`; `not used (...)`; or `not read (ignored)`. */
	outcome: string
	/** A generated section: each source of the main document it was written against, recorded and installed (R9). */
	sources?: ReferenceTraceSource[]
	/** A generated section: the request it records. */
	request?: string
	/** When the managed contribution changed it: each section by heading path, with what supplied its text. */
	sections?: ReferenceTraceSection[]
	/** A section filed under an older name of the name (R97): that older name. */
	alias?: string
	/** Set when a package plugin (K36) supplied it: that plugin's manifest `name`. */
	plugin?: string
	/** A package plugin's installed version. */
	version?: string
}

export type ProjectSections = { sections: ResolvedProjectSection[]; trace: ReferenceTraceProjectSection[] }

/** Keys only a main-document contribution carries (K24): a project section states only what differs in its folder. */
const ignoredKeys = ['merge', 'extends', 'implements', 'aliases'] as const

/** A generated section's record, which the trace carries and its `metadata` leaves out (UC8). */
const recordKeys = ['sources', 'request'] as const

export type ProjectSectionOptions = {
	root: string
	cache?: ProjectFolderCache | undefined
	/** The managed contribution, applied over each section with its merge operation. */
	managed?: Contribution | undefined
	/** The main document's format, when there is one: a name whose main document is not Markdown gets no project sections. */
	format?: ReferenceFormat | undefined
	display: (path: string) => string
	/** A file read as absent. */
	without?: string | undefined
	warnAt: (where: string) => WarnFn
	/** What a generated section's recorded sources are compared to; without it, none is checked. */
	catalog?: SourceCatalog | undefined
	/** The older names a section filed under applies as this one (R97). */
	older?: readonly string[] | undefined
	/**
	 * The plugins the plugin tier holds: a package declaring one adds no section for it, since it is
	 * in the main document (R115). Without it, no package plugin is read.
	 */
	held?: ReadonlySet<string> | undefined
}

type Found = { folder: ProjectFolder; file: string; path: string; relative: string; as: string }

function names(dir: string): Set<string> {
	try {
		return new Set(readdirSync(dir))
	} catch {
		return new Set()
	}
}

/** The files in one folder that hold `name`: the Markdown ones that answer, in order, and the data files that never do. */
function filesFor(folder: ProjectFolder, name: string, without: string | undefined) {
	const held = names(folder.dir)
	const at = (file: string) => ({
		folder,
		file,
		as: name,
		path: join(folder.dir, ...file.split('/')),
		relative: `${folder.folder}/.agents/references/${file}`,
	})
	const markdown = [`${name}.md`, `${name}/README.md`]
		.filter((file) => held.has(file.split('/')[0] as string))
		.map(at)
		.filter(({ path }) => path !== without && tryRead(path) !== undefined)
	const data = dataExtensions
		.map(({ extension }) => `${name}${extension}`)
		.filter((file) => held.has(file))
		.map(at)
		.filter(({ path }) => path !== without)
	return { markdown, data }
}

/** One folder below the root: its own `.agents/references/`, when it has one, and the package plugins it declares. */
type FolderEntry = { folder: string; own?: ProjectFolder; ignored: boolean; plugins: PackagePlugin[] }

function folderEntries(found: ReturnType<typeof projectFolders>, plugins: readonly PackagePlugin[]): FolderEntry[] {
	const entries = new Map<string, FolderEntry>()
	const at = (folder: string) => {
		let entry = entries.get(folder)
		if (!entry) {
			entry = { folder, ignored: false, plugins: [] }
			entries.set(folder, entry)
		}
		return entry
	}
	for (const folder of found.folders) at(folder.folder).own = folder
	for (const folder of found.ignored) Object.assign(at(folder.folder), { own: folder, ignored: true })
	for (const plugin of plugins) at(plugin.folder).plugins.push(plugin)
	return [...entries.values()].sort((a, b) => comparePaths(a.folder, b.folder))
}

/**
 * Every project section of `name` below the root, in path order (R99): in each folder, first what
 * each package plugin it declares holds for the name (R115), then the folder's own
 * `.agents/references/<name>.md` or `<name>/README.md`, in a folder git does not ignore. The managed
 * contribution applies over each by heading path: a section it matches nothing in is left as it is,
 * and a managed `replace` or `remove` drops them all. A name whose main document is not Markdown gets
 * none, and a non-Markdown file in a project folder never answers; each warns.
 */
export function readProjectSections(name: string, options: ProjectSectionOptions): ProjectSections {
	const { root, cache, catalog, held = new Set<string>() } = options
	const found = projectFolders(root, cache)
	const plugins = packagePlugins(root, cache, held)
	const read: ReadContext = {
		...options,
		older: options.older ?? [],
		catalog: catalog && withPackagePlugins(catalog, plugins),
		dropping: droppingOperation(options.managed),
		listed: (hit: Found) => !found.listed || found.listed.has(hit.relative),
	}
	const result: ProjectSections = { sections: [], trace: [] }
	for (const entry of folderEntries(found, plugins)) {
		for (const hit of pluginHits(name, entry, read)) readPluginSection(name, hit, read, result)
		if (entry.own) readOwnSection(name, entry.own, entry.ignored, read, result)
	}
	return result
}

type ReadContext = Omit<ProjectSectionOptions, 'older' | 'held'> & {
	older: readonly string[]
	dropping: ReturnType<typeof droppingOperation>
	listed: (hit: Found) => boolean
}

/** A generated section may record a package plugin as a source (UC21.7): the catalog holds each one not already in it. */
function withPackagePlugins(catalog: SourceCatalog, plugins: readonly PackagePlugin[]): SourceCatalog {
	if (!plugins.length) return catalog
	const all = new Map(catalog.plugins)
	for (const { plugin, version } of plugins) {
		if (!all.has(plugin)) all.set(plugin, { plugin, version, origin: 'package' })
	}
	return { ...catalog, plugins: all }
}

type PluginHit = { plugin: PackagePlugin; hit: Found; metadata: Record<string, unknown>; body: string; after: string[] }

/**
 * The Markdown file each package plugin of the folder holds for the name, ordered so a plugin follows
 * any plugin its own `extends` names (UC21.4), else by name. A data file never answers here.
 */
function pluginHits(name: string, entry: FolderEntry, read: ReadContext): PluginHit[] {
	const hits: PluginHit[] = []
	for (const plugin of [...entry.plugins].sort((a, b) => a.plugin.localeCompare(b.plugin))) {
		const folder = { folder: entry.folder, dir: packagePluginReferences(plugin) }
		const [hit] = [name, ...read.older].flatMap((as) => filesFor(folder, as, read.without).markdown)
		if (!hit) continue
		const { metadata, body } = parseDocument(tryRead(hit.path) ?? '', read.warnAt(`plugin ${read.display(hit.path)}`))
		const steps = readExtends(metadata['extends'], () => {}) ?? []
		hits.push({ plugin, hit, metadata, body, after: steps.map(({ target }) => target) })
	}
	const ordered: PluginHit[] = []
	const holders = new Set(hits.map(({ plugin }) => plugin.plugin))
	while (hits.length) {
		const placed = new Set(ordered.map(({ plugin }) => plugin.plugin))
		const ready = hits.findIndex(({ after }) => after.every((target) => !holders.has(target) || placed.has(target)))
		// A cycle among them leaves the rest in name order.
		ordered.push(...hits.splice(ready === -1 ? 0 : ready, 1))
	}
	return ordered
}

/**
 * A package plugin's contribution as a project section for its package's folder (R115). The keys it
 * carries for the stack are left out without a warning (UC21.5); a plugin's own file is never stale
 * at load (R101).
 */
function readPluginSection(name: string, found: PluginHit, read: ReadContext, result: ProjectSections): void {
	const { plugin, hit, metadata, body } = found
	const row: ReferenceTraceProjectSection = {
		folder: plugin.folder,
		path: hit.path,
		file: hit.file,
		frontmatter: metadata,
		outcome: 'used',
		plugin: plugin.plugin,
	}
	if (plugin.version !== undefined) row.version = plugin.version
	if (hit.as !== name) row.alias = hit.as
	result.trace.push(row)
	const label = `plugin ${read.display(hit.path)}`
	if (read.format !== undefined && read.format !== 'markdown') {
		row.outcome = `not used (format differs from ${read.format})`
		read.warnAt(label)(
			'project-section-not-markdown',
			`it is not delivered: the main document of "${name}" is ${read.format}, which has no project sections`,
		)
		return
	}
	if (read.dropping) {
		row.outcome = `shadowed by ${read.dropping.label} (${read.dropping.operation})`
		return
	}
	if (!hasBody(body)) {
		row.outcome = 'not used (no body)'
		return
	}
	const kept = { ...metadata }
	// `declined` belongs with a written `extends`, so it is a stack key too (K35).
	for (const key of [...ignoredKeys, ...recordKeys, 'declined']) delete kept[key]
	const applied = applyManaged(body, label, read.managed, read.warnAt)
	if (applied.sections) row.sections = applied.sections
	result.sections.push({
		folder: plugin.folder,
		path: hit.path,
		content: applied.content,
		metadata: kept,
		plugin: plugin.plugin,
	})
}

/** The folder's own `.agents/references/<name>.md` or `<name>/README.md`, when git does not ignore it. */
function readOwnSection(
	name: string,
	folder: ProjectFolder,
	ignored: boolean,
	read: ReadContext,
	result: ProjectSections,
): void {
	const { trace, sections } = result
	const { format, display, without, warnAt, catalog, older, listed, dropping, managed } = read
	// The name's own files answer first, then each older name's (R97).
	const filed = [name, ...older].map((as) => filesFor(folder, as, without))
	const markdown = filed.flatMap((files) => files.markdown)
	const data = filed.flatMap((files) => files.data)
	if (ignored || ![...markdown, ...data].some(listed)) {
		if (markdown.length || data.length)
			trace.push({ folder: folder.folder, path: folder.dir, outcome: 'not read (ignored)' })
		return
	}
	for (const hit of data.filter(listed)) {
		warnAt(display(hit.path))(
			'project-section-not-markdown',
			`it is not delivered: a project section is Markdown, written as ${name}.md`,
		)
	}
	const [hit, ...others] = markdown.filter(listed)
	if (!hit) return
	for (const other of others) {
		warnAt(display(other.path))('file-ignored', `it is ignored: ${hit.file} answers first in that folder`)
	}
	const row: ReferenceTraceProjectSection = { folder: folder.folder, path: hit.path, file: hit.file, outcome: 'used' }
	trace.push(row)
	const label = `project ${display(hit.path)}`
	if (hit.as !== name) {
		row.alias = hit.as
		warnAt(display(hit.path))(
			'reference-renamed',
			`it is filed under the older name "${hit.as}" and applies as "${name}"; rename it to the new name`,
		)
	}
	if (format !== undefined && format !== 'markdown') {
		row.outcome = `not used (format differs from ${format})`
		warnAt(label)(
			'project-section-not-markdown',
			`it is not delivered: the main document of "${name}" is ${format}, which has no project sections`,
		)
		return
	}
	const { metadata, body } = parseDocument(tryRead(hit.path) ?? '', warnAt(label))
	row.frontmatter = metadata
	const kept = { ...metadata }
	// A legacy form warns as one, in place of the key warning it would otherwise raise (R119).
	const legacy = legacyRewrite(metadata, body, 'project', name).findings
	for (const finding of legacy) warnLegacy(finding, 'Run `reference migrate` to rewrite it.', warnAt(label))
	const warnedAsLegacy = new Set(
		legacy.flatMap(({ form }) =>
			form === 'project-selection' ? ['extends'] : form === 'overrides' ? ['overrides'] : ['merge'],
		),
	)
	delete kept['overrides']
	for (const key of ignoredKeys) {
		if (!(key in kept)) continue
		delete kept[key]
		if (warnedAsLegacy.has(key)) continue
		warnAt(label)(
			'project-section-key-ignored',
			`\`${key}\` is ignored in the project section for ${folder.folder}: a project section states only what differs in its folder`,
		)
	}
	if (dropping) {
		row.outcome = `shadowed by ${dropping.label} (${dropping.operation})`
		return
	}
	if (!hasBody(body)) {
		row.outcome = 'not used (no body)'
		return
	}
	for (const key of recordKeys) delete kept[key]
	const applied = applyManaged(body, label, managed, warnAt)
	if (applied.sections) row.sections = applied.sections
	const check = catalog && checkGenerated(metadata, catalog, warnAt(label))
	if (check) {
		if (check.sources.length) row.sources = check.sources
		if (check.request !== undefined) row.request = check.request
		if (check.stale) {
			row.outcome = 'stale'
			warnAt(label)('reference-stale', staleMessage(name, check.sources))
		}
	}
	sections.push({ folder: folder.folder, path: hit.path, content: applied.content, metadata: kept })
}

/** A managed `replace` with a body, or a managed `remove`, drops every project section (UC10.4). */
function droppingOperation(managed: Contribution | undefined) {
	if (managed?.entry.outcome !== 'used') return undefined
	const operation = managed.merge ?? 'patch'
	if (operation === 'remove' || (operation === 'replace' && managed.hasBody)) return { label: managed.label, operation }
	return undefined
}

/** The section as written, or, when the managed contribution changes it, rendered with managed applied over it. */
function applyManaged(
	body: string,
	label: string,
	managed: Contribution | undefined,
	warnAt: (where: string) => WarnFn,
): { content: string; sections?: ReferenceTraceSection[] } {
	const asWritten = withNewline(trimLeadingBlank(stripMergeMarkers(body)))
	if (managed?.entry.outcome !== 'used' || !managed.hasBody || managed.whole) return { content: asWritten }
	const operation = managed.merge ?? 'patch'
	if (operation === 'remove' || operation === 'replace') return { content: asWritten }
	const below = applyContribution(emptyComposed(), body, 'patch', label, warnAt(label))
	const over = applyContribution(below, managed.body, operation, managed.label, warnAt(managed.label), {
		matchedOnly: true,
	})
	const rendered = renderComposed(over)
	if (rendered === renderComposed(below)) return { content: asWritten }
	return {
		content: rendered,
		sections: composedSections(over).map(({ path, sources }) => ({ path, contributions: sources })),
	}
}

/**
 * Every name a project section below the root answers, in a folder and file git does not ignore, and
 * every name a package plugin (K36) holds, less the plugins `plugins` names, which the plugin tier holds.
 */
export function projectSectionNames(
	root: string,
	cache?: ProjectFolderCache,
	plugins: ReadonlySet<string> = new Set(),
): string[] {
	const found = projectFolders(root, cache)
	const held = new Set<string>()
	for (const folder of found.folders) {
		for (const name of layerNames({ tier: 'project', dir: folder.dir })) {
			const { markdown } = filesFor(folder, name, undefined)
			if (markdown.some((hit) => !found.listed || found.listed.has(hit.relative))) held.add(name)
		}
	}
	for (const plugin of packagePlugins(root, cache, plugins)) {
		const dir = packagePluginReferences(plugin)
		for (const name of layerNames({ tier: 'plugin', dir })) {
			if (filesFor({ folder: plugin.folder, dir }, name, undefined).markdown.length) held.add(name)
		}
	}
	return [...held]
}
