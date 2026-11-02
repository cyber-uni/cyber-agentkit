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
import { comparePaths, type ProjectFolder, type ProjectFolderCache, projectFolders } from './reference-projects.js'
import { checkGenerated, type ReferenceTraceSource, type SourceCatalog, staleMessage } from './reference-sources.js'
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
}

type Found = { folder: ProjectFolder; file: string; path: string; relative: string }

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

/**
 * Every project section of `name` below the root, in path order (R99): each folder's
 * `.agents/references/<name>.md` or `<name>/README.md`, in a folder git does not ignore. The managed
 * contribution applies over each by heading path: a section it matches nothing in is left as it is,
 * and a managed `replace` or `remove` drops them all. A name whose main document is not Markdown gets
 * none, and a non-Markdown file in a project folder never answers; each warns.
 */
export function readProjectSections(name: string, options: ProjectSectionOptions): ProjectSections {
	const { root, cache, managed, format, display, without, warnAt, catalog } = options
	const found = projectFolders(root, cache)
	const trace: ReferenceTraceProjectSection[] = []
	const sections: ResolvedProjectSection[] = []
	const all = [
		...found.folders.map((folder) => ({ folder, ignored: false })),
		...found.ignored.map((folder) => ({ folder, ignored: true })),
	].sort((a, b) => comparePaths(a.folder.folder, b.folder.folder))
	const listed = (hit: Found) => !found.listed || found.listed.has(hit.relative)
	const dropping = droppingOperation(managed)
	for (const { folder, ignored } of all) {
		const { markdown, data } = filesFor(folder, name, without)
		if (ignored || ![...markdown, ...data].some(listed)) {
			if (markdown.length || data.length)
				trace.push({ folder: folder.folder, path: folder.dir, outcome: 'not read (ignored)' })
			continue
		}
		for (const hit of data.filter(listed)) {
			warnAt(display(hit.path))(
				'project-section-not-markdown',
				`it is not delivered: a project section is Markdown, written as ${name}.md`,
			)
		}
		const [hit, ...others] = markdown.filter(listed)
		if (!hit) continue
		for (const other of others) {
			warnAt(display(other.path))('file-ignored', `it is ignored: ${hit.file} answers first in that folder`)
		}
		const row: ReferenceTraceProjectSection = { folder: folder.folder, path: hit.path, file: hit.file, outcome: 'used' }
		trace.push(row)
		const label = `project ${display(hit.path)}`
		if (format !== undefined && format !== 'markdown') {
			row.outcome = `not used (format differs from ${format})`
			warnAt(label)(
				'project-section-not-markdown',
				`it is not delivered: the main document of "${name}" is ${format}, which has no project sections`,
			)
			continue
		}
		const { metadata, body } = parseDocument(tryRead(hit.path) ?? '', warnAt(label))
		row.frontmatter = metadata
		const kept = { ...metadata }
		for (const key of ignoredKeys) {
			if (!(key in kept)) continue
			delete kept[key]
			warnAt(label)(
				'project-section-key-ignored',
				`\`${key}\` is ignored in the project section for ${folder.folder}: a project section states only what differs in its folder`,
			)
		}
		if (dropping) {
			row.outcome = `shadowed by ${dropping.label} (${dropping.operation})`
			continue
		}
		if (!hasBody(body)) {
			row.outcome = 'not used (no body)'
			continue
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
	return { sections, trace }
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

/** Every name a project section below the root answers, in a folder and file git does not ignore. */
export function projectSectionNames(root: string, cache?: ProjectFolderCache): string[] {
	const found = projectFolders(root, cache)
	const held = new Set<string>()
	for (const folder of found.folders) {
		for (const name of layerNames({ tier: 'project', dir: folder.dir })) {
			const { markdown } = filesFor(folder, name, undefined)
			if (markdown.some((hit) => !found.listed || found.listed.has(hit.relative))) held.add(name)
		}
	}
	return [...held]
}
