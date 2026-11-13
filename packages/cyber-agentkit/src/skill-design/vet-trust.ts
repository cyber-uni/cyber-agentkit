import { isAbsolute } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { contributionLabel } from '../references/reference-contribution.js'
import type { ReferenceLayers } from '../references/reference-layers.js'
import { resolveReference } from '../references/resolve-reference.js'
import type { VetSource } from './vet-source.js'

/** The reference that lists the sources `skill vet` trusts, layered across the tiers like any other. */
export const trustListName = 'skill-design.vet.trusted-sources'

/** The section of the trust list that holds the entries, one list item each. */
export const trustSection = 'Trusted sources'

/** Where an entry given for one run comes from. */
export const trustFlag = '--trust'

/**
 * One trusted source, in the shapes of Claude Code's `strictKnownMarketplaces` allowlist (research: 'E-CC-P8'):
 * a GitHub repository or every repository of an owner (`owner/*`), a git URL, or a local folder by absolute path.
 */
export type TrustEntry =
	| { source: 'github'; repo: string; ref?: string; path?: string }
	| { source: 'git'; url: string; ref?: string; path?: string }
	| { source: 'directory'; path: string }

/** One trusted source, with every place that names it. */
export type TrustedSource = {
	entry: TrustEntry
	/** The entry as written in its short form, such as `acme/*` or `{ source: github, repo: acme/skills, ref: v1 }`. */
	label: string
	/** Each contribution that lists it, such as `repo .agents/references/...` or `plugin acme`, and `--trust`. */
	from: string[]
}

export type TrustList = {
	sources: TrustedSource[]
	/** What was wrong with the trust list, for stderr; a list that does not resolve trusts nothing from the tiers. */
	warnings: string[]
}

const repoPattern = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/(?:[A-Za-z0-9_][A-Za-z0-9_.-]*|\*)$/

const optional = (value: unknown): string | undefined | false =>
	value === undefined ? undefined : typeof value === 'string' && value !== '' ? value : false

/** Reads one entry: a flow mapping with Claude Code's keys, or the short form `owner/repo`, `owner/*`, a URL, or a path. */
export function parseTrustEntry(text: string): TrustEntry | { problem: string } {
	const written = text.trim().replace(/^`(.*)`$/, '$1')
	if (written.startsWith('{')) {
		let value: unknown
		try {
			value = parseYaml(written)
		} catch {
			return { problem: `${written} is not a mapping` }
		}
		if (!value || typeof value !== 'object') return { problem: `${written} is not a mapping` }
		const map = value as Record<string, unknown>
		const ref = optional(map['ref'])
		const path = optional(map['path'])
		if (ref === false || path === false) return { problem: `${written}: ref and path must be text` }
		const extra = { ...(ref ? { ref } : {}), ...(path ? { path } : {}) }
		if (map['source'] === 'github') {
			if (typeof map['repo'] !== 'string' || !repoPattern.test(map['repo']))
				return { problem: `${written}: repo must be owner/repo or owner/*` }
			return { source: 'github', repo: map['repo'], ...extra }
		}
		if (map['source'] === 'git') {
			if (typeof map['url'] !== 'string' || !map['url'].startsWith('https://'))
				return { problem: `${written}: url must be an https:// git URL` }
			return { source: 'git', url: map['url'], ...extra }
		}
		if (map['source'] === 'directory') {
			if (typeof map['path'] !== 'string' || !isAbsolute(map['path']))
				return { problem: `${written}: path must be absolute` }
			if (ref) return { problem: `${written}: a directory has no ref` }
			return { source: 'directory', path: map['path'] }
		}
		return { problem: `${written}: source must be github, git, or directory` }
	}
	if (written.startsWith('https://')) return { source: 'git', url: written }
	if (isAbsolute(written)) return { source: 'directory', path: written }
	if (repoPattern.test(written)) return { source: 'github', repo: written }
	if (/^[A-Za-z0-9_.-]+$/.test(written))
		return { problem: `${written} names no repository; write ${written}/* to trust every repository of the owner` }
	return {
		problem: `${written} is not owner/repo, owner/*, an https:// URL, an absolute path, or a { source: ... } mapping`,
	}
}

/** The entry's short form when it has no ref or path, else its mapping, so equal entries read the same. */
export function trustLabel(entry: TrustEntry): string {
	if (entry.source === 'directory') return entry.path
	const main = entry.source === 'github' ? entry.repo : entry.url
	if (!entry.ref && !entry.path) return main
	const key = entry.source === 'github' ? 'repo' : 'url'
	const rest = [entry.ref ? `ref: ${entry.ref}` : '', entry.path ? `path: ${entry.path}` : ''].filter(Boolean)
	return `{ source: ${entry.source}, ${key}: ${main}, ${rest.join(', ')} }`
}

/**
 * The entries a trust list document holds: each list item under its `Trusted sources` heading. A mapping runs to its
 * closing brace; a short form is the item's first word. Text after it, such as `- acme/*: our own org`, is a note.
 */
