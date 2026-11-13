import { contributionLabel } from '../references/reference-contribution.js'
import type { ReferenceLayers } from '../references/reference-layers.js'
import { resolveReference } from '../references/resolve-reference.js'

/** The reference that lists the publishers `skill vet` trusts, layered across the tiers like any other. */
export const trustListName = 'skill-design.vet.trusted-publishers'

/** The section of the trust list that holds the names, one list item each. */
export const trustSection = 'Trusted publishers'

/** The source `--trust` names a publisher from, for one run. */
export const trustFlag = '--trust'

/** One trusted publisher, with every place that names it. */
export type TrustedPublisher = {
	name: string
	/** Each contribution that lists the name, such as `repo .agents/references/...` or `plugin acme`, and `--trust`. */
	from: string[]
}

export type TrustList = {
	publishers: TrustedPublisher[]
	/** What was wrong with the trust list, for stderr; a list that does not resolve trusts no one from the tiers. */
	warnings: string[]
}

/** A GitHub login: letters, digits, and single hyphens, at most 39 characters. */
const loginPattern = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/

/**
 * The names a trust list document holds: each list item under its `Trusted publishers` heading, its first word with
 * backticks dropped. The text after the name, such as `- acme: our own org`, is a note.
 */
export function trustListNames(content: string): { names: string[]; skipped: string[] } {
	const names: string[] = []
	const skipped: string[] = []
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
		const item = /^\s*[-*+]\s+(\S+)/.exec(line)
		if (!item) continue
		const name = (item[1] as string).replace(/`/g, '').replace(/[:,;.]+$/, '')
		if (loginPattern.test(name)) names.push(name)
		else skipped.push(name)
	}
	return { names, skipped }
}

function addName(publishers: TrustedPublisher[], name: string, from: string) {
	const found = publishers.find((publisher) => publisher.name.toLowerCase() === name.toLowerCase())
	if (!found) publishers.push({ name, from: [from] })
	else if (!found.from.includes(from)) found.from.push(from)
}

/**
 * The publishers `skill vet` trusts: the trust list as the reference tiers compose it, each name with the
 * contributions that list it, then each `--trust` name for this run. Names compare without case, as GitHub's do.
 */
export function readTrustList(
	layers: ReferenceLayers,
	flagged: readonly string[],
	display: (path: string) => string,
): TrustList {
	const publishers: TrustedPublisher[] = []
	const warnings: string[] = []
	const resolved = resolveReference(trustListName, layers, { display, projectSections: false })
	warnings.push(...resolved.warnings.map(({ code, message }) => `${code}: ${message}`))
	if (resolved.status === 'found' && resolved.content !== undefined) {
		const composed = trustListNames(resolved.content)
		for (const name of composed.skipped)
			warnings.push(`trust-name-invalid: "${name}" is not a GitHub owner; it is skipped`)
		// Each name is credited to every used contribution whose own text lists it: the composed list is the answer,
		// and each layer read alone through the same resolver says which of them wrote the name.
		const used = new Set(resolved.trace.layers.filter((layer) => layer.outcome === 'used').map((layer) => layer.path))
		const own = layers.layers
			.filter((layer) => !layer.skipped)
			.flatMap((layer) => {
				const alone = resolveReference(trustListName, [layer], { display, projectSections: false })
				const path = alone.trace.layers.find((entry) => entry.outcome === 'used')?.path
				if (alone.status !== 'found' || alone.content === undefined || !path || !used.has(path)) return []
				const names = trustListNames(alone.content).names.map((name) => name.toLowerCase())
				return [{ label: contributionLabel(layer, path, display), names }]
			})
		for (const name of composed.names) {
			const from = own.filter(({ names }) => names.includes(name.toLowerCase())).map(({ label }) => label)
			for (const label of from.length > 0 ? from : ['the composed trust list']) addName(publishers, name, label)
		}
	} else if (resolved.code !== 'reference-removed' && resolved.status !== 'missing') {
		warnings.push(
			`trust-list-unresolved: ${resolved.message ?? `${trustListName} is ${resolved.status}`}; only ${trustFlag} names are trusted`,
		)
	}
	for (const name of flagged) addName(publishers, name, trustFlag)
	return { publishers, warnings }
}

/** Whether a publisher is on the trust list; one with no known name is not. */
export function isTrusted(list: readonly TrustedPublisher[], publisher: string | undefined): boolean {
	if (!publisher) return false
	return list.some(({ name }) => name.toLowerCase() === publisher.toLowerCase())
}
