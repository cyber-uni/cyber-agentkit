import type { ReferenceLayer, ReferenceLayers, ReferenceTier } from './reference-layers.js'
import type { ReferenceWarning } from './reference-warning.js'
import {
	type ReferenceStatus,
	type ResolvedReference,
	type ResolveOptions,
	referenceNames,
	resolveReference,
} from './resolve-reference.js'

/** One row per name. */
export type ReferenceListRow = {
	name: string
	description: string
	status: ReferenceStatus
	/** When `ambiguous`: each `<plugin>/<name>`, and `default`. */
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
}

export type ReferenceListing = {
	references: ReferenceListRow[]
	layers: ReferenceListLayerRow[]
	/** Why no skill's default is listed: the harness's skill folders are not verified yet (#114). */
	defaults: string
	warnings: ReferenceWarning[]
}

export type ListOptions = ResolveOptions & {
	/** Keep only names matching this pattern: `*` stands for any run of characters, everything else is literal and case-sensitive. */
	pattern?: string | undefined
}

type Source = ReferenceLayers | readonly ReferenceLayer[]

/**
 * Defaults are found in the skill folders the detected harness reads. Which folders those are, and
 * which copy of a skill runs, is not verified for any harness yet (spec Q12, #114), so none is read.
 */
export const defaultsNotListed =
	"no skill's default is listed: the skill folders the harness reads are not verified yet, so only the --default folder a skill passes is read"

function patternMatcher(pattern: string): RegExp {
	const source = pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
	return new RegExp(`^${source.join('.*')}$`, 's')
}

function firstLine(value: unknown): string {
	return typeof value === 'string' ? value.split('\n')[0]?.trim() || '' : ''
}

/**
 * One row per name, with its description and, when not `found`, its status and options; and one row
 * per name per layer holding it. A `pattern` keeps only the names it matches exactly.
 */
export function listReferences(source: Source, options: ListOptions = {}): ReferenceListing {
	const { pattern, ...resolveOptions } = options
	const matcher = pattern === undefined ? undefined : patternMatcher(pattern)
	const listing: ReferenceListing = { references: [], layers: [], defaults: defaultsNotListed, warnings: [] }
	const seen = new Set<string>()
	for (const name of referenceNames(source)) {
		if (matcher && !matcher.test(name)) continue
		const resolved = resolveReference(name, source, resolveOptions)
		for (const warning of resolved.warnings) {
			const key = `${warning.code} ${warning.message}`
			if (!seen.has(key)) listing.warnings.push(warning)
			seen.add(key)
		}
		const row: ReferenceListRow = {
			name,
			description: resolved.status === 'found' ? firstLine(resolved.metadata?.['description']) : '',
			status: resolved.status,
		}
		if (resolved.options) row.options = resolved.options
		listing.references.push(row)
		for (const entry of resolved.trace.layers) {
			if (entry.file === undefined) continue
			const layerRow: ReferenceListLayerRow = {
				name,
				tier: entry.tier,
				path: entry.path,
				description: firstLine(entry.description),
				outcome: entry.outcome,
			}
			if (entry.plugin !== undefined) layerRow.plugin = entry.plugin
			if (entry.skill !== undefined) layerRow.skill = entry.skill
			if (entry.selection) layerRow.selection = true
			listing.layers.push(layerRow)
		}
	}
	return listing
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
}

export type ReferenceSearch = {
	matches: SearchMatch[]
	/** Why no skill's default is searched (#114). */
	defaults: string
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
 * Every name resolves the way `show` would; a name no extends orders is searched once per plugin, as
 * the qualified name `show` would need, and a name a `remove` turned off is left out.
 */
export function searchReferences(query: string, source: Source, options: ResolveOptions = {}): ReferenceSearch {
	const normalized = query.trim().toLowerCase()
	const matches: SearchMatch[] = []
	for (const name of referenceNames(source)) {
		const resolved = resolveReference(name, source, options)
		const candidates =
			resolved.status === 'ambiguous'
				? (resolved.options ?? [])
						.filter((option) => option !== 'default')
						.map((qualified) => resolveReference(qualified, source, options))
				: [resolved]
		for (const reference of candidates.filter(({ status }) => status === 'found')) {
			const match = matchKind(reference.name, reference, normalized)
			if (!match) continue
			const top = reference.trace.contributions.at(-1)
			const row: SearchMatch = {
				name: reference.name,
				description: firstLine(reference.metadata?.['description']),
				match,
				tier: top?.tier ?? 'plugin',
			}
			if (top?.plugin !== undefined) row.plugin = top.plugin
			if (top?.skill !== undefined) row.skill = top.skill
			matches.push(row)
		}
	}
	matches.sort((a, b) => matchOrder.indexOf(a.match) - matchOrder.indexOf(b.match) || a.name.localeCompare(b.name))
	return { matches, defaults: defaultsNotListed }
}
