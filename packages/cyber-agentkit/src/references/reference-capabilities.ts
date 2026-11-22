import type { ReferenceWarning } from './reference-codes.js'
import { type DocumentSection, type InterfaceCheckFailure, interfaceSuffix } from './reference-interface.js'

/** A capability reference is named `<system>.capabilities` (K40, decision 0008). */
export const capabilitiesSuffix = '.capabilities'

/** The three sections a capability reference opens with, in this order (K40, R137). */
export const capabilityPreamble: readonly { heading: string; holds: string }[] = [
	{
		heading: 'System',
		holds:
			'What the system is, links to its docs, the versions or tiers this reference covers, and the tools needed with their minimum versions.',
	},
	{ heading: 'Detect', holds: 'How a skill tells this system is the one in use.' },
	{
		heading: 'Verified',
		holds:
			'For each version or tier covered: how this reference was checked, `run`, `from docs`, or `untested`, and when.',
	},
]

/**
 * The system a capability reference's name describes: `<system>` of `<system>.capabilities`, one
 * segment (K40). `undefined` for any other name, a qualified one's plugin aside.
 */
export function capabilitySystemOf(name: string): string | undefined {
	const bare = name.slice(name.lastIndexOf('/') + 1)
	if (!bare.endsWith(capabilitiesSuffix)) return undefined
	const system = bare.slice(0, -capabilitiesSuffix.length)
	return system && !system.includes('.') ? system : undefined
}

/**
 * What `create <system>.capabilities` writes (R140): System, Detect, and Verified, in order, each
 * saying what it holds. Every section after them is a feature.
 */
export function capabilityTemplate(system: string): string {
	const preamble = capabilityPreamble.map(({ heading, holds }) => `## ${heading}\n\n${holds}\n`)
	return `---\ndescription: What ${system} can do, and when an agent should read it.\n---\n\n${preamble.join('\n')}`
}

function key(title: string): string {
	return title.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * The `capability` failures for a capability reference (R137, R139): its first three `##` sections are
 * not System, Detect, and Verified in that order, or it declares `implements`. What a section says
 * is never checked (R141).
 */
export function checkCapability(
	name: string,
	metadata: Record<string, unknown>,
	sections: readonly DocumentSection[],
): InterfaceCheckFailure[] {
	const failures: InterfaceCheckFailure[] = []
	const expected = capabilityPreamble.map(({ heading }) => heading)
	const opening = sections.slice(0, expected.length).map(({ title }) => title)
	if (!expected.every((heading, index) => key(opening[index] ?? '') === key(heading))) {
		const missing = expected.filter((heading) => !sections.some(({ title }) => key(title) === key(heading)))
		const found = opening.length ? opening.join(', ') : 'no sections'
		failures.push({
			check: 'capability',
			message: missing.length
				? `${name} has no ${missing.join(', ')} ${missing.length === 1 ? 'section' : 'sections'}; a capability reference opens with System, Detect, and Verified, in that order`
				: `${name} opens with ${found}; a capability reference opens with System, Detect, and Verified, in that order`,
		})
	}
	if (metadata['implements'] !== undefined) {
		failures.push({
			check: 'capability',
			message: `${name} declares implements; a capability reference says what a system can do and implements no interface`,
		})
	}
	return failures
}

/**
 * The warning for an interface whose id ends `.capabilities`, the name a capability reference takes
 * (decision 0008). repobuddy's `project-tracker.capabilities` is renaming to `project-tracker.blueprints`
 * (repobuddy/repobuddy#1000); until that ships, the old name warns and does not fail.
 */
export function capabilitiesInterfaceWarning(id: string): ReferenceWarning | undefined {
	if (!id.endsWith(capabilitiesSuffix)) return undefined
	const renamed = `${id.slice(0, -capabilitiesSuffix.length)}.blueprints`
	return {
		code: 'reference-renamed',
		message: `${id}${interfaceSuffix} declares an interface under a capability reference's name; rename the interface to ${renamed}, and its implementations to ${renamed}.<key>`,
	}
}
