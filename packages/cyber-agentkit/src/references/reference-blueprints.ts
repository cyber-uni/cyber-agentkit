import { capabilitiesSuffix, capabilityPreamble } from './reference-capabilities.js'
import type { ReferenceWarning } from './reference-codes.js'
import { fenceTracker, parseSections, type Section } from './reference-document.js'
import { documentSections, type InterfaceCheckFailure, type ReferenceInterface } from './reference-interface.js'
import type { ResolvedReference } from './resolve-reference.js'

/** A blueprint interface's id ends `.blueprints` (K41, decision 0008). */
export const blueprintsSuffix = '.blueprints'

/** Whether an interface id names a blueprint interface (K41). */
export function isBlueprintInterface(id: string): boolean {
	return id.endsWith(blueprintsSuffix) && id.length > blueprintsSuffix.length
}

/** The `blueprint` failure of a blueprint interface whose cardinality is not `many` (R143). */
export function checkBlueprintInterface(
	iface: Pick<ReferenceInterface, 'id' | 'cardinality'>,
): InterfaceCheckFailure | undefined {
	if (!isBlueprintInterface(iface.id) || iface.cardinality === 'many') return undefined
	return {
		check: 'blueprint',
		interface: iface.id,
		message: `${iface.id} is a blueprint interface, which has many implementations; declare cardinality many`,
	}
}

/**
 * A blueprint's system and solution, read from its key (K41): `<id>.<system>.<solution>`, under the
 * interface's id or an older one. `undefined` when the name is not under any of them; `solution` is
 * empty when the key has one segment.
 */
export function blueprintKeyOf(name: string, ids: readonly string[]): { system: string; solution: string } | undefined {
	const id = ids.find((each) => name.startsWith(`${each}.`) && name.length > each.length + 1)
	if (id === undefined) return undefined
	const key = name.slice(id.length + 1)
	const dot = key.indexOf('.')
	return dot === -1 ? { system: key, solution: '' } : { system: key.slice(0, dot), solution: key.slice(dot + 1) }
}

/** One feature a blueprint's section needs, as its `Needs:` line names it (K44). */
export type BlueprintNeed = { section: string; feature: string }

const needsPattern = /^\s*Needs:\s*(.*)$/

function sectionKey(title: string): string {
	return title.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** A feature as a `Needs:` line writes it: comma-separated, a closing period or code ticks aside. */
function featureNames(list: string): string[] {
	return list
		.split(',')
		.map((item) =>
			item
				.trim()
				.replace(/\.$/, '')
				.replace(/^`(.*)`$/, '$1')
				.trim(),
		)
		.filter(Boolean)
}

/** Every line of a section and the sections below it, outside a code fence. */
function sectionLines(section: Section): string[] {
	const inFence = fenceTracker()
	const own = section.text.filter((line) => !inFence(line))
	return [...own, ...section.children.flatMap(sectionLines)]
}

/** The features each top-level section of a blueprint needs, in document order (K44). */
export function blueprintNeeds(content: string): BlueprintNeed[] {
	const needs: BlueprintNeed[] = []
	const visit = (section: Section) => {
		if (section.depth !== 0) {
			for (const child of section.children) visit(child)
			return
		}
		for (const line of sectionLines(section)) {
			const match = needsPattern.exec(line)
			if (!match) continue
			for (const feature of featureNames(match[1] as string)) needs.push({ section: section.title, feature })
		}
	}
	for (const section of parseSections(content, () => {}).children) visit(section)
	return needs
}

/** A capability reference's features: every top-level section after System, Detect, and Verified (K40). */
function capabilityFeatures(content: string) {
	const opening = new Set(capabilityPreamble.map(({ heading }) => sectionKey(heading)))
	return documentSections(content).filter(({ title }) => !opening.has(sectionKey(title)))
}

/**
 * A capability reference's Verified entries (K40): each list item of its Verified section, or, when it
 * holds no list, each line with text.
 */
export function verifiedEntries(content: string): string[] {
	const verified = parseSections(content, () => {}).children.find(
		(section) => sectionKey(section.title) === sectionKey('Verified'),
	)
	if (!verified) return []
	const inFence = fenceTracker()
	const lines = verified.text.filter((line) => !inFence(line) && line.trim())
	const items = lines.filter((line) => /^\s*[-*+]\s+/.test(line)).map((line) => line.replace(/^\s*[-*+]\s+/, '').trim())
	return items.length ? items : lines.map((line) => line.trim())
}

/** What a blueprint builds on: its system, its capability reference's name, and that reference's Verified entries. */
export type BlueprintFacts = { system: string; capability: string; verified: string[] }

/** Resolves `<system>.capabilities` as a load in the same working folder would (R147). */
export type CapabilityLookup = (system: string) => ResolvedReference

export type BlueprintCheck = {
	failures: InterfaceCheckFailure[]
	warnings: ReferenceWarning[]
	blueprint?: BlueprintFacts
}

/**
 * Checks a blueprint against its capability reference (R144, R145, R147): the reference must be
 * `found`, and hold a feature section for each feature a `Needs:` line names; each needed feature it
 * marks `**Unsupported.**` warns. A name with no `<solution>` fails. Reads files only: no command is
 * run and no version compared (R149).
 */
export function checkBlueprint(
	name: string,
	content: string,
	iface: Pick<ReferenceInterface, 'id'>,
	ids: readonly string[],
	capability: CapabilityLookup,
): BlueprintCheck {
	const result: BlueprintCheck = { failures: [], warnings: [] }
	const key = blueprintKeyOf(name, ids)
	// A name outside the namespace already fails `name`.
	if (key === undefined) return result
	const fail = (message: string) => result.failures.push({ check: 'blueprint', interface: iface.id, message })
	if (!key.solution) {
		fail(`${name} names no solution; a blueprint is named ${iface.id}.<system>.<solution>`)
	}
	const reference = `${key.system}${capabilitiesSuffix}`
	const resolved = capability(key.system)
	if (resolved.status !== 'found') {
		fail(
			`its capability reference ${reference} is ${resolved.status}${resolved.message ? `: ${resolved.message}` : ''}`,
		)
		return result
	}
	const capabilityContent = resolved.content ?? ''
	result.blueprint = { system: key.system, capability: reference, verified: verifiedEntries(capabilityContent) }
	const features = new Map(capabilityFeatures(capabilityContent).map((feature) => [sectionKey(feature.title), feature]))
	for (const { section, feature } of blueprintNeeds(content)) {
		const found = features.get(sectionKey(feature))
		if (!found) {
			fail(`section ${section} needs ${feature}, which ${reference} has no feature section for`)
		} else if (found.unsupported) {
			result.warnings.push({
				code: 'feature-unsupported',
				message: `section ${section} needs ${feature}, which ${reference} marks **Unsupported.** here`,
			})
		}
	}
	return result
}
