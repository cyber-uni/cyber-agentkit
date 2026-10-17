import { isRecord } from '../plugins/json-file.js'
import { parseSections, type Section } from './reference-document.js'
import type { ReferenceTier } from './reference-layers.js'

/** `one`: the implementation is named `<id>`. `many`: each is named `<id>.<key>`. */
export type InterfaceCardinality = 'one' | 'many'

export type InterfaceSection = { name: string; required: boolean }

/** The machine-readable part of an interface document, read from its `interface:` frontmatter. */
export type ReferenceInterface = {
	id: string
	cardinality: InterfaceCardinality
	version: number
	/** The versions the owner's consumers accept; `[version]` when the document names none. */
	versions: number[]
	/** Who may implement it; every tier when the document names none. */
	tiers?: ReferenceTier[]
	/** In order. Heading text is API. */
	sections: InterfaceSection[]
}

/** One `implements:` entry, `<id>@<version>`. */
export type ImplementsEntry = { id: string; version: number }

export type InterfaceCheck =
	| 'interface found'
	| 'version'
	| 'name'
	| 'tier'
	| 'required'
	| 'known'
	| 'order'
	| 'interface'

export type InterfaceCheckFailure = {
	check: InterfaceCheck
	/** The interface id the failure is about, when the document names one. */
	interface?: string
	message: string
}

export const interfaceSuffix = '.interface'

const tiers: readonly ReferenceTier[] = ['managed', 'project', 'user', 'plugin']
const implementsPattern = /^([a-z0-9]+(?:[-.][a-z0-9]+)*)@(\d+)$/i

/** The interface id an interface document's name declares, or `undefined` for any other name. */
export function interfaceIdOf(name: string): string | undefined {
	return name.endsWith(interfaceSuffix) && name.length > interfaceSuffix.length
		? name.slice(0, -interfaceSuffix.length)
		: undefined
}