export function trustListEntries(content: string): { entries: TrustEntry[]; problems: string[] } {
	const entries: TrustEntry[] = []
	const problems: string[] = []
	let inSection = false
	let level = 0
	for (const line of content.split(/\r?\n/)) {
		const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
		if (heading) {
			const depth = (heading[1] as string).length
			if (inSection && depth <= level) inSection = false
			if (!inSection && (heading[2] as string).toLowerCase() === trustSection.toLowerCase()) {
				inSection = true
				level = depth
			}
			continue
		}
		if (!inSection) continue
		const item = /^\s*[-*+]\s+(.*)$/.exec(line)
		if (!item) continue
		const rest = (item[1] as string).trim()
		const mapping = /^`?(\{[^}]*\})`?/.exec(rest)
		const word = mapping ? (mapping[1] as string) : (rest.split(/\s/)[0] as string).replace(/[:,;]+$/, '')
		const read = parseTrustEntry(word)
		if ('problem' in read) problems.push(read.problem)
		else entries.push(read)
	}
	return { entries, problems }
}

function addEntry(sources: TrustedSource[], entry: TrustEntry, from: string) {
	const label = trustLabel(entry)
	const found = sources.find((source) => source.label === label)
	if (!found) sources.push({ entry, label, from: [from] })
	else if (!found.from.includes(from)) found.from.push(from)
}

/**
 * The sources `skill vet` trusts: the trust list as the reference tiers compose it, each entry with the
 * contributions that list it, then each `--trust` entry for this run.
 */
export function readTrustList(
	layers: ReferenceLayers,
	flagged: readonly string[],
	display: (path: string) => string,
): TrustList {
	const sources: TrustedSource[] = []
	const warnings: string[] = []
	const resolved = resolveReference(trustListName, layers, { display, projectSections: false })
	warnings.push(...resolved.warnings.map(({ code, message }) => `${code}: ${message}`))
	if (resolved.status === 'found' && resolved.content !== undefined) {
		const composed = trustListEntries(resolved.content)
		for (const problem of composed.problems) warnings.push(`trust-entry-invalid: ${problem}; it is skipped`)
		// Each entry is credited to every used contribution whose own text lists it: the composed list is the answer,
		// and each layer read alone through the same resolver says which of them wrote the entry.
		const used = new Set(resolved.trace.layers.filter((layer) => layer.outcome === 'used').map((layer) => layer.path))
		const own = layers.layers
			.filter((layer) => !layer.skipped)
			.flatMap((layer) => {
				const alone = resolveReference(trustListName, [layer], { display, projectSections: false })
				const path = alone.trace.layers.find((entry) => entry.outcome === 'used')?.path
				if (alone.status !== 'found' || alone.content === undefined || !path || !used.has(path)) return []
				const labels = trustListEntries(alone.content).entries.map(trustLabel)
				return [{ label: contributionLabel(layer, path, display), labels }]
			})
		for (const entry of composed.entries) {
			const from = own.filter(({ labels }) => labels.includes(trustLabel(entry))).map(({ label }) => label)
			for (const label of from.length > 0 ? from : ['the composed trust list']) addEntry(sources, entry, label)
		}
	} else if (resolved.code !== 'reference-removed' && resolved.status !== 'missing') {
		warnings.push(
			`trust-list-unresolved: ${resolved.message ?? `${trustListName} is ${resolved.status}`}; only ${trustFlag} entries are trusted`,
		)
	}
	for (const text of flagged) {
		const entry = parseTrustEntry(text)
		if ('problem' in entry) warnings.push(`trust-entry-invalid: ${trustFlag} ${entry.problem}; it is skipped`)
		else addEntry(sources, entry, trustFlag)
	}
	return { sources, warnings }
}

/**
 * Whether an entry covers the source, matched exactly as Claude Code's allowlist matches (research: 'E-CC-P8'): the
 * repository, URL, or folder, the ref, and the path must each be equal or absent on both sides. An `owner/*` entry
 * covers any path in the owner's repositories unless it pins one. A GitHub URL is a `github` source, so a `git`
 * entry never covers it. Every comparison is case-sensitive.
 */
export function covers(entry: TrustEntry, source: VetSource): boolean {
	if (entry.source === 'directory') return source.local !== undefined && entry.path === source.local
	if (source.local) return false
	if (entry.ref !== source.ref) return false
	if (entry.source === 'git') return !source.github && entry.url === source.url && entry.path === source.path
	if (!source.github) return false
	const { owner, repo } = source.github
	if (entry.repo === `${owner}/*`) return entry.path === undefined || entry.path === source.path
	return entry.repo === `${owner}/${repo}` && entry.path === source.path
}

/** The first trusted entry that covers the source, if any. */
export function trustFor(list: readonly TrustedSource[], source: VetSource): TrustedSource | undefined {
	return list.find(({ entry }) => covers(entry, source))
}
