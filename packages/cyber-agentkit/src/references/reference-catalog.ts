import { aliasIndex, shownName } from './reference-aliases.js'
import type { ReferenceStatusCode, ReferenceWarning } from './reference-codes.js'
import { ReferenceFailure } from './reference-error.js'
import type { ReferenceLayer, ReferenceLayers, ReferenceTier } from './reference-layers.js'
import { parseReferenceName } from './reference-name.js'
import { projectSectionNames } from './reference-project-sections.js'
import { comparePaths } from './reference-projects.js'
import { isGenerated } from './reference-sources.js'
import {
	type ReferenceStatus,
	type ReferenceTraceProjectSection,
	type ResolvedProjectSection,
	type ResolvedReference,
	type ResolveOptions,
	referenceNames,
	resolveReference,
} from './resolve-reference.js'
import { defaultsUnverified, skillHoldings, withDefault } from './skill-defaults.js'

/** One row per name. */
export type ReferenceListRow = {
	format?: string
	name: string
	description: string
	status: ReferenceStatus
	/** Set when not `found`. */
	code?: ReferenceStatusCode
	/** When `ambiguous`: each `<plugin>/<name>`, and each skill's default as `default of <skill>`. */
	options?: string[]
}

export type ReferenceListRowKind = 'selection' | 'generated' | 'project-section'

/** One row per name per layer holding it, with the outcome that contribution gets. */
export type ReferenceListLayerRow = {
	name: string
	tier: ReferenceTier
	plugin?: string
	skill?: string
	path: string
	description: string
	outcome: string
	/** What the row is, when it is one: a contribution with `extends` and no body, a generated document, or a project section. */
	kind?: ReferenceListRowKind
	/** A project section's folder, relative to the root. */
	folder?: string
	/** A skill's default: the `default` step reaches it when this skill loads the name. */
	reachedBy?: string
}

export type ReferenceListing = {
	references: ReferenceListRow[]
	layers: ReferenceListLayerRow[]
	/** Why some skills' defaults are not listed: no harness detected, or one whose skill folders are not verified. */
	defaults?: string
	warnings: ReferenceWarning[]
}

export type ListOptions = ResolveOptions & {
	/** Keep only names matching this pattern: `*` stands for any run of characters, everything else is literal and case-sensitive. */
	pattern?: string | undefined
}

type Source = ReferenceLayers | readonly ReferenceLayer[]

function patternMatcher(pattern: string): RegExp {
	const source = pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
	return new RegExp(`^${source.join('.*')}$`, 's')
}

function firstLine(value: unknown): string {
	return typeof value === 'string' ? value.split('\n')[0]?.trim() || '' : ''
}

function collect(target: ReferenceWarning[], seen: Set<string>, warnings: readonly ReferenceWarning[]) {
	for (const warning of warnings) {
		const key = `${warning.code} ${warning.message}`
		if (!seen.has(key)) target.push(warning)
		seen.add(key)
	}
}

function layerRow(name: string, entry: ResolvedReference['trace']['layers'][number]): ReferenceListLayerRow {
	const row: ReferenceListLayerRow = {
		name,
		tier: entry.tier,
		path: entry.path,
		description: firstLine(entry.description),
		outcome: entry.outcome,
	}
	if (entry.plugin !== undefined) row.plugin = entry.plugin
	if (entry.skill !== undefined) row.skill = entry.skill
	if (entry.selection) row.kind = 'selection'
	else if (isGenerated(entry.frontmatter)) row.kind = 'generated'
	return row
}

function projectRow(name: string, entry: ReferenceTraceProjectSection): ReferenceListLayerRow {
	return {
		name,
		tier: 'project',
		path: entry.path,
		description: firstLine(entry.frontmatter?.['description']),
		outcome: entry.outcome,
		kind: 'project-section',
		folder: entry.folder,
	}
}

/** Every name a tier, a plugin, or a project section below the root holds; a file under an older name counts as the new name's (R98). */
function catalogNames(source: Source): string[] {
	const layers = Array.isArray(source) ? undefined : (source as ReferenceLayers)
	const projects = layers?.root === undefined ? [] : projectSectionNames(layers.root, layers.projects)
	const aliases = aliasIndex(source)
	return [...new Set([...referenceNames(source), ...projects].map((name) => shownName(name, aliases)))]
}

/**
 * One row per name, with its description and, when not `found`, its status and options; and one row
 * per name per layer holding it, and per installed skill holding a default of it. A name only skills'
 * defaults hold resolves as the first such skill loads it. A `pattern` keeps only the names it matches exactly.
 */