function isVersion(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function readSection(value: unknown): InterfaceSection | string {
	if (typeof value === 'string' && value.trim()) return { name: value.trim(), required: false }
	if (isRecord(value)) {
		const entries = Object.entries(value)
		if (entries.length === 1) {
			const [name, mark] = entries[0] as [string, unknown]
			if (name.trim() && mark === 'required') return { name: name.trim(), required: true }
			if (name.trim()) return `section "${name}" is marked "${String(mark)}"; the only mark is required`
		}
	}
	return `section ${JSON.stringify(value)} is not a heading name, or a heading name marked required`
}

/**
 * Reads the `interface:` block of an interface document. Problems are what `check` reports as a
 * malformed interface; a document with any problem has no `value`.
 */
export function readInterface(
	id: string,
	metadata: Record<string, unknown>,
): { value?: ReferenceInterface; problems: string[] } {
	const block = metadata['interface']
	if (!isRecord(block)) {
		return {
			problems: [
				block === undefined ? 'has no `interface:` block in its frontmatter' : '`interface:` is not a mapping',
			],
		}
	}
	const problems: string[] = []
	const cardinality = block['cardinality']
	if (cardinality !== 'one' && cardinality !== 'many') {
		problems.push(`cardinality is ${JSON.stringify(cardinality)}; it is one or many`)
	}
	const version = block['version']
	if (!isVersion(version)) problems.push(`version is ${JSON.stringify(version)}; it is a positive integer`)
	const versionsValue = block['versions']
	let versions: number[] = isVersion(version) ? [version] : []
	if (versionsValue !== undefined) {
		if (Array.isArray(versionsValue) && versionsValue.length && versionsValue.every(isVersion)) versions = versionsValue
		else problems.push('versions is not a list of positive integers')
	}
	const tiersValue = block['tiers']
	if (
		tiersValue !== undefined &&
		!(
			Array.isArray(tiersValue) &&
			tiersValue.length &&
			tiersValue.every((tier) => tiers.includes(tier as ReferenceTier))
		)
	) {
		problems.push(`tiers is not a list of ${tiers.join(', ')}`)
	}
	const sectionsValue = block['sections']
	const sections: InterfaceSection[] = []
	if (!Array.isArray(sectionsValue) || !sectionsValue.length) problems.push('sections is not a list of headings')
	else {
		const seen = new Set<string>()
		for (const item of sectionsValue) {
			const section = readSection(item)
			if (typeof section === 'string') {
				problems.push(section)
				continue
			}
			const key = sectionKey(section.name)
			if (seen.has(key)) problems.push(`section "${section.name}" is listed more than once`)
			seen.add(key)
			sections.push(section)
		}
	}
	if (problems.length) return { problems }
	const value: ReferenceInterface = {
		id,
		cardinality: cardinality as InterfaceCardinality,
		version: version as number,
		versions,
		sections,
	}
	if (tiersValue !== undefined) value.tiers = tiersValue as ReferenceTier[]
	return { value, problems }
}

/** Reads `implements:`, a string or a list of `<id>@<version>`. Problems name each malformed entry. */
export function readImplements(metadata: Record<string, unknown>): { entries: ImplementsEntry[]; problems: string[] } {
	const value = metadata['implements']
	if (value === undefined) return { entries: [], problems: [] }
	const list: unknown[] = Array.isArray(value) ? value : [value]
	const entries: ImplementsEntry[] = []
	const problems: string[] = []
	for (const item of list) {
		const match = typeof item === 'string' ? implementsPattern.exec(item.trim()) : null
		if (match) entries.push({ id: match[1] as string, version: Number(match[2]) })
		else problems.push(`implements ${JSON.stringify(item)} is not <id>@<version>`)
	}
	if (!list.length) problems.push('implements is an empty list')
	return { entries, problems }
}

/** Whether a name fits an interface's cardinality: `<id>` for one, `<id>.<key>` for many. */
export function fitsName(iface: Pick<ReferenceInterface, 'id' | 'cardinality'>, name: string): boolean {
	if (iface.cardinality === 'one') return name === iface.id
	return name.startsWith(`${iface.id}.`) && name.length > iface.id.length + 1 && !name.endsWith(interfaceSuffix)
}

function sectionKey(title: string): string {
	return title.trim().replace(/\s+/g, ' ').toLowerCase()
}

export type DocumentSection = { title: string; unsupported: boolean }

/** Every `##` heading outside a code fence, in order, and whether its first line is `**Unsupported.**`. */
export function documentSections(content: string): DocumentSection[] {
	const found: DocumentSection[] = []
	const visit = (section: Section) => {
		if (section.level === 2) {
			const first = section.body.find((line) => line.trim())
			found.push({ title: section.title, unsupported: first?.trim().startsWith('**Unsupported.**') ?? false })
		}
		for (const child of section.children) visit(child)
	}
	for (const section of parseSections(content, () => {}).children) visit(section)
	return found
}

export type ImplementationFacts = {
	name: string
	version: number
	/** The tier of each layer the resolved document used. */
	tiers: readonly ReferenceTier[]
	/** The resolved document, after every override is merged. */
	content: string
	/** The versions to accept; the interface's own `versions` when omitted. */
	accept?: readonly number[] | undefined
}

/**
 * Checks one resolved implementation against its interface. `unsupported` lists the optional
 * sections it marks `**Unsupported.**` or leaves out, in the interface's order.
 */
export function checkImplementation(
	iface: ReferenceInterface,
	{ name, version, tiers: used, content, accept = iface.versions }: ImplementationFacts,
): { failures: InterfaceCheckFailure[]; unsupported: string[] } {
	const failures: InterfaceCheckFailure[] = []
	const fail = (check: InterfaceCheck, message: string) => failures.push({ check, interface: iface.id, message })
	if (!accept.includes(version)) fail('version', `unknown version ${version}`)
	if (!fitsName(iface, name)) {
		fail('name', `name ${name} is not ${iface.cardinality === 'one' ? iface.id : `${iface.id}.<key>`}`)
	}
	for (const tier of new Set(used)) {
		if (iface.tiers && !iface.tiers.includes(tier)) {
			fail('tier', `the ${tier} tier may not implement ${iface.id} (tiers: ${iface.tiers.join(', ')})`)
		}
	}
	const sections = documentSections(content)
	const declared = iface.sections.map((section) => sectionKey(section.name))
	const unsupported: string[] = []
	for (const section of iface.sections) {
		const present = sections.find((candidate) => sectionKey(candidate.title) === sectionKey(section.name))
		if (section.required) {
			if (!present) fail('required', `missing required section ${section.name}`)
			else if (present.unsupported) fail('required', `required section ${section.name} is marked **Unsupported.**`)
		} else if (!present || present.unsupported) unsupported.push(section.name)
	}
	let last = -1
	let lastTitle = ''
	const seen = new Set<string>()
	for (const section of sections) {
		const key = sectionKey(section.title)
		const index = declared.indexOf(key)
		if (index === -1) {
			fail('known', `unknown section ${section.title}`)
			continue
		}
		if (seen.has(key)) fail('order', `section ${section.title} appears more than once`)
		else if (index < last) fail('order', `section ${section.title} comes after ${lastTitle}`)
		seen.add(key)
		if (index > last) {
			last = index
			lastTitle = section.title
		}
	}
	return { failures, unsupported }
}
