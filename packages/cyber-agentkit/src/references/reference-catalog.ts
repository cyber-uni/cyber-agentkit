import type { ReferenceLayer, ReferenceLayers, ReferenceTier } from './reference-layers.js'
import type { ReferenceWarning } from './reference-warning.js'
import {
	type ReferenceStatus,
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
	/** When `ambiguous`: each `<plugin>/<name>`, and each skill's default as `default of <skill>`. */
	options?: string[]
}

/** One row per name per layer holding it, with the outcome that contribution gets. */
export type ReferenceListLayerRow = {
	name: string
	tier: ReferenceTier
	plugin?: string
	skill?: string
	path: string
	description: string
	outcome: string
	/** A contribution with `extends` and no body. */
	selection?: boolean
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
	if (entry.selection) row.selection = true
	return row
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
	const names = [...new Set([...referenceNames(source), ...holdings.map(({ name }) => name)])].sort((a, b) =>
		a.localeCompare(b),
	)
	for (const name of names) {
		if (matcher && !matcher.test(name)) continue
		const held = holdings.filter((holding) => holding.name === name)
		let resolved = resolveReference(name, source, resolveOptions)
		const tiersHold = resolved.trace.layers.some(({ file, tier }) => file && tier !== 'default')
		if (!tiersHold && held[0])
			resolved = resolveReference(name, withDefault(source, held[0].skill.folder), resolveOptions)
		collect(listing.warnings, seen, resolved.warnings)
		const row: ReferenceListRow = {
			name,
			description: resolved.status === 'found' ? firstLine(resolved.metadata?.['description']) : '',
			status: resolved.status,
		}
		if (resolved.format && resolved.format !== 'markdown') row.format = resolved.format
		if (resolved.options) {
			const skills = held.map(({ skill }) => `default of ${skill.name}`)
			row.options = [...new Set([...resolved.options.filter((option) => option !== 'default'), ...skills])]
		}
		listing.references.push(row)
		for (const entry of resolved.trace.layers) {
			if (entry.file !== undefined && entry.tier !== 'default') listing.layers.push(layerRow(name, entry))
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
	const content = reference.content ?? ''
	if (holds(headings(content))) return 'heading'
	if (holds(content)) return 'body'
	return undefined
}

/**
 * Every name resolves the way `show` would, and each skill's default as its skill loads it; a name
 * no extends orders is searched once per plugin, as the qualified name `show` would need, and a name
 * a `remove` turned off is left out.
 */
export function searchReferences(query: string, source: Source, options: ResolveOptions = {}): ReferenceSearch {
	const normalized = query.trim().toLowerCase()
	const matches: SearchMatch[] = []
	const consider = (reference: ResolvedReference, loadedBy?: string) => {
		if (reference.status !== 'found') return
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
	for (const name of referenceNames(source)) {
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
	matches.sort((a, b) => matchOrder.indexOf(a.match) - matchOrder.indexOf(b.match) || a.name.localeCompare(b.name))
	const unverified = defaultsUnverified(source)
	return unverified ? { matches, defaults: unverified } : { matches }
}