export function listReferences(source: Source, options: ListOptions = {}): ReferenceListing {
	const { pattern, ...resolveOptions } = options
	const matcher = pattern === undefined ? undefined : patternMatcher(pattern)
	const listing: ReferenceListing = { references: [], layers: [], warnings: [] }
	const unverified = defaultsUnverified(source)
	if (unverified) listing.defaults = unverified
	const seen = new Set<string>()
	const holdings = skillHoldings(source)
	const names = [...new Set([...catalogNames(source), ...holdings.map(({ name }) => name)])].sort((a, b) =>
		a.localeCompare(b),
	)
	for (const name of names) {
		if (matcher && !matcher.test(name)) continue
		const held = holdings.filter((holding) => holding.name === name)
		let resolved = resolveReference(name, source, resolveOptions)
		const tiersHold =
			resolved.trace.layers.some(({ file, tier }) => file && tier !== 'default') ||
			resolved.trace.projectSections.some(({ file }) => file)
		if (!tiersHold && held[0])
			resolved = resolveReference(name, withDefault(source, held[0].skill.folder), resolveOptions)
		collect(listing.warnings, seen, resolved.warnings)
		const row: ReferenceListRow = {
			name,
			description: resolved.status === 'found' ? firstLine(resolved.metadata?.['description']) : '',
			status: resolved.status,
		}
		if (resolved.code) row.code = resolved.code
		if (resolved.format && resolved.format !== 'markdown') row.format = resolved.format
		if (resolved.options) {
			const skills = held.map(({ skill }) => `default of ${skill.name}`)
			row.options = [...new Set([...resolved.options.filter((option) => option !== 'default'), ...skills])]
		}
		listing.references.push(row)
		for (const entry of resolved.trace.layers) {
			if (entry.file !== undefined && entry.tier !== 'default') listing.layers.push(layerRow(name, entry))
		}
		for (const entry of resolved.trace.projectSections) {
			if (entry.file !== undefined) listing.layers.push(projectRow(name, entry))
		}
		for (const { skill } of held)
			listing.layers.push(defaultRow(name, skill.name, skill.folder, source, resolveOptions))
	}
	return listing
}

/** A skill's default, with the outcome it gets when its skill loads the name. */
function defaultRow(
	name: string,
	skill: string,
	folder: string,
	source: Source,
	options: ResolveOptions,
): ReferenceListLayerRow {
	const loaded = resolveReference(name, withDefault(source, folder), options)
	const entry = loaded.trace.layers.find(
		({ tier, file }) => tier === 'default' && file,
	) as ResolvedReference['trace']['layers'][number]
	return { ...layerRow(name, entry), reachedBy: `the default step, when ${skill} loads ${name}` }
}

export type MatchKind = 'name' | 'prefix' | 'close name' | 'description' | 'heading' | 'body'

const matchOrder: readonly MatchKind[] = ['name', 'prefix', 'close name', 'description', 'heading', 'body']

export type SearchMatch = {
	name: string
	description: string
	match: MatchKind
	/** The tier of the highest contribution whose text the document holds. */
	tier: ReferenceTier
	plugin?: string
	skill?: string
	/** A match found as this skill loads the name, its default joined. */
	loadedBy?: string
	/** A match in a project section: its folder, relative to the root. */
	folder?: string
}

export type ReferenceSearch = {
	matches: SearchMatch[]
	/** Why some skills' defaults are not searched: no harness detected, or one whose skill folders are not verified. */
	defaults?: string
}

function distance(a: string, b: string): number {
	let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
	for (let i = 1; i <= a.length; i++) {
		const current = [i]
		for (let j = 1; j <= b.length; j++) {
			const substitution = (previous[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1)
			current.push(Math.min((previous[j] as number) + 1, (current[j - 1] as number) + 1, substitution))
		}
		previous = current
	}
	return previous[b.length] as number
}

function headings(content: string): string {
	let fenced = false
	const lines: string[] = []
	for (const line of content.split('\n')) {
		if (/^ {0,3}(`{3,}|~{3,})/.test(line)) fenced = !fenced
		else if (!fenced && /^ {0,3}#{1,6}\s/.test(line)) lines.push(line)
	}
	return lines.join('\n')
}

function tagText(value: unknown): string {
	if (Array.isArray(value)) return value.map(String).join(' ')
	return typeof value === 'string' ? value : ''
}

function matchKind(name: string, reference: ResolvedReference, query: string): MatchKind | undefined {
	const bare = name.slice(name.lastIndexOf('/') + 1).toLowerCase()
	if (bare === query || name.toLowerCase() === query) return 'name'
	if (bare.startsWith(query)) return 'prefix'
	if (bare.includes(query) || distance(bare, query) <= Math.max(1, Math.floor(query.length / 4))) return 'close name'
	const terms = query.split(/\s+/)
	const holds = (text: string) => {
		const lower = text.toLowerCase()
		return terms.every((term) => lower.includes(term))
	}
	const metadata = reference.metadata ?? {}
	if (
		holds(`${typeof metadata['description'] === 'string' ? metadata['description'] : ''} ${tagText(metadata['tags'])}`)
	) {
		return 'description'
	}
	return textMatch(reference.content ?? '', holds)
}

function textMatch(content: string, holds: (text: string) => boolean): MatchKind | undefined {
	if (holds(headings(content))) return 'heading'
	if (holds(content)) return 'body'
	return undefined
}

/** A project section is searched by its description and tags, its headings, and its body (R17); its name is the main document's. */
function sectionMatchKind(section: ResolvedProjectSection, query: string): MatchKind | undefined {
	const terms = query.split(/\s+/)
	const holds = (text: string) => {
		const lower = text.toLowerCase()
		return terms.every((term) => lower.includes(term))
	}
	const { metadata } = section
	if (
		holds(`${typeof metadata['description'] === 'string' ? metadata['description'] : ''} ${tagText(metadata['tags'])}`)
	) {
		return 'description'
	}
	return textMatch(section.content, holds)
}

/**
 * Every name resolves the way `load` would, and each skill's default as its skill loads it; a name
 * no extends orders is searched once per plugin, as the qualified name `load` would need, and a name
 * a `remove` turned off is left out.
 */
export function searchReferences(query: string, source: Source, options: ResolveOptions = {}): ReferenceSearch {
	const normalized = query.trim().toLowerCase()
	if (!normalized) {
		throw new ReferenceFailure('query-missing', 'search needs a query: what the reference is about.', {
			help: 'Run `reference list` for every name.',
		})
	}
	const matches: SearchMatch[] = []
	const sectionsSeen = new Set<string>()
	const considerSections = (reference: ResolvedReference) => {
		const bare = parseReferenceName(reference.name).name
		for (const section of reference.projectSections) {
			const key = `${bare}\0${section.folder}`
			if (sectionsSeen.has(key)) continue
			sectionsSeen.add(key)
			const match = sectionMatchKind(section, normalized)
			if (!match) continue
			matches.push({
				name: reference.name,
				description: firstLine(section.metadata['description']),
				match,
				tier: 'project',
				folder: section.folder,
			})
		}
	}
	const consider = (reference: ResolvedReference, loadedBy?: string) => {
		if (reference.status !== 'found') return
		considerSections(reference)
		const match = matchKind(reference.name, reference, normalized)
		if (!match) return
		const top = reference.trace.contributions.at(-1)
		const row: SearchMatch = {
			name: reference.name,
			description: firstLine(reference.metadata?.['description']),
			match,
			tier: top?.tier ?? 'plugin',
		}
		if (top?.plugin !== undefined) row.plugin = top.plugin
		if (top?.skill !== undefined) row.skill = top.skill
		if (loadedBy !== undefined) row.loadedBy = loadedBy
		matches.push(row)
	}
	const plain = new Map<string, string | undefined>()
	for (const name of catalogNames(source)) {
		const resolved = resolveReference(name, source, options)
		plain.set(name, resolved.content)
		if (resolved.status !== 'ambiguous') consider(resolved)
		else {
			for (const option of resolved.options ?? []) {
				if (option !== 'default') consider(resolveReference(option, source, options))
			}
		}
	}
	for (const { name, skill } of skillHoldings(source)) {
		const loaded = resolveReference(name, withDefault(source, skill.folder), options)
		// A default its skill's load does not reach, or one that changes nothing, adds no match of its own.
		const used = loaded.trace.layers.some(({ tier, outcome }) => tier === 'default' && outcome === 'used')
		if (used && loaded.content !== plain.get(name)) consider(loaded, skill.name)
	}
	matches.sort(
		(a, b) =>
			matchOrder.indexOf(a.match) - matchOrder.indexOf(b.match) ||
			a.name.localeCompare(b.name) ||
			comparePaths(a.folder ?? '', b.folder ?? ''),
	)
	const unverified = defaultsUnverified(source)
	return unverified ? { matches, defaults: unverified } : { matches }
}
